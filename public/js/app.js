/* global NameGameRules */
(function () {
  "use strict";

  var App = {
    athletes: [],
    index: {},
    ready: false,
  };
  window.NameGameApp = App;

  /* ----------------------------------------------------- navigation */
  function showScreen(name) {
    document.querySelectorAll(".screen").forEach(function (s) {
      s.classList.toggle("active", s.id === "screen-" + name);
    });
    window.scrollTo(0, 0);
  }
  App.showScreen = showScreen;

  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  App.esc = esc;

  /* ------------------------------------------------- shared settings UI */
  var LEAGUES = ["NBA", "MLB", "NFL", "NHL"];

  // Renders league chips + era selector into `el`. Calls onChange(settings).
  // editable=false renders a read-only summary (for non-host players).
  function renderSettings(el, settings, onChange, editable) {
    if (editable === false) {
      el.innerHTML =
        '<h3>Settings</h3><p class="settings-label">Leagues: <b>' +
        esc(settings.leagues.join(", ")) +
        "</b></p><p class=\"settings-label\">Players: <b>" +
        ({ current: "Current only", past: "Past only", both: "Current + Past" }[settings.era]) +
        "</b></p>";
      return;
    }

    el.innerHTML =
      "<h3>Settings</h3>" +
      '<p class="settings-label">Leagues</p>' +
      '<div class="chip-row" data-chips>' +
      LEAGUES.map(function (l) {
        return (
          '<button class="chip ' +
          (settings.leagues.indexOf(l) !== -1 ? "on" : "") +
          '" data-league="' +
          l +
          '"><span class="dot"></span>' +
          l +
          "</button>"
        );
      }).join("") +
      "</div>" +
      '<p class="settings-label" style="margin-top:14px">Players</p>' +
      '<div class="seg" data-era>' +
      [
        ["current", "Current"],
        ["past", "Past"],
        ["both", "Both"],
      ]
        .map(function (o) {
          return (
            '<button data-era-val="' +
            o[0] +
            '" class="' +
            (settings.era === o[0] ? "on" : "") +
            '">' +
            o[1] +
            "</button>"
          );
        })
        .join("") +
      "</div>";

    el.querySelectorAll("[data-league]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var l = btn.getAttribute("data-league");
        var i = settings.leagues.indexOf(l);
        if (i === -1) settings.leagues.push(l);
        else if (settings.leagues.length > 1) settings.leagues.splice(i, 1);
        btn.classList.toggle("on", settings.leagues.indexOf(l) !== -1);
        onChange && onChange(settings);
      });
    });
    el.querySelectorAll("[data-era-val]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        settings.era = btn.getAttribute("data-era-val");
        el.querySelectorAll("[data-era-val]").forEach(function (b) {
          b.classList.toggle("on", b === btn);
        });
        onChange && onChange(settings);
      });
    });
  }
  App.renderSettings = renderSettings;

  /* ============================================== PASS & PLAY ============ */
  var PP = {
    players: ["Player 1", "Player 2"],
    settings: { leagues: LEAGUES.slice(), era: "both" },
    state: null,
  };

  function renderPlayerEditor() {
    var box = document.getElementById("pp-players");
    box.innerHTML = PP.players
      .map(function (name, i) {
        return (
          '<div class="player-row">' +
          '<input type="text" maxlength="20" value="' +
          esc(name) +
          '" data-pi="' +
          i +
          '" placeholder="Player ' +
          (i + 1) +
          '" />' +
          (PP.players.length > 2
            ? '<button class="remove" data-rm="' + i + '">×</button>'
            : "") +
          "</div>"
        );
      })
      .join("");
    box.querySelectorAll("[data-pi]").forEach(function (inp) {
      inp.addEventListener("input", function () {
        PP.players[+inp.getAttribute("data-pi")] = inp.value;
      });
    });
    box.querySelectorAll("[data-rm]").forEach(function (b) {
      b.addEventListener("click", function () {
        PP.players.splice(+b.getAttribute("data-rm"), 1);
        renderPlayerEditor();
      });
    });
  }

  function initPassPhoneSetup() {
    renderPlayerEditor();
    renderSettings(document.getElementById("pp-settings"), PP.settings, null, true);
    document.getElementById("pp-add-player").onclick = function () {
      if (PP.players.length < 12) {
        PP.players.push("Player " + (PP.players.length + 1));
        renderPlayerEditor();
      }
    };
    document.getElementById("pp-start").onclick = startPassPhone;
  }

  function startPassPhone() {
    var names = PP.players
      .map(function (n) {
        return (n || "").trim();
      })
      .filter(Boolean);
    if (names.length < 2) {
      document.getElementById("pp-start-hint").textContent = "Add at least 2 players.";
      return;
    }
    PP.state = {
      players: names.map(function (n) {
        return { name: n, alive: true };
      }),
      turn: 0,
      requiredLetter: "",
      used: new Set(),
      history: [],
      winner: null,
      deadline: 0,
      tick: null,
    };
    showScreen("passphone-game");
    nextPPTurn(true);
  }

  function alivePP() {
    return PP.state.players.filter(function (p) {
      return p.alive;
    });
  }

  function nextPPTurn(first) {
    var s = PP.state;
    if (s.tick) clearInterval(s.tick);
    if (alivePP().length <= 1) return endPP();

    if (!first) {
      do {
        s.turn = (s.turn + 1) % s.players.length;
      } while (!s.players[s.turn].alive);
    } else {
      while (!s.players[s.turn].alive) s.turn = (s.turn + 1) % s.players.length;
    }

    s.deadline = Date.now() + 30000;
    renderPPGame();
    var input = document.getElementById("pp-guess");
    if (input) input.focus();
    s.tick = setInterval(function () {
      var left = Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000));
      updateTimer(left);
      if (left <= 0) {
        clearInterval(s.tick);
        var p = s.players[s.turn];
        p.alive = false;
        s.history.unshift({ type: "out", player: p.name, reason: "ran out of time" });
        nextPPTurn(false);
      }
    }, 250);
  }

  function updateTimer(left) {
    var fill = document.getElementById("pp-timer-fill");
    var num = document.getElementById("pp-timer-num");
    if (!fill) return;
    fill.style.width = (left / 30) * 100 + "%";
    fill.classList.toggle("warn", left <= 10);
    num.textContent = left + "s";
  }

  function submitPP() {
    var s = PP.state;
    var input = document.getElementById("pp-guess");
    var fb = document.getElementById("pp-feedback");
    var res = NameGameRules.validate(input.value, {
      index: App.index,
      settings: PP.settings,
      usedKeys: s.used,
      requiredLetter: s.requiredLetter,
    });
    if (!res.ok) {
      fb.textContent = res.message;
      fb.className = "feedback bad";
      return;
    }
    s.used.add(res.key);
    s.requiredLetter = res.nextLetter;
    s.history.unshift({
      type: "said",
      player: s.players[s.turn].name,
      name: res.athlete.name,
      league: res.athlete.league,
      nextLetter: res.nextLetter,
    });
    input.value = "";
    fb.textContent = "";
    nextPPTurn(false);
  }

  function renderPPGame() {
    var s = PP.state;
    var cur = s.players[s.turn];
    var box = document.getElementById("pp-game");
    box.innerHTML =
      strip(s.players, s.turn) +
      '<div class="turn-card">' +
      '<div class="turn-player">Now up</div>' +
      '<div class="turn-name">' + esc(cur.name) + "</div>" +
      (s.requiredLetter
        ? '<div class="letter-cap">First name must start with</div><div class="letter-badge">' +
          s.requiredLetter +
          "</div>"
        : '<div class="letter-cap">Opening turn — name any eligible athlete</div>') +
      '<div class="timer-wrap"><div class="timer-bar"><div class="timer-fill" id="pp-timer-fill"></div></div>' +
      '<div class="timer-num" id="pp-timer-num">30s</div></div>' +
      '<div class="guess-row">' +
      '<input type="text" id="pp-guess" placeholder="Type an athlete’s name…" autocomplete="off" />' +
      '<button class="primary-btn" id="pp-submit">Go</button>' +
      "</div>" +
      '<div class="feedback" id="pp-feedback"></div>' +
      "</div>" +
      historyHtml(s.history);
    document.getElementById("pp-submit").onclick = submitPP;
    var input = document.getElementById("pp-guess");
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") submitPP();
    });
    updateTimer(Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000)));
  }

  function endPP() {
    var s = PP.state;
    if (s.tick) clearInterval(s.tick);
    var winner = alivePP()[0];
    if (winner) s.history.unshift({ type: "win", player: winner.name });
    var box = document.getElementById("pp-game");
    box.innerHTML =
      '<div class="winner-banner"><div class="trophy">🏆</div><h2>' +
      (winner ? esc(winner.name) + " wins!" : "Game over") +
      "</h2><p class=\"hint\">Last player standing.</p></div>" +
      '<button class="primary-btn big" id="pp-again">Play again</button>' +
      '<div style="height:14px"></div>' +
      historyHtml(s.history);
    document.getElementById("pp-again").onclick = startPassPhone;
  }

  /* shared render helpers also used by online.js */
  function strip(players, currentIdx) {
    return (
      '<div class="players-strip">' +
      players
        .map(function (p, i) {
          return (
            '<span class="pill ' +
            (p.alive ? "" : "out ") +
            (i === currentIdx && p.alive ? "current" : "") +
            '">' +
            esc(p.name) +
            "</span>"
          );
        })
        .join("") +
      "</div>"
    );
  }
  App.strip = strip;

  function historyHtml(history) {
    if (!history.length) return "";
    return (
      '<div class="history"><h3>Play-by-play</h3>' +
      history
        .map(function (h) {
          if (h.type === "out")
            return (
              '<div class="hrow out">⛔ ' + esc(h.player) + " " + esc(h.reason) + "</div>"
            );
          if (h.type === "win")
            return '<div class="hrow win">🏆 ' + esc(h.player) + " wins!</div>";
          return (
            '<div class="hrow"><span class="who">' +
            esc(h.player) +
            '</span><span>' +
            esc(h.name) +
            "</span><span class=\"lg\">" +
            esc(h.league) +
            " · →" +
            esc(h.nextLetter) +
            "</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }
  App.historyHtml = historyHtml;

  /* ----------------------------------------------------- boot / wiring */
  function wireNav() {
    document.querySelectorAll("[data-go]").forEach(function (el) {
      el.addEventListener("click", function () {
        var dest = el.getAttribute("data-go");
        if (dest === "passphone-setup") initPassPhoneSetup();
        showScreen(dest);
      });
    });
    document.getElementById("how-to-btn").onclick = function () {
      document.getElementById("howto-modal").hidden = false;
    };
    document.getElementById("howto-close").onclick = function () {
      document.getElementById("howto-modal").hidden = true;
    };
  }

  function boot() {
    wireNav();
    fetch("/data/athletes.json")
      .then(function (r) { return r.json(); })
      .then(function (list) {
        App.athletes = list;
        App.index = NameGameRules.buildIndex(list);
        App.ready = true;
        // deep-link: /?room=CODE jumps to online join
        var m = location.search.match(/room=([A-Za-z0-9]{4})/);
        if (m && window.NameGameOnline) window.NameGameOnline.prefillJoin(m[1]);
      })
      .catch(function () {
        alert("Could not load the athlete database.");
      });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
