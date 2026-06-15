/* global io */
(function () {
  "use strict";
  var App = window.NameGameApp;
  var esc = App.esc;

  var socket = null;
  var O = {
    room: null,
    myId: null,
    gameType: "athlete",
    settings: { leagues: ["NBA", "MLB", "NFL", "NHL", "SOC", "CFB", "CBB"], era: "both", timer: 30, target: 3 },
    customSettings: { category: "", letterRule: true, timer: 30, target: 3 },
    tick: null,
  };
  window.NameGameOnline = O;

  function connect() {
    if (socket) return socket;
    socket = io(window.NG_SERVER || undefined); // remote in native shell, same-origin on web
    O.myId = null;
    socket.on("connect", function () { O.myId = socket.id; });
    socket.on("room:update", function (room) {
      O.room = room;
      renderRoom();
    });
    return socket;
  }

  function err(msg) {
    var e = document.getElementById("online-error");
    if (e) { e.textContent = msg || ""; e.className = "hint error"; }
  }

  function nameVal() {
    return (document.getElementById("online-name").value || "").trim() || "Player";
  }

  O.prefillJoin = function (code) {
    App.showScreen("online-home");
    document.getElementById("online-code").value = code.toUpperCase();
  };

  function wire() {
    document.querySelectorAll("#online-type [data-type]").forEach(function (b) {
      b.onclick = function () {
        O.gameType = b.getAttribute("data-type");
        document.querySelectorAll("#online-type [data-type]").forEach(function (x) { x.classList.toggle("on", x === b); });
      };
    });
    document.getElementById("online-create").onclick = function () {
      err("");
      if (O.gameType === "custom" && !O.customSettings.category.trim()) {
        // let them set the category in the lobby; default a placeholder prompt
      }
      connect().emit(
        "room:create",
        { name: nameVal(), gameType: O.gameType, settings: O.gameType === "custom" ? O.customSettings : O.settings },
        function (res) {
          if (res && res.ok) {
            O.room = res.room;
            enterRoom();
          } else err((res && res.message) || "Could not create room.");
        }
      );
    };
    document.getElementById("online-join").onclick = function () {
      err("");
      var code = (document.getElementById("online-code").value || "").trim().toUpperCase();
      if (code.length !== 4) return err("Enter the 4-letter room code.");
      connect().emit("room:join", { code: code, name: nameVal() }, function (res) {
        if (res && res.ok) {
          O.room = res.room;
          enterRoom();
        } else err((res && res.message) || "Could not join.");
      });
    };
    document.getElementById("online-leave").onclick = function () {
      if (socket) { socket.disconnect(); socket = null; }
      if (O.tick) clearInterval(O.tick);
      O.room = null;
      App.showScreen("online-home");
    };
  }

  var C_TIMER = [[0, "Off"], [30, "30s"], [45, "45s"], [60, "60s"], [90, "90s"]];
  var C_MATCH = [[1, "1"], [2, "2"], [3, "3"], [5, "5"]];
  function renderCustomSettings(el, s, onChange, editable) {
    if (s.timer == null) s.timer = 30;
    if (s.target == null) s.target = 3;
    if (s.letterRule == null) s.letterRule = true;
    if (editable === false) {
      el.innerHTML = "<h3>Settings</h3>" +
        '<p class="settings-label">Category: <b>' + esc(s.category || "—") + "</b></p>" +
        '<p class="settings-label">Word chain: <b>' + (s.letterRule ? "On" : "Off") + "</b></p>" +
        '<p class="settings-label">Turn timer: <b>' + (s.timer ? s.timer + " seconds" : "Off") + "</b></p>" +
        '<p class="settings-label">Match: <b>first to ' + s.target + "</b></p>";
      return;
    }
    el.innerHTML = "<h3>Settings</h3>" +
      '<label class="field"><span>Category</span><input type="text" id="oc-cat" maxlength="40" placeholder="e.g. Movies, Countries" value="' + esc(s.category || "") + '" /></label>' +
      '<p class="settings-label">Word chain <span style="opacity:.7">(next starts with previous last letter)</span></p>' +
      '<div class="seg" data-oc-chain><button data-v="1" class="' + (s.letterRule ? "on" : "") + '">On</button><button data-v="0" class="' + (!s.letterRule ? "on" : "") + '">Off</button></div>' +
      '<p class="settings-label" style="margin-top:14px">Turn timer</p>' +
      '<div class="chip-row" data-oc-timer>' + C_TIMER.map(function (o) { return '<button class="chip ' + (s.timer === o[0] ? "on" : "") + '" data-v="' + o[0] + '">' + o[1] + "</button>"; }).join("") + "</div>" +
      '<p class="settings-label" style="margin-top:14px">Match length</p>' +
      '<div class="chip-row" data-oc-match>' + C_MATCH.map(function (o) { return '<button class="chip ' + (s.target === o[0] ? "on" : "") + '" data-v="' + o[0] + '">first to ' + o[1] + "</button>"; }).join("") + "</div>";
    var cat = document.getElementById("oc-cat");
    cat.addEventListener("input", function () { s.category = cat.value; onChange && onChange(s); });
    function seg(sel, set) {
      el.querySelectorAll(sel + " [data-v]").forEach(function (b) {
        b.onclick = function () { set(b.getAttribute("data-v")); el.querySelectorAll(sel + " [data-v]").forEach(function (x) { x.classList.toggle("on", x === b); }); onChange && onChange(s); };
      });
    }
    seg("[data-oc-chain]", function (v) { s.letterRule = v === "1"; });
    seg("[data-oc-timer]", function (v) { s.timer = parseInt(v, 10); });
    seg("[data-oc-match]", function (v) { s.target = parseInt(v, 10); });
  }

  function enterRoom() {
    document.getElementById("room-code-badge").textContent = O.room.code;
    App.showScreen("online-room");
    renderRoom();
  }

  function isHost() {
    return O.room && O.room.hostId === O.myId;
  }

  function renderRoom() {
    var room = O.room;
    if (!room) return;
    document.getElementById("room-code-badge").textContent = room.code;
    var box = document.getElementById("online-room");

    if ((room.status === "ended" || room.status === "roundover") &&
        O._prevStatus !== room.status && window.FX) FX.win();

    // achievements: record my round / match wins as they happen
    if (O._prevStatus !== room.status && window.NameGameAccount) {
      var meP = room.players.find(function (p) { return p.id === O.myId; });
      var myTeam = meP ? meP.team : null;
      var iWonRound = room.teams > 0 ? (myTeam != null && myTeam === room.roundWinnerTeam) : room.roundWinnerId === O.myId;
      var iWonMatch = room.teams > 0 ? (myTeam != null && myTeam === room.winnerTeam) : room.winnerId === O.myId;
      if (room.status === "roundover" && iWonRound) NameGameAccount.recordRoundWin();
      if (room.status === "ended" && iWonMatch) {
        var specialist = room.settings.leagues && room.settings.leagues.length === 1;
        var flawless = room.teams > 0
          ? room.scores.every(function (s) { return s.id === "team" + myTeam || s.score === 0; })
          : room.scores.filter(function (s) { return s.id !== O.myId; }).every(function (s) { return s.score === 0; });
        NameGameAccount.recordMatchWin({ flawless: flawless, specialist: specialist });
      }
    }
    O._prevStatus = room.status;

    if (room.status === "lobby") return renderLobby(box, room);
    if (room.status === "roundover") return renderRoundOver(box, room);
    if (room.status === "ended") return renderEnded(box, room);
    return renderGame(box, room);
  }

  function renderLobby(box, room) {
    if (O.tick) { clearInterval(O.tick); O.tick = null; }
    var link = location.origin + "/?room=" + room.code;
    box.innerHTML =
      '<div class="panel"><h3>Invite players</h3>' +
      '<p class="hint" style="text-align:left">Share this code or link. Players open it and tap Join.</p>' +
      '<div class="code-hero"><div class="settings-label">Room code</div><div class="big-code">' + esc(room.code) + "</div></div>" +
      '<div class="invite-box"><input type="text" readonly value="' + esc(link) + '" id="invite-link" />' +
      '<button class="primary-btn copy-btn" id="copy-link">Copy</button></div></div>' +
      '<div class="panel"><h3>Players (' + room.players.length + ")</h3>" +
      '<div class="players-strip">' +
      room.players.map(function (p) {
        return '<span class="pill ' + (p.isHost ? "host" : "") + '">' + esc(p.name) + "</span>";
      }).join("") +
      "</div></div>" +
      '<div class="panel" id="online-settings"></div>' +
      (isHost()
        ? '<button class="primary-btn big" id="online-start">Start Game</button>' +
          '<p class="hint" id="online-start-hint"></p>'
        : '<p class="hint">Waiting for the Admin to start…</p>');

    // settings: editable for host, read-only for others
    var setEl = document.getElementById("online-settings");
    if (room.gameType === "custom") {
      renderCustomSettings(setEl, isHost() ? O.customSettings : room.settings,
        isHost() ? function (s) { socket.emit("room:settings", { gameType: "custom", settings: s }); } : null,
        isHost());
    } else {
      App.renderSettings(setEl, isHost() ? O.settings : room.settings,
        isHost() ? function (s) { socket.emit("room:settings", { gameType: "athlete", settings: s }); } : null,
        isHost());
    }

    document.getElementById("copy-link").onclick = function () {
      var inp = document.getElementById("invite-link");
      inp.select();
      navigator.clipboard && navigator.clipboard.writeText(inp.value);
      document.getElementById("copy-link").textContent = "Copied!";
    };

    if (isHost()) {
      var startBtn = document.getElementById("online-start");
      var needCat = room.gameType === "custom" && !(room.settings.category || "").trim();
      startBtn.disabled = room.players.length < 2 || needCat;
      document.getElementById("online-start-hint").textContent =
        room.players.length < 2 ? "Need at least 2 players to start." :
        needCat ? "Enter a category to start." : "";
      startBtn.onclick = function () { socket.emit("game:start"); };
    }
  }

  function renderGame(box, room) {
    if (room.gameType === "custom") return renderCustomGame(box, room);
    var meTurn = room.currentPlayerId === O.myId;
    var curPlayer = room.players.find(function (p) { return p.id === room.currentPlayerId; });
    var players = room.players.map(function (p) { return { name: p.name, alive: p.alive, team: p.team }; });
    var curIdx = room.players.findIndex(function (p) { return p.id === room.currentPlayerId; });
    var secs = room.settings.timer;

    if ((room.paused || room.challenge) && O.tick) { clearInterval(O.tick); O.tick = null; }

    var timerHtml = secs > 0
      ? '<div class="timer-wrap"><div class="timer-bar"><div class="timer-fill" id="on-timer-fill"></div></div>' +
        '<div class="timer-num" id="on-timer-num">' + secs + "s</div></div>"
      : '<div class="no-timer">⏱ No time limit' + (meTurn ? " — tap “Stuck” if you can’t go" : "") + "</div>";

    var middle;
    if (room.challenge) {
      middle = App.challengePanel(room.challenge);
    } else if (room.paused) {
      middle = '<div class="overlay-panel"><div class="op-title">⏸ Paused</div>' +
        '<button class="primary-btn" id="on-resume">Resume</button></div>';
    } else {
      middle =
        (meTurn
          ? '<div class="guess-row"><input type="text" id="on-guess" placeholder="Type an athlete’s name…" autocomplete="off" />' +
            '<button class="primary-btn" id="on-submit">Go</button></div>'
          : '<div class="feedback">Waiting for ' + esc(curPlayer ? curPlayer.name : "player") + "…</div>") +
        '<div class="feedback" id="on-feedback"></div>' +
        '<div class="ctl-row">' +
        '<button class="ctl-btn" id="on-pause">⏸ Pause</button>' +
        '<button class="ctl-btn" id="on-challenge">🚩 Challenge</button>' +
        (meTurn ? '<button class="ctl-btn danger" id="on-stuck">🏳 Stuck</button>' : "") +
        "</div>";
    }

    box.innerHTML =
      App.roundTag(room.round, scoreRows(room), room.settings.target) +
      App.strip(players, curIdx) +
      '<div class="turn-card">' +
      '<div class="turn-player' + (meTurn ? " you" : "") + '">' + (meTurn ? "Your turn" : "Now up") + "</div>" +
      '<div class="turn-name">' + esc(curPlayer ? curPlayer.name : "—") + "</div>" +
      (room.requiredLetter
        ? '<div class="letter-cap">First name must start with</div><div class="letter-badge">' + room.requiredLetter + "</div>"
        : '<div class="letter-cap">Opening turn — name any eligible athlete</div>') +
      timerHtml + middle +
      "</div>" +
      App.historyHtml(room.history);

    if (room.challenge) {
      App.wireChallenge("online-room", function (decision) {
        socket.emit("game:resolve", { decision: decision });
      });
    } else if (room.paused) {
      document.getElementById("on-resume").onclick = function () { socket.emit("game:resume"); };
    } else {
      if (meTurn) {
        var input = document.getElementById("on-guess");
        var submit = function () {
          var fb = document.getElementById("on-feedback");
          var hadDeadline = room.deadlineTs;
          socket.emit("game:guess", { guess: input.value }, function (res) {
            if (res && !res.ok) {
              fb.textContent = res.message; fb.className = "feedback bad";
              if (window.FX) { FX.bad(); FX.shake(document.querySelector("#online-room .turn-card")); }
            } else {
              if (window.FX) FX.good();
              if (hadDeadline && hadDeadline - Date.now() < 2000 && window.NameGameAccount) {
                NameGameAccount.recordFeat("buzzer");
              }
            }
          });
        };
        document.getElementById("on-submit").onclick = submit;
        input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
        input.focus();
        var sb = document.getElementById("on-stuck");
        if (sb) sb.onclick = function () { socket.emit("game:giveup"); };
      }
      document.getElementById("on-pause").onclick = function () { socket.emit("game:pause"); };
      document.getElementById("on-challenge").onclick = function () { socket.emit("game:challenge"); };
      if (secs > 0) startTimer(room.deadlineTs);
    }
  }

  function scoreRows(room) {
    return room.scores.map(function (s) {
      return { name: s.name, score: s.score, you: s.id === O.myId };
    });
  }

  function teamName(i) { return "Team " + ["A", "B", "C", "D"][i]; }
  function roundWinnerName(room) {
    if (room.teams > 0) return room.roundWinnerTeam >= 0 ? teamName(room.roundWinnerTeam) : null;
    var rw = room.players.find(function (p) { return p.id === room.roundWinnerId; });
    return rw ? rw.name : null;
  }
  function matchWinnerName(room) {
    if (room.teams > 0) return room.winnerTeam >= 0 ? teamName(room.winnerTeam) : null;
    var w = room.players.find(function (p) { return p.id === room.winnerId; });
    return w ? w.name : null;
  }

  function renderRoundOver(box, room) {
    if (O.tick) { clearInterval(O.tick); O.tick = null; }
    var rwName = roundWinnerName(room);
    box.innerHTML =
      '<div class="winner-banner round"><div class="trophy">🎉</div><h2>' +
      (rwName ? esc(rwName) + " takes round " + room.round : "Round over") +
      '</h2><p class="hint">First to ' + room.settings.target +
      " wins · next round starts automatically…</p></div>" +
      App.scoreboardHtml(scoreRows(room), room.settings.target) +
      '<div style="height:14px"></div>' +
      (isHost()
        ? '<button class="primary-btn big" id="online-next">Next round now →</button>'
        : '<p class="hint">Waiting for the next round…</p>');
    if (isHost())
      document.getElementById("online-next").onclick = function () { socket.emit("game:nextround"); };
  }

  function renderCustomGame(box, room) {
    var meTurn = room.currentPlayerId === O.myId;
    var cur = room.players.find(function (p) { return p.id === room.currentPlayerId; });
    var players = room.players.map(function (p) { return { name: p.name, alive: p.alive, team: p.team }; });
    var curIdx = room.players.findIndex(function (p) { return p.id === room.currentPlayerId; });
    var cat = room.settings.category || "anything";
    var secs = room.settings.timer;
    var d = room.decide;
    if ((d || room.paused) && O.tick) { clearInterval(O.tick); O.tick = null; }

    var timerHtml = d
      ? ""
      : secs > 0
        ? '<div class="timer-wrap"><div class="timer-bar"><div class="timer-fill" id="on-timer-fill"></div></div><div class="timer-num" id="on-timer-num">' + secs + "s</div></div>"
        : '<div class="no-timer">⏱ No time limit' + (meTurn ? " — tap “Stuck” if you can’t go" : "") + "</div>";

    var middle;
    if (d) {
      if (d.byId === O.myId) {
        middle = '<div class="overlay-panel"><div class="op-title">🗳️ Waiting on the table…</div>' +
          '<p class="op-sub">Does <b>“' + esc(d.word) + '”</b> fit <b>' + esc(cat) + "</b>? The others are deciding.</p></div>";
      } else {
        middle = '<div class="overlay-panel challenge"><div class="op-title">🗳️ Does it count?</div>' +
          '<p class="op-sub"><b>' + esc(d.byName) + '</b> said <b>“' + esc(d.word) + '”</b>. Does it fit <b>' + esc(cat) + "</b>?</p>" +
          '<div class="op-actions"><button class="primary-btn" data-d="1">✓ It counts</button><button class="ghost-btn" data-d="0">✗ Doesn’t count</button></div></div>';
      }
    } else if (room.paused) {
      middle = '<div class="overlay-panel"><div class="op-title">⏸ Paused</div><button class="primary-btn" id="on-resume">Resume</button></div>';
    } else {
      middle = (meTurn
        ? '<div class="guess-row"><input type="text" id="on-guess" placeholder="Name a ' + esc(cat) + '…" autocomplete="off" /><button class="primary-btn" id="on-submit">Go</button></div>'
        : '<div class="feedback">Waiting for ' + esc(cur ? cur.name : "player") + "…</div>") +
        '<div class="feedback" id="on-feedback"></div>' +
        '<div class="ctl-row"><button class="ctl-btn" id="on-pause">⏸ Pause</button>' +
        (meTurn ? '<button class="ctl-btn danger" id="on-stuck">🏳 Stuck</button>' : "") + "</div>";
    }

    box.innerHTML =
      App.roundTag(room.round, scoreRows(room), room.settings.target) +
      App.strip(players, curIdx) +
      '<div class="turn-card">' +
      '<div class="turn-player' + (meTurn ? " you" : "") + '">' + (meTurn ? "Your turn" : "Now up") + "</div>" +
      '<div class="turn-name">' + esc(cur ? cur.name : "—") + "</div>" +
      '<div class="letter-cap">Name a <b>' + esc(cat) + "</b>" + (room.settings.letterRule && room.requiredLetter ? " starting with" : "") + "</div>" +
      (room.settings.letterRule && room.requiredLetter ? '<div class="letter-badge">' + room.requiredLetter + "</div>" : "") +
      timerHtml + middle + "</div>" +
      App.historyHtml(room.history);

    if (d) {
      if (d.byId !== O.myId) {
        box.querySelectorAll("[data-d]").forEach(function (b) {
          b.onclick = function () { socket.emit("game:decide", { counts: b.getAttribute("data-d") === "1" }); };
        });
      }
    } else if (room.paused) {
      document.getElementById("on-resume").onclick = function () { socket.emit("game:resume"); };
    } else {
      if (meTurn) {
        var input = document.getElementById("on-guess");
        var submit = function () {
          var fb = document.getElementById("on-feedback");
          socket.emit("game:guess", { guess: input.value }, function (res) {
            if (res && !res.ok) { fb.textContent = res.message; fb.className = "feedback bad"; if (window.FX) { FX.bad(); FX.shake(document.querySelector("#online-room .turn-card")); } }
            else { input.value = ""; }
          });
        };
        document.getElementById("on-submit").onclick = submit;
        input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
        input.focus();
        var sb = document.getElementById("on-stuck");
        if (sb) sb.onclick = function () { socket.emit("game:giveup"); };
      }
      document.getElementById("on-pause").onclick = function () { socket.emit("game:pause"); };
      if (secs > 0) startTimer(room.deadlineTs);
    }
  }

  function renderEnded(box, room) {
    if (O.tick) { clearInterval(O.tick); O.tick = null; }
    var wName = matchWinnerName(room);
    box.innerHTML =
      '<div class="winner-banner"><div class="trophy">🏆</div><h2>' +
      (wName ? esc(wName) + " wins the match!" : "Game over") +
      '</h2><p class="hint">Final standings</p></div>' +
      App.scoreboardHtml(scoreRows(room), room.settings.target) +
      '<div style="height:14px"></div>' +
      (isHost()
        ? '<button class="primary-btn big" id="online-again">New match</button>' +
          '<div style="height:10px"></div><button class="ghost-btn" id="online-lobby">Back to lobby</button>'
        : '<p class="hint">Waiting for the Admin to start a new match…</p>');
    if (isHost()) {
      document.getElementById("online-again").onclick = function () { socket.emit("game:start"); };
      document.getElementById("online-lobby").onclick = function () { socket.emit("game:reset"); };
    }
  }

  function startTimer(deadlineTs) {
    if (O.tick) clearInterval(O.tick);
    function paint() {
      var fill = document.getElementById("on-timer-fill");
      var num = document.getElementById("on-timer-num");
      if (!fill || !deadlineTs) return;
      var left = Math.max(0, Math.ceil((deadlineTs - Date.now()) / 1000));
      var denom = (O.room && O.room.settings && O.room.settings.timer) || 30;
      fill.style.width = (left / denom) * 100 + "%";
      fill.classList.toggle("warn", left <= 10);
      num.classList.toggle("warn", left <= 10);
      num.textContent = left + "s";
      var meTurn = O.room && O.room.currentPlayerId === O.myId;
      if (meTurn && left <= 5 && left > 0 && left !== O._lastTick && window.FX) FX.tick();
      O._lastTick = left;
    }
    paint();
    O.tick = setInterval(paint, 250);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
