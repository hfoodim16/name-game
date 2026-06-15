/* custom.js — "Custom Category" pass & play mode (honor system).
 * Players pick any category (Movies, Countries, …). There's no database, so
 * after every name the game PAUSES for the table to vote whether it counts.
 * Optional last-letter word chain + timer + match scoring, mirroring the
 * athlete game. Self-contained; reuses shared helpers on window.NameGameApp. */
/* global NameGameRules */
(function () {
  "use strict";
  var App = window.NameGameApp;
  var esc = App.esc;

  var TIMER_OPTS = [[0, "Off"], [30, "30s"], [45, "45s"], [60, "60s"], [90, "90s"]];
  var MATCH_OPTS = [[1, "1"], [2, "2"], [3, "3"], [5, "5"]];
  var SUGGESTIONS = ["Movies", "Countries", "Animals", "Foods", "Car brands", "Cartoon characters", "Cities", "Bands"];

  var C = {
    players: ["Player 1", "Player 2"],
    settings: { category: "", timer: 0, target: 3, letterRule: true },
    state: null,
  };

  function lettersOf(word) {
    return NameGameRules.normalize(word).replace(/[^a-z0-9]/g, "");
  }

  /* ----------------------------------------------------- setup ----------- */
  function openSetup() {
    var s = C.settings;
    var box = document.getElementById("custom-setup-body");
    box.innerHTML =
      '<div class="panel"><h3>Category</h3>' +
      '<label class="field"><span>What are you naming?</span>' +
      '<input type="text" id="cu-cat" maxlength="40" placeholder="e.g. Movies, Countries, Cereal brands" value="' + esc(s.category) + '" /></label>' +
      '<div class="chip-row" id="cu-suggest">' +
      SUGGESTIONS.map(function (x) { return '<button class="chip" data-cat="' + esc(x) + '">' + esc(x) + "</button>"; }).join("") +
      "</div></div>" +
      '<div class="panel"><h3>Players</h3><div id="cu-players" class="players-edit"></div>' +
      '<button class="ghost-btn" id="cu-add">+ Add player</button></div>' +
      '<div class="panel"><h3>Rules</h3>' +
      '<p class="settings-label">Word chain <span style="opacity:.7">(next name starts with the previous name’s last letter)</span></p>' +
      '<div class="seg" id="cu-chain">' +
      '<button data-chain="1" class="' + (s.letterRule ? "on" : "") + '">On</button>' +
      '<button data-chain="0" class="' + (!s.letterRule ? "on" : "") + '">Off</button></div>' +
      '<p class="settings-label" style="margin-top:14px">Turn timer</p>' +
      '<div class="chip-row" id="cu-timer">' +
      TIMER_OPTS.map(function (o) { return '<button class="chip ' + (s.timer === o[0] ? "on" : "") + '" data-timer="' + o[0] + '">' + o[1] + "</button>"; }).join("") +
      "</div>" +
      '<p class="settings-label" style="margin-top:14px">Match length <span style="opacity:.7">(rounds to win)</span></p>' +
      '<div class="chip-row" id="cu-match">' +
      MATCH_OPTS.map(function (o) { return '<button class="chip ' + (s.target === o[0] ? "on" : "") + '" data-match="' + o[0] + '">first to ' + o[1] + "</button>"; }).join("") +
      "</div></div>" +
      '<button class="primary-btn big" id="cu-start">Start Game</button>' +
      '<p class="hint" id="cu-hint"></p>';

    renderPlayers();
    var cat = document.getElementById("cu-cat");
    cat.addEventListener("input", function () { s.category = cat.value; });
    box.querySelectorAll("[data-cat]").forEach(function (b) {
      b.onclick = function () { s.category = b.getAttribute("data-cat"); cat.value = s.category; };
    });
    document.getElementById("cu-add").onclick = function () {
      if (C.players.length < 12) { C.players.push("Player " + (C.players.length + 1)); renderPlayers(); }
    };
    seg(box, "cu-chain", "chain", function (v) { s.letterRule = v === "1"; });
    chips(box, "cu-timer", "timer", function (v) { s.timer = parseInt(v, 10); });
    chips(box, "cu-match", "match", function (v) { s.target = parseInt(v, 10); });
    document.getElementById("cu-start").onclick = startMatch;
  }

  function seg(box, id, attr, set) {
    box.querySelectorAll("#" + id + " [data-" + attr + "]").forEach(function (b) {
      b.onclick = function () {
        set(b.getAttribute("data-" + attr));
        box.querySelectorAll("#" + id + " [data-" + attr + "]").forEach(function (x) { x.classList.toggle("on", x === b); });
      };
    });
  }
  var chips = seg;

  function renderPlayers() {
    var box = document.getElementById("cu-players");
    box.innerHTML = C.players.map(function (n, i) {
      return '<div class="player-row"><input type="text" maxlength="20" value="' + esc(n) + '" data-pi="' + i + '" placeholder="Player ' + (i + 1) + '" />' +
        (C.players.length > 2 ? '<button class="remove" data-rm="' + i + '">×</button>' : "") + "</div>";
    }).join("");
    box.querySelectorAll("[data-pi]").forEach(function (inp) {
      inp.addEventListener("input", function () { C.players[+inp.getAttribute("data-pi")] = inp.value; });
    });
    box.querySelectorAll("[data-rm]").forEach(function (b) {
      b.onclick = function () { C.players.splice(+b.getAttribute("data-rm"), 1); renderPlayers(); };
    });
  }

  /* ----------------------------------------------------- match / round --- */
  function startMatch() {
    var names = C.players.map(function (n) { return (n || "").trim(); }).filter(Boolean);
    if (!C.settings.category.trim()) { document.getElementById("cu-hint").textContent = "Enter a category first."; return; }
    if (names.length < 2) { document.getElementById("cu-hint").textContent = "Add at least 2 players."; return; }
    C.state = {
      category: C.settings.category.trim(),
      letterRule: C.settings.letterRule,
      timerSecs: C.settings.timer,
      target: C.settings.target,
      players: names.map(function (n) { return { name: n, alive: true }; }),
      scores: names.map(function () { return 0; }),
      round: 0, turn: 0, requiredLetter: "", used: new Set(),
      history: [], deadline: 0, remaining: 0, paused: false, pending: null, tick: null,
    };
    App.showScreen("custom-game");
    startRound();
  }

  function startRound() {
    var s = C.state;
    s.round++;
    s.players.forEach(function (p) { p.alive = true; });
    s.requiredLetter = ""; s.used = new Set(); s.history = []; s.pending = null; s.paused = false;
    s.turn = (s.round - 1) % s.players.length;
    beginTurn();
  }

  function alive() { return C.state.players.filter(function (p) { return p.alive; }); }

  function startTick() {
    var s = C.state;
    if (s.tick) clearInterval(s.tick);
    s.tick = setInterval(function () {
      if (s.paused || s.pending) return;
      var left = Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000));
      paintTimer(left);
      if (left <= 0) { clearInterval(s.tick); s.tick = null; var p = s.players[s.turn]; p.alive = false; s.history.unshift({ t: "out", player: p.name, reason: "ran out of time" }); advanceTurn(); }
    }, 250);
  }

  function beginTurn() {
    var s = C.state;
    if (s.tick) { clearInterval(s.tick); s.tick = null; }
    if (alive().length <= 1) return endRound();
    while (!s.players[s.turn].alive) s.turn = (s.turn + 1) % s.players.length;
    s.paused = false; s.pending = null;
    if (s.timerSecs > 0) { s.deadline = Date.now() + s.timerSecs * 1000; startTick(); } else { s.deadline = 0; }
    render();
    var inp = document.getElementById("cu-guess"); if (inp) inp.focus();
  }
  function advanceTurn() {
    var s = C.state;
    do { s.turn = (s.turn + 1) % s.players.length; } while (!s.players[s.turn].alive);
    beginTurn();
  }

  function submit() {
    var s = C.state;
    if (s.paused || s.pending) return;
    var inp = document.getElementById("cu-guess");
    var fb = document.getElementById("cu-feedback");
    var raw = (inp.value || "").trim();
    var key = lettersOf(raw);
    if (!key) { fb.textContent = "Type a name."; fb.className = "feedback bad"; return; }
    if (s.used.has(key)) { fb.textContent = '"' + raw + '" was already said. No repeats!'; fb.className = "feedback bad"; bad(); return; }
    if (s.letterRule && s.requiredLetter) {
      var got = key[0].toUpperCase();
      if (got !== s.requiredLetter) { fb.textContent = "Must start with " + s.requiredLetter + " — “" + raw + "” starts with " + got + "."; fb.className = "feedback bad"; bad(); return; }
    }
    // letter-valid -> pause for the table to judge if it fits the category
    if (s.timerSecs > 0) s.remaining = Math.max(0, s.deadline - Date.now());
    if (s.tick) { clearInterval(s.tick); s.tick = null; }
    s.pending = { word: raw, key: key, nextLetter: key.slice(-1).toUpperCase() };
    render();
  }

  function resolve(counts) {
    var s = C.state;
    var pend = s.pending; s.pending = null;
    if (!pend) return;
    if (counts) {
      s.used.add(pend.key);
      s.history.unshift({ t: "said", player: s.players[s.turn].name, name: pend.word });
      if (s.letterRule) s.requiredLetter = pend.nextLetter;
      if (window.FX) FX.good();
      advanceTurn();
    } else {
      // doesn't count — same player goes again
      if (window.FX) FX.bad();
      s.paused = false;
      if (s.timerSecs > 0) { s.deadline = Date.now() + (s.remaining || s.timerSecs * 1000); startTick(); }
      render();
      var inp = document.getElementById("cu-guess"); if (inp) { inp.value = ""; inp.focus(); }
    }
  }

  function giveUp() {
    var s = C.state;
    if (s.tick) { clearInterval(s.tick); s.tick = null; }
    var p = s.players[s.turn]; p.alive = false;
    s.history.unshift({ t: "out", player: p.name, reason: "gave up" });
    advanceTurn();
  }
  function pause() { var s = C.state; if (s.paused || s.pending) return; if (s.timerSecs > 0) s.remaining = Math.max(0, s.deadline - Date.now()); if (s.tick) { clearInterval(s.tick); s.tick = null; } s.paused = true; render(); }
  function resume() { var s = C.state; s.paused = false; if (s.timerSecs > 0) { s.deadline = Date.now() + (s.remaining || s.timerSecs * 1000); startTick(); } render(); var inp = document.getElementById("cu-guess"); if (inp) inp.focus(); }

  function endRound() {
    var s = C.state;
    if (s.tick) { clearInterval(s.tick); s.tick = null; }
    var w = -1; for (var i = 0; i < s.players.length; i++) if (s.players[i].alive) { w = i; break; }
    if (w >= 0) s.scores[w]++;
    if (window.FX) FX.win();
    var champ = w >= 0 && s.scores[w] >= s.target;
    var box = document.getElementById("cu-game");
    var rows = s.players.map(function (p, i) { return { name: p.name, score: s.scores[i] }; });
    if (champ) {
      box.innerHTML = '<div class="winner-banner"><div class="trophy">🏆</div><h2>' + esc(s.players[w].name) + " wins the match!</h2><p class=\"hint\">Category: " + esc(s.category) + "</p></div>" +
        App.scoreboardHtml(rows, s.target) + '<div style="height:14px"></div><button class="primary-btn big" id="cu-newmatch">New match</button>';
      document.getElementById("cu-newmatch").onclick = startMatch;
    } else {
      box.innerHTML = '<div class="winner-banner round"><div class="trophy">🎉</div><h2>' + (w >= 0 ? esc(s.players[w].name) + " takes round " + s.round : "Round over") + "</h2><p class=\"hint\">First to " + s.target + " wins.</p></div>" +
        App.scoreboardHtml(rows, s.target) + '<div style="height:14px"></div><button class="primary-btn big" id="cu-next">Next round →</button>';
      document.getElementById("cu-next").onclick = startRound;
    }
  }

  /* ----------------------------------------------------- render ---------- */
  function paintTimer(left) {
    var s = C.state, fill = document.getElementById("cu-fill"), num = document.getElementById("cu-num");
    if (!fill) return;
    fill.style.width = (left / (s.timerSecs || 30)) * 100 + "%";
    fill.classList.toggle("warn", left <= 10); num.classList.toggle("warn", left <= 10);
    num.textContent = left + "s";
    if (left <= 5 && left > 0 && left !== C._lt && window.FX) FX.tick(); C._lt = left;
  }
  function bad() { if (window.FX) { FX.bad(); FX.shake(document.querySelector("#cu-game .turn-card")); } }

  function historyC(h) {
    if (!h.length) return "";
    return '<div class="history"><h3>Play-by-play</h3>' + h.map(function (x) {
      if (x.t === "out") return '<div class="hrow out">⛔ ' + esc(x.player) + " " + esc(x.reason) + "</div>";
      return '<div class="hrow"><span class="who">' + esc(x.player) + '</span><span class="nm">' + esc(x.name) + "</span><span class=\"lg\">✓</span></div>";
    }).join("") + "</div>";
  }

  function render() {
    var s = C.state, cur = s.players[s.turn];
    var box = document.getElementById("cu-game");
    var timerHtml = s.timerSecs > 0
      ? '<div class="timer-wrap"><div class="timer-bar"><div class="timer-fill" id="cu-fill"></div></div><div class="timer-num" id="cu-num">' + s.timerSecs + "s</div></div>"
      : '<div class="no-timer">⏱ No time limit — tap “Stuck” to pass</div>';

    var middle;
    if (s.pending) {
      middle = '<div class="overlay-panel challenge"><div class="op-title">🗳️ Does it count?</div>' +
        '<p class="op-sub"><b>' + esc(cur.name) + '</b> said <b>“' + esc(s.pending.word) + '”</b>. Table, decide together — does it fit <b>' + esc(s.category) + "</b>?</p>" +
        '<div class="op-actions"><button class="primary-btn" data-c="1">✓ It counts</button><button class="ghost-btn" data-c="0">✗ Doesn’t count</button></div></div>';
    } else if (s.paused) {
      middle = '<div class="overlay-panel"><div class="op-title">⏸ Paused</div><button class="primary-btn" id="cu-resume">Resume</button></div>';
    } else {
      middle = '<div class="guess-row"><input type="text" id="cu-guess" placeholder="Name a ' + esc(s.category) + '…" autocomplete="off" />' +
        '<button class="primary-btn" id="cu-go">Go</button></div><div class="feedback" id="cu-feedback"></div>' +
        '<div class="ctl-row"><button class="ctl-btn" id="cu-pause">⏸ Pause</button><button class="ctl-btn danger" id="cu-stuck">🏳 Stuck</button></div>';
    }

    box.innerHTML =
      App.roundTag(s.round, s.players.map(function (p, i) { return { name: p.name, score: s.scores[i] }; }), s.target) +
      App.strip(s.players, s.turn) +
      '<div class="turn-card">' +
      '<div class="turn-player">Now up</div><div class="turn-name">' + esc(cur.name) + "</div>" +
      '<div class="letter-cap">Name a <b>' + esc(s.category) + "</b>" + (s.letterRule && s.requiredLetter ? " starting with" : "") + "</div>" +
      (s.letterRule && s.requiredLetter ? '<div class="letter-badge">' + s.requiredLetter + "</div>" : "") +
      timerHtml + middle + "</div>" + historyC(s.history);

    if (s.pending) {
      box.querySelectorAll("[data-c]").forEach(function (b) { b.onclick = function () { resolve(b.getAttribute("data-c") === "1"); }; });
    } else if (s.paused) {
      document.getElementById("cu-resume").onclick = resume;
    } else {
      document.getElementById("cu-go").onclick = submit;
      var inp = document.getElementById("cu-guess");
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
      document.getElementById("cu-pause").onclick = pause;
      document.getElementById("cu-stuck").onclick = giveUp;
      if (s.timerSecs > 0) paintTimer(Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000)));
    }
  }

  window.NameGameCustom = { openSetup: openSetup };
})();
