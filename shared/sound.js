/**
 * Optional PC-speaker square beep. Off unless settings.sounds is true.
 */
(function (root) {
  "use strict";

  let enabled = false;

  function setEnabled(on) {
    enabled = !!on;
  }

  function beep(freq, ms) {
    if (!enabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq || 880;
      gain.gain.value = 0.04;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      const dur = ms || 70;
      setTimeout(function () {
        try {
          osc.stop();
          ctx.close();
        } catch (_e) {}
      }, dur);
    } catch (_e) {}
  }

  root.TTKSound = { setEnabled: setEnabled, beep: beep };
})(typeof self !== "undefined" ? self : this);
