/* global io */
(function () {
  "use strict";
  var App = window.NameGameApp;
  var esc = App.esc;

  var socket = null;
  var O = {
    room: null,
    myId: null,
    settings: { leagues: ["NBA", "MLB", "NFL", "NHL"], era: "both" },
    tick: null,
  };
  window.NameGameOnline = O;

  function connect() {
    if (socket) return socket;
    socket = io();
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
    document.getElementById("online-create").onclick = function () {
      err("");
      connect().emit(
        "room:create",
        { name: nameVal(), settings: O.settings },
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

    if (room.status === "lobby") return renderLobby(box, room);
    if (room.status === "ended") return renderEnded(box, room);
    return renderGame(box, room);
  }

  function renderLobby(box, room) {
    if (O.tick) { clearInterval(O.tick); O.tick = null; }
    var link = location.origin + "/?room=" + room.code;
    box.innerHTML =
      '<div class="panel"><h3>Invite players</h3>' +
      '<p class="hint" style="text-align:left">Share this code or link. Players open it and tap Join.</p>' +
      '<div class="invite-box"><input type="text" readonly value="' + esc(link) + '" id="invite-link" />' +
      '<button class="primary-btn copy-btn" id="copy-link">Copy</button></div>' +
      '<p class="settings-label" style="text-align:center;margin-top:12px">Room code: <b style="letter-spacing:3px">' + esc(room.code) + "</b></p></div>" +
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
    App.renderSettings(
      document.getElementById("online-settings"),
      isHost() ? O.settings : room.settings,
      isHost()
        ? function (s) { socket.emit("room:settings", { settings: s }); }
        : null,
      isHost()
    );

    document.getElementById("copy-link").onclick = function () {
      var inp = document.getElementById("invite-link");
      inp.select();
      navigator.clipboard && navigator.clipboard.writeText(inp.value);
      document.getElementById("copy-link").textContent = "Copied!";
    };

    if (isHost()) {
      var startBtn = document.getElementById("online-start");
      startBtn.disabled = room.players.length < 2;
      document.getElementById("online-start-hint").textContent =
        room.players.length < 2 ? "Need at least 2 players to start." : "";
      startBtn.onclick = function () { socket.emit("game:start"); };
    }
  }

  function renderGame(box, room) {
    var meTurn = room.currentPlayerId === O.myId;
    var curPlayer = room.players.find(function (p) { return p.id === room.currentPlayerId; });
    var players = room.players.map(function (p) { return { name: p.name, alive: p.alive }; });
    var curIdx = room.players.findIndex(function (p) { return p.id === room.currentPlayerId; });

    box.innerHTML =
      App.strip(players, curIdx) +
      '<div class="turn-card">' +
      '<div class="turn-player">' + (meTurn ? "Your turn" : "Now up") + "</div>" +
      '<div class="turn-name">' + esc(curPlayer ? curPlayer.name : "—") + "</div>" +
      (room.requiredLetter
        ? '<div class="letter-cap">First name must start with</div><div class="letter-badge">' + room.requiredLetter + "</div>"
        : '<div class="letter-cap">Opening turn — name any eligible athlete</div>') +
      '<div class="timer-wrap"><div class="timer-bar"><div class="timer-fill" id="on-timer-fill"></div></div>' +
      '<div class="timer-num" id="on-timer-num">30s</div></div>' +
      (meTurn
        ? '<div class="guess-row"><input type="text" id="on-guess" placeholder="Type an athlete’s name…" autocomplete="off" />' +
          '<button class="primary-btn" id="on-submit">Go</button></div>'
        : '<div class="feedback">Waiting for ' + esc(curPlayer ? curPlayer.name : "player") + "…</div>") +
      '<div class="feedback" id="on-feedback"></div>' +
      "</div>" +
      App.historyHtml(room.history);

    if (meTurn) {
      var input = document.getElementById("on-guess");
      var submit = function () {
        var fb = document.getElementById("on-feedback");
        socket.emit("game:guess", { guess: input.value }, function (res) {
          if (res && !res.ok) { fb.textContent = res.message; fb.className = "feedback bad"; }
        });
      };
      document.getElementById("on-submit").onclick = submit;
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
      input.focus();
    }

    startTimer(room.deadlineTs);
  }

  function renderEnded(box, room) {
    if (O.tick) { clearInterval(O.tick); O.tick = null; }
    var w = room.players.find(function (p) { return p.id === room.winnerId; });
    box.innerHTML =
      '<div class="winner-banner"><div class="trophy">🏆</div><h2>' +
      (w ? esc(w.name) + " wins!" : "Game over") +
      '</h2><p class="hint">Last player standing.</p></div>' +
      (isHost()
        ? '<button class="primary-btn big" id="online-again">Back to lobby</button>'
        : '<p class="hint">Waiting for the Admin to start a new game…</p>') +
      '<div style="height:14px"></div>' +
      App.historyHtml(room.history);
    if (isHost())
      document.getElementById("online-again").onclick = function () {
        socket.emit("game:reset");
      };
  }

  function startTimer(deadlineTs) {
    if (O.tick) clearInterval(O.tick);
    function paint() {
      var fill = document.getElementById("on-timer-fill");
      var num = document.getElementById("on-timer-num");
      if (!fill || !deadlineTs) return;
      var left = Math.max(0, Math.ceil((deadlineTs - Date.now()) / 1000));
      fill.style.width = (left / 30) * 100 + "%";
      fill.classList.toggle("warn", left <= 10);
      num.textContent = left + "s";
    }
    paint();
    O.tick = setInterval(paint, 250);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
