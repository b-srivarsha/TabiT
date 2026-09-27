(function () {
  "use strict";

  const TTK = window.TTK;
  const sound = window.TTKSound;
  const PALETTE = ["#00ffff", "#ffff00", "#ff0000", "#00ff00", "#ffffff"];

  let summary = null;

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function paintPie(canvas, rows, total) {
    const src = document.createElement("canvas");
    src.width = 40;
    src.height = 40;
    const s = src.getContext("2d");
    s.imageSmoothingEnabled = false;
    s.fillStyle = "#000000";
    s.fillRect(0, 0, 40, 40);
    const cx = 20;
    const cy = 20;
    let angle = -Math.PI / 2;
    if (!total) {
      s.fillStyle = "#0000aa";
      s.beginPath();
      s.arc(cx, cy, 18, 0, Math.PI * 2);
      s.fill();
    } else {
      rows.forEach(function (row, i) {
        const slice = (row.ms / total) * Math.PI * 2;
        s.fillStyle = PALETTE[i % PALETTE.length];
        s.beginPath();
        s.moveTo(cx, cy);
        s.arc(cx, cy, 18, angle, angle + slice);
        s.closePath();
        s.fill();
        angle += slice;
      });
      s.fillStyle = "#000000";
      s.beginPath();
      s.arc(cx, cy, 7, 0, Math.PI * 2);
      s.fill();
    }
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  }

  function barList(container, rows, nameFn) {
    container.innerHTML = "";
    const max = rows.reduce(function (m, r) {
      return Math.max(m, r.ms);
    }, 1);
    rows.forEach(function (row, i) {
      const el = document.createElement("div");
      el.className = nameFn ? "day-row" : "site-row";
      const pct = Math.max(row.ms ? 3 : 0, Math.round((row.ms / max) * 100));
      const fillClass = i === 0 && row.ms ? "bar-fill bad" : "bar-fill";
      el.innerHTML =
        "<span>" +
        (nameFn ? nameFn(row) : TTK.pad2(i + 1)) +
        "</span><div class=\"bar-track\"><div class=\"" +
        fillClass +
        "\" style=\"width:" +
        pct +
        "%\"></div></div><span class=\"digits\">" +
        TTK.formatHMS(row.ms) +
        "</span>";
      if (!nameFn) {
        const label = document.createElement("div");
        label.style.gridColumn = "1 / -1";
        label.textContent = row.domain;
        el.insertBefore(label, el.firstChild);
        label.style.gridColumn = "1 / -1";
      }
      container.appendChild(el);
    });
  }

  function render(data) {
    summary = data;
    sound.setEnabled(data.settings && data.settings.sounds);
    document.getElementById("range").textContent = data.rangeLabel;
    document.getElementById("week-total").textContent = TTK.formatHMS(data.weekTotal);

    const worstBox = document.getElementById("worst");
    if (data.worst && data.worst.ms > 0) {
      worstBox.classList.remove("hidden");
      document.getElementById("worst-domain").textContent = data.worst.domain;
      document.getElementById("worst-time").textContent = TTK.formatHMS(data.worst.ms);
    } else {
      worstBox.classList.add("hidden");
    }

    const top = data.top10 || [];
    barList(document.getElementById("top10"), top);

    const others = Object.assign({}, data.weekMerged || {});
    top.forEach(function (row) {
      delete others[row.domain];
    });
    const otherMs = TTK.sumDay(others);
    const pieRows = top.slice();
    if (otherMs > 0) pieRows.push({ domain: "(other)", ms: otherMs });
    paintPie(document.getElementById("pie"), pieRows, data.weekTotal);

    const legend = document.getElementById("legend");
    legend.innerHTML = "";
    pieRows.forEach(function (row, i) {
      const d = document.createElement("div");
      d.className = "legend-row";
      d.innerHTML =
        "<span class=\"swatch\" style=\"background:" +
        PALETTE[i % PALETTE.length] +
        "\"></span>" +
        TTK.esc(row.domain) +
        "  " +
        TTK.formatHMS(row.ms);
      legend.appendChild(d);
    });

    barList(document.getElementById("daily"), data.daily || [], function (r) {
      return r.label;
    });
    barList(document.getElementById("last7"), data.last7Daily || [], function (r) {
      return r.label;
    });
  }

  async function load() {
    const res = await chrome.runtime.sendMessage({ type: "WEEK" });
    if (res && res.ok) render(res.data);
  }

  document.getElementById("btn-csv").addEventListener("click", async function () {
    sound.beep(880, 50);
    const days = await TTK.getDays();
    const keys = (summary && summary.weekKeys) || TTK.weekDateKeys(1);
    download("tab-timekeeper-week.csv", TTK.weekCsv(days, keys), "text/csv");
  });

  document.getElementById("btn-txt").addEventListener("click", function () {
    sound.beep(880, 50);
    if (!summary) return;
    download("tab-timekeeper-week.txt", TTK.weekPlainText(summary), "text/plain");
  });

  function dismiss() {
    sound.beep(440, 60);
    window.close();
  }

  document.getElementById("btn-dismiss").addEventListener("click", dismiss);
  document.getElementById("btn-x").addEventListener("click", dismiss);
  document.addEventListener("keydown", function () {
    /* Classic "press any key" — ignore modifier-only. */
  });

  load();
})();
