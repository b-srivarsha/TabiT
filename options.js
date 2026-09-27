(function () {
  "use strict";

  const TTK = window.TTK;
  const sound = window.TTKSound;
  const weekStart = document.getElementById("week-start");
  const idleTimeout = document.getElementById("idle-timeout");
  const blacklist = document.getElementById("blacklist");
  const sounds = document.getElementById("sounds");
  const status = document.getElementById("status");
  const importFile = document.getElementById("import-file");

  TTK.WEEKDAYS.forEach(function (name, i) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = name;
    weekStart.appendChild(opt);
  });

  function note(msg, ok) {
    status.textContent = msg;
    status.style.color = ok ? "#00ff00" : "#ffff00";
  }

  async function load() {
    const settings = await TTK.getSettings();
    sound.setEnabled(settings.sounds);
    weekStart.value = String(settings.weekStartDay);
    idleTimeout.value = String(settings.idleTimeout);
    blacklist.value = (settings.blacklist || []).join("\n");
    sounds.value = settings.sounds ? "on" : "off";
    note("READY.", true);
  }

  function currentSettings() {
    return {
      weekStartDay: Number(weekStart.value),
      idleTimeout: Number(idleTimeout.value),
      blacklist: blacklist.value.split(/\r?\n/),
      sounds: sounds.value === "on",
    };
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  document.getElementById("btn-save").addEventListener("click", async function () {
    sound.beep(880, 50);
    const res = await chrome.runtime.sendMessage({
      type: "APPLY_SETTINGS",
      settings: currentSettings(),
    });
    if (res && res.ok) {
      sound.setEnabled(res.settings.sounds);
      note("SETTINGS WRITTEN TO LOCAL STORAGE.", true);
    } else {
      note("WRITE FAILED.", false);
    }
  });

  document.getElementById("btn-export").addEventListener("click", async function () {
    sound.beep(660, 50);
    const settings = await TTK.getSettings();
    const days = await TTK.getDays();
    const payload = TTK.exportPayload(settings, days);
    download(
      "tab-timekeeper-backup.json",
      JSON.stringify(payload, null, 2),
      "application/json"
    );
    note("EXPORT COMPLETE.", true);
  });

  document.getElementById("btn-import").addEventListener("click", function () {
    sound.beep(440, 50);
    importFile.click();
  });

  importFile.addEventListener("change", async function () {
    const file = importFile.files && importFile.files[0];
    importFile.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload || (payload.format && payload.format !== "tab-timekeeper-v1")) {
        if (!payload.days) throw new Error("Unrecognized file");
      }
      const res = await chrome.runtime.sendMessage({ type: "IMPORT", payload: payload });
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : "import");
      await load();
      note("IMPORT COMPLETE. COUNTERS RESTORED.", true);
    } catch (err) {
      note("IMPORT FAILED: " + String(err.message || err), false);
    }
  });

  document.getElementById("btn-reset").addEventListener("click", async function () {
    const ok = window.confirm("WIPE ALL TIMERS? THIS CANNOT BE UNDONE.");
    if (!ok) return;
    sound.beep(180, 120);
    const res = await chrome.runtime.sendMessage({ type: "RESET_ALL" });
    if (res && res.ok) note("ALL COUNTERS ZEROED.", true);
    else note("RESET FAILED.", false);
  });

  load();
})();
