(function () {
  "use strict";

  const TTK = window.TTK;
  const sound = window.TTKSound;

  const bootEl = document.getElementById("boot");
  const bootBar = document.getElementById("boot-bar");
  const bootMsg = document.getElementById("boot-msg");
  const mainEl = document.getElementById("main");
  const liveState = document.getElementById("live-state");
  const liveDomain = document.getElementById("live-domain");
  const liveTimer = document.getElementById("live-timer");
  const liveReason = document.getElementById("live-reason");
  const todayTotal = document.getElementById("today-total");
  const rankList = document.getElementById("rank-list");
  const confirmEl = document.getElementById("confirm");

  let snap = null;
  let booted = false;

  function send(type, extra) {
    return chrome.runtime.sendMessage(Object.assign({ type: type }, extra || {}));
  }

  function reasonLabel(reason) {
    const map = {
      active: "CONSOLE FOCUSED",
      idle: "IDLE — CLOCK STOPPED",
      locked: "STATION LOCKED",
      unfocused: "WINDOW NOT FOCUSED",
      minimized: "WINDOW MINIMIZED",
      blacklist: "DOMAIN BLACKLISTED",
      internal: "INTERNAL PAGE — SKIPPED",
      "no-tab": "NO ACTIVE TAB",
      paused: "PAUSED",
      boot: "STANDBY",
    };
    return map[reason] || String(reason || "").toUpperCase();
  }

  function storedPlusLive(baseIncludingSnapLive, snapLive, nowLive) {
    return (baseIncludingSnapLive || 0) - (snapLive || 0) + (nowLive || 0);
  }

  function tick() {
    if (!snap) return;
    const now = Date.now();
    const sessionLiveNow = TTK.liveMs(snap.session, now);
    const sessionLiveSnap = TTK.liveMs(snap.session, snap.now);
    const siteNow = storedPlusLive(
      snap.currentDomainMs,
      sessionLiveSnap,
      snap.session && snap.session.tracking ? sessionLiveNow : 0
    );
    const todayNow = storedPlusLive(
      snap.todayTotal,
      sessionLiveSnap,
      snap.session && snap.session.tracking ? sessionLiveNow : 0
    );
    liveTimer.textContent = TTK.formatHMS(
      snap.session && snap.session.domain ? siteNow : 0
    );
    todayTotal.textContent = TTK.formatHMS(todayNow);
  }

  function render(data) {
    snap = data;
    sound.setEnabled(data.settings && data.settings.sounds);
    const s = data.session || {};
    const tracking = !!(s.tracking && s.domain);
    liveState.textContent = tracking ? "■ TRACKING" : "■ PAUSED";
    liveState.style.color = tracking ? "#00ff00" : "#ffff00";
    liveDomain.textContent = (s.domain || "--------").toUpperCase();
    liveReason.textContent = reasonLabel(s.reason);
    tick();

    rankList.innerHTML = "";
    const rows = data.top5 && data.top5.length ? data.top5 : [];
    if (!rows.length) {
      rankList.textContent = "NO SITES LOGGED TODAY";
      return;
    }
    const max = rows[0].ms || 1;
    rows.forEach(function (row, i) {
      const el = document.createElement("div");
      el.className = "rank-row";
      const pct = Math.max(4, Math.round((row.ms / max) * 100));
      el.innerHTML =
        "<span>" +
        (i + 1) +
        "</span><span class=\"name\"></span><span class=\"digits\">" +
        TTK.formatHMS(row.ms) +
        "</span>" +
        "<div class=\"bar-track\" style=\"grid-column:1/-1\"><div class=\"bar-fill\" style=\"width:" +
        pct +
        "%\"></div></div>";
      el.querySelector(".name").textContent = row.domain;
      el.querySelector(".name").title = row.domain;
      rankList.appendChild(el);
    });
  }

  function bootSequence() {
    const total = 12;
    for (let i = 0; i < total; i++) {
      const b = document.createElement("div");
      b.className = "block";
      bootBar.appendChild(b);
    }
    const msgs = [
      "DETECTING ACTIVE CONSOLE",
      "MOUNTING LOCAL STORAGE",
      "ARMING IDLE TRAP",
      "WATCHDOG ONLINE",
    ];
    let n = 0;
    const id = setInterval(function () {
      n += 1;
      const blocks = bootBar.querySelectorAll(".block");
      blocks.forEach(function (el, i) {
        el.classList.toggle("on", i < n);
      });
      bootMsg.textContent = msgs[Math.min(msgs.length - 1, Math.floor(n / 3))];
      if (n >= total) {
        clearInterval(id);
        bootEl.classList.add("hidden");
        mainEl.classList.remove("hidden");
        booted = true;
        sound.beep(660, 40);
      }
    }, 70);
  }

  async function refresh() {
    const res = await send("STATUS");
    if (res && res.ok) render(res.data);
  }

  document.getElementById("btn-close").addEventListener("click", function () {
    sound.beep(440, 40);
    window.close();
  });

  document.getElementById("btn-report").addEventListener("click", function () {
    sound.beep(1200, 80);
    chrome.tabs.create({ url: chrome.runtime.getURL("report.html") });
  });

  document.getElementById("btn-options").addEventListener("click", function () {
    sound.beep(880, 50);
    chrome.runtime.openOptionsPage();
  });

  document.getElementById("btn-reset").addEventListener("click", function () {
    sound.beep(200, 90);
    confirmEl.classList.remove("hidden");
  });

  document.getElementById("confirm-no").addEventListener("click", function () {
    confirmEl.classList.add("hidden");
  });

  document.getElementById("confirm-yes").addEventListener("click", async function () {
    confirmEl.classList.add("hidden");
    const res = await send("RESET_TODAY");
    if (res && res.ok) render(res.data);
  });

  bootSequence();
  refresh();
  setInterval(tick, 1000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && booted) refresh();
  });
})();
