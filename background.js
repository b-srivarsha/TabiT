/**
 * TabiT — Manifest V3 service worker.
 *
 * Timing model: persist session.startedAt. On any event (or the 1-minute alarm)
 * we add Date.now() - startedAt to the domain bucket. The worker does NOT tick
 * every second. Max drift while asleep is ~1 minute, then we re-check focus/idle.
 */
importScripts("shared/common.js");

const ALARM = "ttk-tick";
const TTK = self.TTK;

/** Serialize storage mutations so overlapping tab/idle events cannot double-count. */
let queue = Promise.resolve();
function locked(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(
    function () {},
    function () {}
  );
  return run;
}

async function setupAlarm() {
  await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
}

async function setupIdle(timeout) {
  const seconds = Math.max(15, Math.min(300, Number(timeout) || 60));
  try {
    chrome.idle.setDetectionInterval(seconds);
  } catch (_e) {
    /* Chromium enforces a 15s minimum; ignore if already set. */
  }
}

async function focusedWindow() {
  try {
    const wins = await chrome.windows.getAll();
    const chromeHasFocus = wins.some(function (w) {
      return w.focused && w.state !== "minimized";
    });
    if (!chromeHasFocus) return null;

    const focusedNormal = wins.find(function (w) {
      return w.focused && w.state !== "minimized" && w.type === "normal";
    });
    if (focusedNormal) return focusedNormal;

    /* Extension popup / options can steal window focus; keep the browser tab. */
    const last = await chrome.windows.getLastFocused({
      windowTypes: ["normal"],
    });
    if (last && last.state !== "minimized") return last;
    return null;
  } catch (_e) {
    return null;
  }
}

async function flush() {
  const session = await TTK.getSession();
  if (session.tracking && session.domain && session.startedAt) {
    const ms = Date.now() - session.startedAt;
    if (ms > 0) await TTK.addMs(session.domain, ms);
    session.startedAt = Date.now();
    session.lastFlush = Date.now();
    await TTK.setSession(session);
  }
}

async function pause(reason) {
  await flush();
  const session = await TTK.getSession();
  session.tracking = false;
  session.startedAt = null;
  session.reason = reason || "paused";
  await TTK.setSession(session);
}

async function evaluate() {
  await flush();
  const settings = await TTK.getSettings();
  await setupIdle(settings.idleTimeout);

  let idleState = "active";
  try {
    idleState = await chrome.idle.queryState(settings.idleTimeout);
  } catch (_e) {
    idleState = "active";
  }

  if (idleState === "locked") {
    await pause("locked");
    return;
  }
  if (idleState === "idle") {
    await pause("idle");
    return;
  }

  const win = await focusedWindow();
  if (!win) {
    await pause("unfocused");
    return;
  }
  if (win.state === "minimized") {
    await pause("minimized");
    return;
  }

  const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
  const tab = tabs && tabs[0];
  if (!tab) {
    await pause("no-tab");
    return;
  }

  const domain = TTK.hostnameFromUrl(tab.url);
  if (!domain) {
    await pause("internal");
    const s = await TTK.getSession();
    s.domain = null;
    s.tabId = tab.id;
    s.windowId = win.id;
    await TTK.setSession(s);
    return;
  }
  if (TTK.isBlacklisted(domain, settings.blacklist)) {
    await pause("blacklist");
    const s = await TTK.getSession();
    s.domain = domain;
    s.tabId = tab.id;
    s.windowId = win.id;
    await TTK.setSession(s);
    return;
  }

  const session = await TTK.getSession();
  const now = Date.now();
  if (session.tracking && session.domain === domain && session.startedAt) {
    session.tabId = tab.id;
    session.windowId = win.id;
    session.reason = "active";
    await TTK.setSession(session);
    return;
  }

  await TTK.setSession({
    tracking: true,
    domain: domain,
    startedAt: now,
    tabId: tab.id,
    windowId: win.id,
    reason: "active",
    lastFlush: now,
  });
}

async function snapshot() {
  await evaluate();
  const settings = await TTK.getSettings();
  const days = await TTK.getDays();
  const session = await TTK.getSession();
  const todayKey = TTK.localDateKey(new Date());
  const todayMap = Object.assign({}, days[todayKey] || {});
  const live = TTK.liveMs(session);
  if (session.tracking && session.domain && live) {
    todayMap[session.domain] = (todayMap[session.domain] || 0) + live;
  }
  const todayTotal = TTK.sumDay(todayMap);
  const top5 = TTK.rankedDomains(todayMap, 5);
  const currentDomainMs =
    session.domain && todayMap[session.domain] ? todayMap[session.domain] : TTK.liveMs(session);
  return {
    settings: settings,
    session: session,
    todayKey: todayKey,
    todayTotal: todayTotal,
    todayMap: todayMap,
    currentDomainMs: currentDomainMs,
    top5: top5,
    now: Date.now(),
  };
}

