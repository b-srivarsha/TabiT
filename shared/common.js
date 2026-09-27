/**
 * TabiT — shared helpers (service worker + UI pages).
 * Domain grouping, local-day keys, week math, duration formatting, storage.
 */
(function (root) {
  "use strict";

  const KEYS = {
    days: "ttk_days",
    session: "ttk_session",
    settings: "ttk_settings",
  };

  const DEFAULT_SETTINGS = {
    weekStartDay: 1, // Monday
    idleTimeout: 60,
    blacklist: [],
    sounds: false,
  };

  const DEFAULT_SESSION = {
    tracking: false,
    domain: null,
    startedAt: null,
    tabId: null,
    windowId: null,
    reason: "boot",
  };

  const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function localDateKey(date) {
    const d = date instanceof Date ? date : new Date(date);
    return (
      d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
    );
  }

  function parseDateKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  /**
   * Hostname only: strip www, ignore path/query/hash.
   * Returns null for browser-internal and unparseable URLs.
   */
  function hostnameFromUrl(url) {
    if (!url || typeof url !== "string") return null;
    try {
      const u = new URL(url);
      const proto = u.protocol.toLowerCase();
      if (
        proto === "chrome:" ||
        proto === "chrome-extension:" ||
        proto === "edge:" ||
        proto === "brave:" ||
        proto === "about:" ||
        proto === "devtools:" ||
        proto === "moz-extension:" ||
        proto === "view-source:"
      ) {
        return null;
      }
      let host = (u.hostname || "").toLowerCase();
      if (!host) return null;
      if (host.startsWith("www.")) host = host.slice(4);
      return host;
    } catch (_e) {
      return null;
    }
  }

  function normalizeBlacklist(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map(function (s) {
        return String(s || "")
          .trim()
          .toLowerCase()
          .replace(/^www\./, "")
          .replace(/\/.*$/, "");
      })
      .filter(Boolean);
  }

  function isBlacklisted(domain, blacklist) {
    if (!domain) return false;
    const list = normalizeBlacklist(blacklist);
    return list.some(function (entry) {
      return domain === entry || domain.endsWith("." + entry);
    });
  }

  /** Current week (7 local dates) starting on weekStartDay (0=Sun … 6=Sat). */
  function weekDateKeys(weekStartDay, refDate) {
    const ref = refDate ? new Date(refDate) : new Date();
    ref.setHours(0, 0, 0, 0);
    const start = ((weekStartDay % 7) + 7) % 7;
    const diff = (ref.getDay() - start + 7) % 7;
    const begin = new Date(ref);
    begin.setDate(ref.getDate() - diff);
    const keys = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(begin);
      d.setDate(begin.getDate() + i);
      keys.push(localDateKey(d));
    }
    return keys;
  }

  function last7DateKeys(refDate) {
    const ref = refDate ? new Date(refDate) : new Date();
    ref.setHours(0, 0, 0, 0);
    const keys = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(ref);
      d.setDate(ref.getDate() - i);
      keys.push(localDateKey(d));
    }
    return keys;
  }

  /** HH:MM:SS — always 8 characters so layout never shifts. */
  function formatHMS(ms) {
    const total = Math.max(0, Math.floor(Number(ms) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return pad2(h) + ":" + pad2(m) + ":" + pad2(s);
  }

  function formatCompact(ms) {
    const total = Math.max(0, Math.floor(Number(ms) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return h + "h " + pad2(m) + "m";
    if (m > 0) return m + "m " + pad2(s) + "s";
    return "0m " + pad2(s) + "s";
  }

  function sumDay(dayMap) {
    if (!dayMap) return 0;
    let n = 0;
    for (const k in dayMap) {
      if (Object.prototype.hasOwnProperty.call(dayMap, k)) n += dayMap[k] || 0;
    }
    return n;
  }

  function mergeDays(days, dateKeys) {
    const out = {};
    (dateKeys || []).forEach(function (key) {
      const bucket = (days && days[key]) || {};
      for (const domain in bucket) {
        if (!Object.prototype.hasOwnProperty.call(bucket, domain)) continue;
        out[domain] = (out[domain] || 0) + (bucket[domain] || 0);
      }
    });
    return out;
  }

  function rankedDomains(domainMap, limit) {
    const rows = [];
    for (const domain in domainMap) {
      if (!Object.prototype.hasOwnProperty.call(domainMap, domain)) continue;
      rows.push({ domain: domain, ms: domainMap[domain] || 0 });
    }
    rows.sort(function (a, b) {
      return b.ms - a.ms;
    });
    return typeof limit === "number" ? rows.slice(0, limit) : rows;
  }

  async function getSettings() {
    const res = await chrome.storage.local.get(KEYS.settings);
    return Object.assign({}, DEFAULT_SETTINGS, res[KEYS.settings] || {});
  }

  async function setSettings(partial) {
    const cur = await getSettings();
    const next = Object.assign({}, cur, partial);
    next.blacklist = normalizeBlacklist(next.blacklist);
    next.idleTimeout = Math.max(15, Math.min(300, Number(next.idleTimeout) || 60));
    next.weekStartDay = ((Number(next.weekStartDay) % 7) + 7) % 7;
    next.sounds = !!next.sounds;
    await chrome.storage.local.set({ [KEYS.settings]: next });
    return next;
  }

  async function getDays() {
    const res = await chrome.storage.local.get(KEYS.days);
    return res[KEYS.days] || {};
  }

  async function setDays(days) {
    await chrome.storage.local.set({ [KEYS.days]: days || {} });
  }

  async function getSession() {
    const res = await chrome.storage.local.get(KEYS.session);
    return Object.assign({}, DEFAULT_SESSION, res[KEYS.session] || {});
  }

  async function setSession(session) {
    await chrome.storage.local.set({ [KEYS.session]: session });
    return session;
  }

  async function addMs(domain, ms) {
    if (!domain || !ms || ms <= 0) return;
    const days = await getDays();
    const key = localDateKey(new Date());
    if (!days[key]) days[key] = {};
    days[key][domain] = (days[key][domain] || 0) + ms;
    await setDays(days);
  }

  async function resetToday() {
    const days = await getDays();
    delete days[localDateKey(new Date())];
    await setDays(days);
  }

  async function resetAllData() {
    await setDays({});
    await setSession(Object.assign({}, DEFAULT_SESSION, { reason: "reset" }));
  }

  function exportPayload(settings, days) {
    return {
      format: "tab-timekeeper-v1",
      exportedAt: new Date().toISOString(),
      settings: settings,
      days: days,
    };
  }

  function weekCsv(days, dateKeys) {
    const lines = ["date,weekday,domain,seconds"];
    dateKeys.forEach(function (key) {
      const bucket = (days && days[key]) || {};
      const wd = WEEKDAYS[parseDateKey(key).getDay()];
      const domains = Object.keys(bucket).sort();
      if (!domains.length) {
        lines.push([key, wd, "", "0"].join(","));
        return;
      }
      domains.forEach(function (domain) {
        const sec = Math.floor((bucket[domain] || 0) / 1000);
        lines.push(
          [key, wd, csvEscape(domain), String(sec)].join(",")
        );
      });
    });
    return lines.join("\n") + "\n";
  }

  function csvEscape(s) {
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function weekPlainText(summary) {
    const lines = [];
    lines.push("TabiT — WEEKLY TIME AUDIT");
    lines.push("==================================");
    lines.push("Range: " + summary.rangeLabel);
    lines.push("Total: " + formatHMS(summary.weekTotal));
    lines.push("");
    lines.push("TOP SITES");
    summary.top10.forEach(function (row, i) {
      lines.push(
        pad2(i + 1) +
          "  " +
          row.domain.padEnd(28, " ") +
          "  " +
          formatHMS(row.ms)
      );
    });
    lines.push("");
    lines.push("DAILY TOTALS");
    summary.daily.forEach(function (d) {
      lines.push(d.label + "  " + formatHMS(d.ms));
    });
    if (summary.worst) {
      lines.push("");
      lines.push(
        "MOST DISTRACTING: " +
          summary.worst.domain +
          "  " +
          formatHMS(summary.worst.ms)
      );
    }
    lines.push("");
    lines.push("LOCAL DATA ONLY • NO TELEMETRY");
    return lines.join("\n");
  }

  function liveMs(session, now) {
    if (!session || !session.tracking || !session.startedAt) return 0;
    return Math.max(0, (now || Date.now()) - session.startedAt);
  }

  root.TTK = {
    KEYS: KEYS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DEFAULT_SESSION: DEFAULT_SESSION,
    WEEKDAYS: WEEKDAYS,
    pad2: pad2,
    esc: esc,
    localDateKey: localDateKey,
    parseDateKey: parseDateKey,
    hostnameFromUrl: hostnameFromUrl,
    normalizeBlacklist: normalizeBlacklist,
    isBlacklisted: isBlacklisted,
    weekDateKeys: weekDateKeys,
    last7DateKeys: last7DateKeys,
    formatHMS: formatHMS,
    formatCompact: formatCompact,
    sumDay: sumDay,
    mergeDays: mergeDays,
    rankedDomains: rankedDomains,
    getSettings: getSettings,
    setSettings: setSettings,
    getDays: getDays,
    setDays: setDays,
    getSession: getSession,
    setSession: setSession,
    addMs: addMs,
    resetToday: resetToday,
    resetAllData: resetAllData,
    exportPayload: exportPayload,
    weekCsv: weekCsv,
    weekPlainText: weekPlainText,
    liveMs: liveMs,
  };
})(typeof self !== "undefined" ? self : this);
