/* effects.js — sound (WebAudio, no asset files), haptics, and confetti.
 * Exposes window.FX. All calls are safe no-ops when muted or unsupported. */
(function () {
  "use strict";
  var muted = localStorage.getItem("ng-muted") === "1";
  var ac = null;

  function ctx() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { ac = null; }
    }
    if (ac && ac.state === "suspended") ac.resume();
    return ac;
  }

  // play a sequence of [freq, startOffset, duration, type]
  function tones(seq) {
    if (muted) return;
    var c = ctx();
    if (!c) return;
    var now = c.currentTime;
    seq.forEach(function (s) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = s[3] || "sine";
      o.frequency.value = s[0];
      var t0 = now + s[1], t1 = t0 + s[2];
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t1);
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t1 + 0.02);
    });
  }

  function vibrate(p) {
    if (!muted && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} }
  }

  /* confetti --------------------------------------------------------- */
  var canvas, cx, parts = [], raf = null;
  function ensureCanvas() {
    if (canvas) return;
    canvas = document.getElementById("fx");
    if (!canvas) return;
    cx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
  }
  function resize() {
    if (!canvas) return;
    var d = window.devicePixelRatio || 1;
    canvas.width = innerWidth * d; canvas.height = innerHeight * d;
    canvas.style.width = innerWidth + "px"; canvas.style.height = innerHeight + "px";
    cx.setTransform(d, 0, 0, d, 0, 0);
  }
  var COLORS = ["#ff6a1a", "#ffc24b", "#2fe6cc", "#8b6df7", "#ffffff", "#34d399"];
  function confetti(n) {
    ensureCanvas();
    if (!cx) return;
    n = n || 130;
    for (var i = 0; i < n; i++) {
      parts.push({
        x: innerWidth / 2 + (Math.random() - 0.5) * 120,
        y: innerHeight * 0.32,
        vx: (Math.random() - 0.5) * 9,
        vy: Math.random() * -11 - 5,
        g: 0.32 + Math.random() * 0.16,
        s: 5 + Math.random() * 7,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.35,
        c: COLORS[(Math.random() * COLORS.length) | 0],
        life: 110 + Math.random() * 40,
      });
    }
    if (!raf) loop();
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    cx.clearRect(0, 0, innerWidth, innerHeight);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
      if (p.life <= 0 || p.y > innerHeight + 40) { parts.splice(i, 1); continue; }
      cx.save();
      cx.translate(p.x, p.y); cx.rotate(p.rot);
      cx.fillStyle = p.c; cx.globalAlpha = Math.min(1, p.life / 40);
      cx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      cx.restore();
    }
    if (!parts.length) { cancelAnimationFrame(raf); raf = null; cx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  /* shake a DOM element -------------------------------------------- */
  function shake(el, cls) {
    if (!el) return;
    cls = cls || "shake";
    el.classList.remove(cls);
    void el.offsetWidth; // reflow to restart animation
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 600);
  }

  window.FX = {
    good: function () { tones([[523, 0, 0.1], [784, 0.09, 0.14]]); vibrate(18); },
    bad: function () { tones([[180, 0, 0.16, "square"]]); vibrate([26, 40, 26]); },
    win: function () { tones([[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1046, 0.36, 0.24]]); vibrate([18, 50, 18, 50, 40]); confetti(150); },
    tick: function () { tones([[660, 0, 0.05, "triangle"]]); },
    confetti: confetti,
    shake: shake,
    isMuted: function () { return muted; },
  };

  /* mute toggle ----------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("mute-btn");
    if (!btn) return;
    function paint() { btn.textContent = muted ? "🔇" : "🔊"; }
    paint();
    btn.addEventListener("click", function () {
      muted = !muted;
      localStorage.setItem("ng-muted", muted ? "1" : "0");
      paint();
      if (!muted) window.FX.good();
    });
  });
})();