async function weekSummary() {
  await evaluate();
  const settings = await TTK.getSettings();
  const days = await TTK.getDays();
  const session = await TTK.getSession();
  const weekKeys = TTK.weekDateKeys(settings.weekStartDay);
  const last7 = TTK.last7DateKeys();
  const live = TTK.liveMs(session);
  const todayKey = TTK.localDateKey(new Date());

  function withLive(mapDays, keys) {
    const clone = {};
    keys.forEach(function (k) {
      clone[k] = Object.assign({}, mapDays[k] || {});
    });
    if (session.tracking && session.domain && live) {
      if (!clone[todayKey]) clone[todayKey] = {};
      clone[todayKey][session.domain] =
        (clone[todayKey][session.domain] || 0) + live;
    }
    return clone;
  }

  const weekDays = withLive(days, weekKeys);
  const weekMerged = TTK.mergeDays(weekDays, weekKeys);
  const top10 = TTK.rankedDomains(weekMerged, 10);
  const weekTotal = TTK.sumDay(weekMerged);
  const worst = top10[0] || null;

  const daily = weekKeys.map(function (key) {
    const d = TTK.parseDateKey(key);
    return {
      key: key,
      label: TTK.WEEKDAYS[d.getDay()],
      ms: TTK.sumDay(weekDays[key]),
    };
  });

  const last7Days = withLive(days, last7);
  const last7Daily = last7.map(function (key) {
    const d = TTK.parseDateKey(key);
    return {
      key: key,
      label: TTK.WEEKDAYS[d.getDay()],
      ms: TTK.sumDay(last7Days[key]),
    };
  });

  const rangeLabel =
    weekKeys[0] + " → " + weekKeys[6] + "  (start=" + TTK.WEEKDAYS[settings.weekStartDay] + ")";

  return {
    settings: settings,
    session: session,
    weekKeys: weekKeys,
    last7: last7,
    weekTotal: weekTotal,
    top10: top10,
    daily: daily,
    last7Daily: last7Daily,
    worst: worst,
    rangeLabel: rangeLabel,
    weekMerged: weekMerged,
    now: Date.now(),
  };
}

chrome.runtime.onInstalled.addListener(function () {
  locked(async function () {
    await TTK.setSettings(await TTK.getSettings());
    const session = await TTK.getSession();
    await TTK.setSession(session);
    await setupAlarm();
    await evaluate();
  });
});

chrome.runtime.onStartup.addListener(function () {
  locked(async function () {
    await setupAlarm();
    await evaluate();
  });
});

setupAlarm();
locked(evaluate);

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name !== ALARM) return;
  locked(evaluate);
});

chrome.tabs.onActivated.addListener(function () {
  locked(evaluate);
});

chrome.tabs.onUpdated.addListener(function (_id, change, tab) {
  if (change.url || change.status === "complete") {
    if (tab && tab.active) locked(evaluate);
  }
});

chrome.tabs.onRemoved.addListener(function () {
  locked(evaluate);
});

chrome.windows.onFocusChanged.addListener(function () {
  locked(evaluate);
});

if (chrome.windows.onBoundsChanged) {
  chrome.windows.onBoundsChanged.addListener(function () {
    locked(evaluate);
  });
}

chrome.idle.onStateChanged.addListener(function () {
  locked(evaluate);
});

chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  locked(async function () {
    try {
      if (!msg || !msg.type) {
        sendResponse({ ok: false, error: "NO_TYPE" });
        return;
      }
      if (msg.type === "STATUS") {
        sendResponse({ ok: true, data: await snapshot() });
        return;
      }
      if (msg.type === "WEEK") {
        sendResponse({ ok: true, data: await weekSummary() });
        return;
      }
      if (msg.type === "RESET_TODAY") {
        await pause("reset-today");
        await TTK.resetToday();
        await evaluate();
        sendResponse({ ok: true, data: await snapshot() });
        return;
      }
      if (msg.type === "RESET_ALL") {
        await TTK.resetAllData();
        await evaluate();
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === "APPLY_SETTINGS") {
        const settings = await TTK.setSettings(msg.settings || {});
        await setupIdle(settings.idleTimeout);
        await evaluate();
        sendResponse({ ok: true, settings: settings });
        return;
      }
      if (msg.type === "IMPORT") {
        const payload = msg.payload || {};
        if (payload.settings) await TTK.setSettings(payload.settings);
        if (payload.days && typeof payload.days === "object") {
          await TTK.setDays(payload.days);
        }
        await evaluate();
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ ok: false, error: "UNKNOWN" });
    } catch (err) {
      sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
    }
  });
  return true;
});
