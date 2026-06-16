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
  var LEAGUES = ["NBA", "MLB", "NFL", "NHL", "SOC", "CFB", "CBB"];
  var LEAGUE_LABELS = { NBA: "NBA", MLB: "MLB", NFL: "NFL", NHL: "NHL", SOC: "⚽ Soccer", CFB: "🏈 College FB", CBB: "🏀 College BB" };

  var TIMER_OPTS = [[0, "Off"], [15, "15s"], [30, "30s"], [45, "45s"], [60, "60s"], [90, "90s"]];
  var MATCH_OPTS = [[1, "1"], [2, "2"], [3, "3"], [5, "5"]];
  var TEAM_OPTS = [[0, "Solo"], [2, "2 teams"], [3, "3 teams"], [4, "4 teams"]];

  // Renders league chips + era + timer + match + teams selectors into `el`.
  // editable=false renders a read-only summary (for non-host players).
  function renderSettings(el, settings, onChange, editable) {
    if (settings.timer == null) settings.timer = 30;
    if (settings.target == null) settings.target = 3;
    if (settings.teams == null) settings.teams = 0;
    if (settings.difficulty == null) settings.difficulty = "all";
    if (editable === false) {
      el.innerHTML =
        '<h3>Settings</h3><p class="settings-label">Leagues: <b>' +
        esc(settings.leagues.join(", ")) +
        "</b></p><p class=\"settings-label\">Players: <b>" +
        ({ current: "Current only", past: "Past only", both: "Current + Past" }[settings.era]) +
        "</b></p><p class=\"settings-label\">Difficulty: <b>" +
        (settings.difficulty === "stars" ? "Stars only ⭐" : "All players") +
        "</b></p><p class=\"settings-label\">Turn timer: <b>" +
        (settings.timer ? settings.timer + " seconds" : "Off (no limit)") +
        "</b></p><p class=\"settings-label\">Match: <b>first to " +
        (settings.target || 3) + (settings.target === 1 ? " round" : " rounds") +
        "</b></p><p class=\"settings-label\">Teams: <b>" +
        (settings.teams ? settings.teams + " teams" : "Solo (free-for-all)") +
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
          (LEAGUE_LABELS[l] || l) +
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
      "</div>" +
      '<p class="settings-label" style="margin-top:14px">Difficulty ' +
      '<span style="opacity:.7">(Stars = famous players only)</span></p>' +
      '<div class="seg" data-diff>' +
      [
        ["all", "All players"],
        ["stars", "⭐ Stars only"],
      ]
        .map(function (o) {
          return (
            '<button data-diff-val="' + o[0] + '" class="' +
            (settings.difficulty === o[0] ? "on" : "") + '">' + o[1] + "</button>"
          );
        })
        .join("") +
      "</div>" +
      '<p class="settings-label" style="margin-top:14px">Turn timer ' +
      '<span style="opacity:.7">(off is great for pass &amp; play)</span></p>' +
      '<div class="chip-row" data-timer>' +
      TIMER_OPTS.map(function (o) {
        return (
          '<button class="chip ' + (settings.timer === o[0] ? "on" : "") +
          '" data-timer-val="' + o[0] + '">' + o[1] + "</button>"
        );
      }).join("") +
      "</div>" +
      '<p class="settings-label" style="margin-top:14px">Match length ' +
      '<span style="opacity:.7">(rounds to win)</span></p>' +
      '<div class="chip-row" data-match>' +
      MATCH_OPTS.map(function (o) {
        return (
          '<button class="chip ' + (settings.target === o[0] ? "on" : "") +
          '" data-match-val="' + o[0] + '">first to ' + o[1] + "</button>"
        );
      }).join("") +
      "</div>" +
      '<p class="settings-label" style="margin-top:14px">Teams ' +
      '<span style="opacity:.7">(last team standing wins)</span></p>' +
      '<div class="chip-row" data-teams>' +
      TEAM_OPTS.map(function (o) {
        return (
          '<button class="chip ' + (settings.teams === o[0] ? "on" : "") +
          '" data-teams-val="' + o[0] + '">' + o[1] + "</button>"
        );
      }).join("") +
      "</div>";

    el.querySelectorAll("[data-teams-val]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        settings.teams = parseInt(btn.getAttribute("data-teams-val"), 10);
        el.querySelectorAll("[data-teams-val]").forEach(function (b) {
          b.classList.toggle("on", b === btn);
        });
        onChange && onChange(settings);
      });
    });

    el.querySelectorAll("[data-timer-val]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        settings.timer = parseInt(btn.getAttribute("data-timer-val"), 10);
        el.querySelectorAll("[data-timer-val]").forEach(function (b) {
          b.classList.toggle("on", b === btn);
        });
        onChange && onChange(settings);
      });
    });

    el.querySelectorAll("[data-match-val]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        settings.target = parseInt(btn.getAttribute("data-match-val"), 10);
        el.querySelectorAll("[data-match-val]").forEach(function (b) {
          b.classList.toggle("on", b === btn);
        });
        onChange && onChange(settings);
      });
    });

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
    el.querySelectorAll("[data-diff-val]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        settings.difficulty = btn.getAttribute("data-diff-val");
        el.querySelectorAll("[data-diff-val]").forEach(function (b) {
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
    settings: { leagues: LEAGUES.slice(), era: "both", timer: 30, target: 3, teams: 0 },
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
    document.getElementById("pp-start").onclick = startMatchPP;
  }

  function startMatchPP() {
    var names = PP.players
      .map(function (n) {
        return (n || "").trim();
      })
      .filter(Boolean);
    if (names.length < 2) {
      document.getElementById("pp-start-hint").textContent = "Add at least 2 players.";
      return;
    }
    var teams = PP.settings.teams || 0;
    if (teams > names.length) teams = names.length; // no empty teams
    PP.state = {
      teams: teams,
      players: names.map(function (n, i) {
        return { name: n, alive: true, team: teams > 0 ? i % teams : null };
      }),
      scores: teams > 0 ? new Array(teams).fill(0) : names.map(function () { return 0; }),
      round: 0,
      target: PP.settings.target == null ? 3 : PP.settings.target,
      turn: 0,
      requiredLetter: "",
      used: new Set(),
      history: [],
      timerSecs: PP.settings.timer == null ? 30 : PP.settings.timer,
      deadline: 0,
      remaining: 0,
      paused: false,
      challenge: null,
      turnsStack: [],
      lastRejected: null,
      tick: null,
    };
    showScreen("passphone-game");
    startRoundPP();
  }

  // Begin a fresh round (keeps scores). The starting player rotates each round.
  function startRoundPP() {
    var s = PP.state;
    s.round++;
    s.players.forEach(function (p) { p.alive = true; });
    s.requiredLetter = "";
    s.used = new Set();
    s.history = [];
    s.turnsStack = [];
    s.lastRejected = null;
    s.paused = false;
    s.challenge = null;
    s.lastOut = null;
    s.turn = (s.round - 1) % s.players.length;
    beginTurn();
  }

  function alivePP() {
    return PP.state.players.filter(function (p) {
      return p.alive;
    });
  }

  var TEAM_NAMES = ["Team A", "Team B", "Team C", "Team D"];
  function liveTeamsPP() {
    var set = {};
    PP.state.players.forEach(function (p) { if (p.alive) set[p.team] = true; });
    return Object.keys(set).map(Number);
  }
  function roundOverPP() {
    return PP.state.teams > 0 ? liveTeamsPP().length <= 1 : alivePP().length <= 1;
  }

  function startTick() {
    var s = PP.state;
    if (s.tick) clearInterval(s.tick);
    s.tick = setInterval(function () {
      if (s.paused) return;
      var left = Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000));
      updateTimer(left);
      if (left <= 0) {
        clearInterval(s.tick);
        s.tick = null;
        timeoutPP();
      }
    }, 250);
  }

  function beginTurn() {
    var s = PP.state;
    if (s.tick) { clearInterval(s.tick); s.tick = null; }
    if (roundOverPP()) return endRoundPP();
    while (!s.players[s.turn].alive) s.turn = (s.turn + 1) % s.players.length;
    s.lastRejected = null;
    s.paused = false;
    s.challenge = null;
    if (s.timerSecs > 0) { s.deadline = Date.now() + s.timerSecs * 1000; startTick(); }
    else { s.deadline = 0; }
    renderPPGame();
    var input = document.getElementById("pp-guess");
    if (input) input.focus();
  }

  function advanceTurn() {
    var s = PP.state;
    do { s.turn = (s.turn + 1) % s.players.length; } while (!s.players[s.turn].alive);
    beginTurn();
  }

  // A few real names the current player could have said (for the round recap).
  function suggestPP() {
    var s = PP.state;
    if (!App.index) return [];
    return NameGameRules.suggest({
      index: App.index, settings: PP.settings,
      usedKeys: s.used, requiredLetter: s.requiredLetter,
    }, 6);
  }
  function recordOutPP(p) {
    var s = PP.state;
    s.lastOut = { player: p.name, letter: s.requiredLetter, missed: suggestPP() };
  }

  function timeoutPP() {
    var s = PP.state;
    var p = s.players[s.turn];
    p.alive = false;
    recordOutPP(p);
    s.history.unshift({ type: "out", player: p.name, reason: "ran out of time" });
    advanceTurn();
  }

  function giveUpPP() {
    var s = PP.state;
    if (s.tick) { clearInterval(s.tick); s.tick = null; }
    var p = s.players[s.turn];
    p.alive = false;
    recordOutPP(p);
    s.history.unshift({ type: "out", player: p.name, reason: "gave up" });
    advanceTurn();
  }

  function pausePP() {
    var s = PP.state;
    if (s.paused) return;
    if (s.timerSecs > 0) s.remaining = Math.max(0, s.deadline - Date.now());
    if (s.tick) { clearInterval(s.tick); s.tick = null; }
    s.paused = true;
    renderPPGame();
  }

  function resumePP() {
    var s = PP.state;
    s.paused = false;
    s.challenge = null;
    if (s.timerSecs > 0) {
      s.deadline = Date.now() + (s.remaining || s.timerSecs * 1000);
      startTick();
    }
    renderPPGame();
    var input = document.getElementById("pp-guess");
    if (input) input.focus();
  }

  function challengePP() {
    var s = PP.state;
    if (s.timerSecs > 0 && !s.paused) s.remaining = Math.max(0, s.deadline - Date.now());
    if (s.tick) { clearInterval(s.tick); s.tick = null; }
    s.paused = true;
    if (s.lastRejected) {
      s.challenge = { kind: "rejected", guess: s.lastRejected, player: s.players[s.turn].name };
    } else if (s.turnsStack.length) {
      var t = s.turnsStack[s.turnsStack.length - 1];
      s.challenge = { kind: "accepted", name: t.name, player: s.players[t.playerIndex] ? s.players[t.playerIndex].name : "?" };
    } else {
      s.challenge = { kind: "none" };
    }
    renderPPGame();
  }

  function resolvePP(decision) {
    var s = PP.state;
    var ch = s.challenge;
    s.challenge = null;
    if (!ch) return resumePP();

    if (ch.kind === "rejected" && decision === "allow") {
      var guess = ch.guess;
      var key = NameGameRules.normalize(guess);
      var nextL = NameGameRules.firstLetterOfLastName(guess);
      s.used.add(key);
      s.turnsStack.push({ playerIndex: s.turn, key: key, prevRequiredLetter: s.requiredLetter, name: guess, league: "✓", nextLetter: nextL });
      s.history.unshift({ type: "said", player: s.players[s.turn].name, name: guess, league: "allowed", nextLetter: nextL });
      s.requiredLetter = nextL;
      if (window.FX) FX.good();
      advanceTurn();
      return;
    }
    if (ch.kind === "accepted" && decision === "reject") {
      var rec = s.turnsStack.pop();
      if (rec) {
        s.used.delete(rec.key);
        s.requiredLetter = rec.prevRequiredLetter;
        for (var i = 0; i < s.history.length; i++) {
          if (s.history[i].type === "said" && s.history[i].name === rec.name) { s.history.splice(i, 1); break; }
        }
        s.turn = rec.playerIndex;
      }
      beginTurn();
      return;
    }
    resumePP(); // "it counts" / "keep rejected" / nothing
  }

  function updateTimer(left) {
    var s = PP.state;
    var fill = document.getElementById("pp-timer-fill");
    var num = document.getElementById("pp-timer-num");
    if (!fill || !num) return;
    var denom = s.timerSecs || 30;
    fill.style.width = (left / denom) * 100 + "%";
    fill.classList.toggle("warn", left <= 10);
    num.classList.toggle("warn", left <= 10);
    num.textContent = left + "s";
    if (left <= 5 && left > 0 && left !== PP._lastTick && window.FX) FX.tick();
    PP._lastTick = left;
  }

  function submitPP() {
    var s = PP.state;
    if (s.paused) return;
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
      s.lastRejected = input.value.trim();
      if (window.FX) { FX.bad(); FX.shake(document.querySelector("#pp-game .turn-card")); }
      return;
    }
    if (window.FX) FX.good();
    if (window.NameGameAccount) NameGameAccount.recordName(res.athlete.name);
    s.used.add(res.key);
    s.turnsStack.push({ playerIndex: s.turn, key: res.key, prevRequiredLetter: s.requiredLetter, name: res.athlete.name, league: res.athlete.league, nextLetter: res.nextLetter });
    s.requiredLetter = res.nextLetter;
    s.history.unshift({
      type: "said",
      player: s.players[s.turn].name,
      name: res.athlete.name,
      league: res.athlete.league,
      nextLetter: res.nextLetter,
      typed: res.typed,
    });
    input.value = "";
    fb.textContent = "";
    advanceTurn();
  }

  function renderPPGame() {
    var s = PP.state;
    var cur = s.players[s.turn];
    var box = document.getElementById("pp-game");

    var timerHtml = s.timerSecs > 0
      ? '<div class="timer-wrap"><div class="timer-bar"><div class="timer-fill" id="pp-timer-fill"></div></div>' +
        '<div class="timer-num" id="pp-timer-num">' + s.timerSecs + "s</div></div>"
      : '<div class="no-timer">⏱ No time limit — tap “Stuck” to pass your turn</div>';

    var middle;
    if (s.challenge) {
      middle = challengePanel(s.challenge);
    } else if (s.paused) {
      middle = '<div class="overlay-panel"><div class="op-title">⏸ Paused</div>' +
        '<button class="primary-btn" id="pp-resume">Resume</button></div>';
    } else {
      middle =
        '<div class="guess-row">' +
        '<input type="text" id="pp-guess" placeholder="Type an athlete’s name…" autocomplete="off" />' +
        '<button class="primary-btn" id="pp-submit">Go</button></div>' +
        '<div class="feedback" id="pp-feedback"></div>' +
        '<div class="ctl-row">' +
        '<button class="ctl-btn" id="pp-pause">⏸ Pause</button>' +
        '<button class="ctl-btn" id="pp-challenge">🚩 Challenge</button>' +
        '<button class="ctl-btn danger" id="pp-stuck">🏳 Stuck</button>' +
        "</div>";
    }

    box.innerHTML =
      roundTag(s.round, ppRows(), s.target) +
      strip(s.players, s.turn) +
      '<div class="turn-card">' +
      '<div class="turn-player">Now up</div>' +
      '<div class="turn-name">' + esc(cur.name) + "</div>" +
      (s.requiredLetter
        ? '<div class="letter-cap">First name must start with</div><div class="letter-badge">' +
          s.requiredLetter + "</div>"
        : '<div class="letter-cap">Opening turn — name any eligible athlete</div>') +
      timerHtml + middle +
      "</div>" +
      historyHtml(s.history);

    if (s.challenge) {
      wireChallenge("pp-game", resolvePP);
    } else if (s.paused) {
      document.getElementById("pp-resume").onclick = resumePP;
    } else {
      document.getElementById("pp-submit").onclick = submitPP;
      var input = document.getElementById("pp-guess");
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") submitPP(); });
      document.getElementById("pp-pause").onclick = pausePP;
      document.getElementById("pp-challenge").onclick = challengePP;
      document.getElementById("pp-stuck").onclick = giveUpPP;
      if (s.timerSecs > 0) updateTimer(Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000)));
    }
  }

  function endRoundPP() {
    var s = PP.state;
    if (s.tick) { clearInterval(s.tick); s.tick = null; }
    if (window.FX) FX.win();
    var winner;
    if (s.teams > 0) {
      var lt = liveTeamsPP();
      var wTeam = lt.length ? lt[0] : -1;
      if (wTeam >= 0) s.scores[wTeam]++;
      winner = { name: wTeam >= 0 ? TEAM_NAMES[wTeam] : null, score: wTeam >= 0 ? s.scores[wTeam] : 0 };
    } else {
      var wIdx = -1;
      for (var i = 0; i < s.players.length; i++) if (s.players[i].alive) { wIdx = i; break; }
      if (wIdx >= 0) s.scores[wIdx]++;
      winner = { name: wIdx >= 0 ? s.players[wIdx].name : null, score: wIdx >= 0 ? s.scores[wIdx] : 0 };
    }
    if (winner.score >= s.target) renderMatchOverPP(winner);
    else renderRoundOverPP(winner);
  }

  function ppRows() {
    var s = PP.state;
    if (s.teams > 0) return s.scores.map(function (sc, i) { return { name: TEAM_NAMES[i], score: sc }; });
    return s.players.map(function (p, i) { return { name: p.name, score: s.scores[i] }; });
  }

  function renderRoundOverPP(winner) {
    var s = PP.state;
    var box = document.getElementById("pp-game");
    box.innerHTML =
      '<div class="winner-banner round"><div class="trophy">🎉</div><h2>' +
      (winner.name ? esc(winner.name) + " takes round " + s.round : "Round over") +
      "</h2><p class=\"hint\">First to " + s.target + " wins the match.</p></div>" +
      missedHtml(s.lastOut) +
      scoreboardHtml(ppRows(), s.target) +
      '<div style="height:14px"></div>' +
      '<button class="primary-btn big" id="pp-next">Next round →</button>';
    document.getElementById("pp-next").onclick = startRoundPP;
  }

  function renderMatchOverPP(winner) {
    var s = PP.state;
    var box = document.getElementById("pp-game");
    box.innerHTML =
      '<div class="winner-banner"><div class="trophy">🏆</div><h2>' +
      (winner.name ? esc(winner.name) : "Game over") + " wins the match!</h2>" +
      "<p class=\"hint\">Final standings</p></div>" +
      missedHtml(s.lastOut) +
      scoreboardHtml(ppRows(), s.target) +
      '<div style="height:14px"></div>' +
      '<button class="primary-btn big" id="pp-newmatch">New match</button>';
    document.getElementById("pp-newmatch").onclick = startMatchPP;
  }

  // "Names you could have said" recap panel. out: { player, letter, missed }.
  function missedHtml(out) {
    if (!out || !out.missed || !out.missed.length) return "";
    return (
      '<div class="missed"><h3>💡 ' + esc(out.player) + " could have said" +
      (out.letter ? ' <span class="missed-letter">' + esc(out.letter) + "…</span>" : "") +
      "</h3><div class=\"missed-chips\">" +
      out.missed.map(function (nm) { return '<span class="missed-chip">' + esc(nm) + "</span>"; }).join("") +
      "</div></div>"
    );
  }
  App.missedHtml = missedHtml;

  /* shared render helpers also used by online.js */
  function strip(players, currentIdx) {
    return (
      '<div class="players-strip">' +
      players
        .map(function (p, i) {
          return (
            '<span class="pill ' +
            (p.alive ? "" : "out ") +
            (i === currentIdx && p.alive ? "current " : "") +
            (p.disconnected ? "dc " : "") +
            (p.team != null ? "t" + p.team : "") +
            '">' +
            (p.team != null ? '<span class="team-dot"></span>' : "") +
            esc(p.name) +
            (p.disconnected ? ' <span class="dc-tag">reconnecting…</span>' : "") +
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
          var tag = h.league
            ? esc(h.league) + (h.nextLetter ? " · →" + esc(h.nextLetter) : "")
            : "✓";
          return (
            '<div class="hrow"><span class="who">' +
            esc(h.player) +
            '</span><span class="nm">' +
            esc(h.name) +
            (h.typed ? ' <span class="typed">(typed “' + esc(h.typed) + "”)</span>" : "") +
            '</span><span class="lg">' + tag + "</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }
  App.historyHtml = historyHtml;

  // Scoreboard — shared by Pass & Play and Online.
  // rows: [{ name, score, you }]. Sorted high→low, leader highlighted, with pips toward target.
  function scoreboardHtml(rows, target) {
    var sorted = rows.slice().sort(function (a, b) { return b.score - a.score; });
    var max = sorted.length ? sorted[0].score : 0;
    function pips(score) {
      var s = "";
      for (var i = 0; i < target; i++) s += '<span class="pip' + (i < score ? " on" : "") + '"></span>';
      return s;
    }
    return (
      '<div class="scoreboard"><div class="sb-head">Standings · first to ' + target + "</div>" +
      sorted.map(function (r) {
        return (
          '<div class="sb-row' + (r.score === max && max > 0 ? " lead" : "") + '">' +
          '<span class="sb-name">' + (r.score === max && max > 0 ? "👑 " : "") + esc(r.name) +
          (r.you ? ' <span class="sb-you">(you)</span>' : "") + "</span>" +
          '<span class="sb-pips">' + pips(r.score) + "</span>" +
          '<span class="sb-score">' + r.score + "</span></div>"
        );
      }).join("") +
      "</div>"
    );
  }
  App.scoreboardHtml = scoreboardHtml;

  // Compact live score line shown during play. rows: [{name, score}].
  function roundTag(round, rows, target) {
    return (
      '<div class="round-tag"><span class="rt-round">Round ' + round + "</span>" +
      rows.map(function (r) {
        return '<span class="rt-p">' + esc(r.name) + ' <b>' + r.score + "</b></span>";
      }).join("") +
      '<span class="rt-target">first to ' + target + "</span></div>"
    );
  }
  App.roundTag = roundTag;

  // Challenge / discussion panel — shared by Pass & Play and Online.
  function challengePanel(ch) {
    var body, buttons;
    if (ch.kind === "rejected") {
      body =
        '<p class="op-sub"><b>' + esc(ch.player) + "</b> says <b>“" + esc(ch.guess) +
        "”</b> should count, but it wasn’t recognized. Talk it over — does it count?</p>";
      buttons =
        '<button class="primary-btn" data-decide="allow">✓ Allow it</button>' +
        '<button class="ghost-btn" data-decide="keep">✗ Keep it rejected</button>';
    } else if (ch.kind === "accepted") {
      body =
        '<p class="op-sub">Challenging <b>“' + esc(ch.name) + "”</b>" +
        (ch.player ? " (by <b>" + esc(ch.player) + "</b>)" : "") +
        ". Talk it over — should it count?</p>";
      buttons =
        '<button class="primary-btn" data-decide="count">✓ It counts</button>' +
        '<button class="ghost-btn" data-decide="reject">✗ Doesn’t count — redo turn</button>';
    } else {
      body = '<p class="op-sub">Nothing to challenge yet — play hasn’t started.</p>';
      buttons = '<button class="primary-btn" data-decide="keep">Back to game</button>';
    }
    return (
      '<div class="overlay-panel challenge"><div class="op-title">🚩 Challenge — discuss together</div>' +
      body + '<div class="op-actions">' + buttons + "</div></div>"
    );
  }
  App.challengePanel = challengePanel;

  function wireChallenge(containerId, resolveFn) {
    document.querySelectorAll("#" + containerId + " [data-decide]").forEach(function (b) {
      b.onclick = function () { resolveFn(b.getAttribute("data-decide")); };
    });
  }
  App.wireChallenge = wireChallenge;

  /* ----------------------------------------------------- boot / wiring */
  function wireNav() {
    document.querySelectorAll("[data-go]").forEach(function (el) {
      el.addEventListener("click", function () {
        var dest = el.getAttribute("data-go");
        if (dest === "passphone-setup") initPassPhoneSetup();
        if (dest === "daily" && window.NameGameDaily) window.NameGameDaily.open();
        if (dest === "custom-setup" && window.NameGameCustom) window.NameGameCustom.openSetup();
        if (dest === "account" && window.NameGameAccount) window.NameGameAccount.open();
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
    fetch((window.NG_SERVER || "") + "/data/athletes.json")
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
