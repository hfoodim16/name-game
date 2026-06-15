/* daily.js — solo "Daily Chain" mode + persistent stats.
 * Everyone gets the same seed athlete each day; 90s to build the longest chain.
 * State is local (localStorage); no server needed. */
/* global NameGameRules */
(function () {
  "use strict";
  var App = window.NameGameApp;
  var esc = App.esc;

  var EPOCH = Date.UTC(2025, 0, 1); // day #1 = 2025-01-01
  var RUN_SECONDS = 15;
  var SETTINGS = { leagues: ["NBA", "MLB", "NFL", "NHL"], era: "both" };

  // Curated, recognizable seeds (all in the DB across the four leagues).
  var SEEDS = [
    "Michael Jordan", "LeBron James", "Kobe Bryant", "Shaquille O'Neal", "Stephen Curry",
    "Tim Duncan", "Magic Johnson", "Larry Bird", "Kevin Durant", "Giannis Antetokounmpo",
    "Nikola Jokic", "Allen Iverson", "Tom Brady", "Peyton Manning", "Jerry Rice",
    "Patrick Mahomes", "Barry Sanders", "Lawrence Taylor", "Walter Payton", "Deion Sanders",
    "Babe Ruth", "Derek Jeter", "Shohei Ohtani", "Ken Griffey", "Willie Mays",
    "Hank Aaron", "Mike Trout", "Aaron Judge", "Mookie Betts", "Wayne Gretzky",
    "Sidney Crosby", "Connor McDavid", "Bobby Orr", "Mario Lemieux", "Alex Ovechkin",
  ];

  function dayNumber(d) {
    var now = d || new Date();
    var utc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((utc - EPOCH) / 86400000) + 1;
  }
  function dateKey(d) {
    var now = d || new Date();
    return now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate();
  }
  function yesterdayKey() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return dateKey(d);
  }
  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }
  function todaySeed() {
    return SEEDS[hashStr("namegame-" + dateKey()) % SEEDS.length];
  }

  /* ---- stats (localStorage) ---- */
  function loadStats() {
    try { return JSON.parse(localStorage.getItem("ng-stats")) || {}; }
    catch (e) { return {}; }
  }
  function saveStats(s) { try { localStorage.setItem("ng-stats", JSON.stringify(s)); } catch (e) {} }

  function recordRun(score, official) {
    var s = loadStats();
    s.bestChain = Math.max(s.bestChain || 0, score);
    s.runs = (s.runs || 0) + 1;
    if (official) {
      var today = dateKey();
      s.streak = s.lastPlayed === yesterdayKey() ? (s.streak || 0) + 1 : 1;
      s.lastPlayed = today;
      s.todayDate = today;
      s.todayScore = score;
    }
    saveStats(s);
    return s;
  }
  function playedToday() {
    var s = loadStats();
    return s.todayDate === dateKey();
  }

  /* ---- run state ---- */
  var D = null;

  function startRun(official) {
    var seed = todaySeed();
    D = {
      seed: seed,
      official: official,
      requiredLetter: NameGameRules.firstLetterOfLastName(seed),
      used: new Set([NameGameRules.normalize(seed)]),
      chain: [],
      deadline: Date.now() + RUN_SECONDS * 1000,
      tick: null,
      playing: true,
      lastTick: null,
    };
    renderPlaying();
    var inp = document.getElementById("daily-guess");
    if (inp) inp.focus();
    D.tick = setInterval(function () {
      var left = Math.max(0, Math.ceil((D.deadline - Date.now()) / 1000));
      paintTimer(left);
      if (left <= 5 && left > 0 && left !== D.lastTick && window.FX) FX.tick();
      D.lastTick = left;
      if (left <= 0) { clearInterval(D.tick); D.tick = null; endRun(); }
    }, 250);
  }

  function submit() {
    if (!D || !D.playing) return;
    var inp = document.getElementById("daily-guess");
    var fb = document.getElementById("daily-feedback");
    var res = NameGameRules.validate(inp.value, {
      index: App.index, settings: SETTINGS, usedKeys: D.used, requiredLetter: D.requiredLetter,
    });
    if (!res.ok) {
      fb.textContent = res.message; fb.className = "feedback bad";
      if (window.FX) { FX.bad(); FX.shake(document.querySelector("#screen-daily .turn-card")); }
      return;
    }
    D.used.add(res.key);
    D.requiredLetter = res.nextLetter;
    D.chain.push({ name: res.athlete.name, league: res.athlete.league, typed: res.typed });
    inp.value = ""; fb.textContent = "";
    if (window.FX) FX.good();
    renderPlaying();
    document.getElementById("daily-guess").focus();
  }

  function endRun() {
    D.playing = false;
    if (D.tick) { clearInterval(D.tick); D.tick = null; }
    var stats = recordRun(D.chain.length, D.official);
    if (window.NameGameAccount) NameGameAccount.afterDaily();
    if (window.FX && D.chain.length > 0) FX.win();
    renderDone(stats);
  }

  /* ---- rendering ---- */
  function chainList() {
    if (!D.chain.length) return "";
    return (
      '<div class="history"><h3>Your chain (' + D.chain.length + ")</h3>" +
      '<div class="hrow"><span class="who">seed</span><span class="nm">' + esc(D.seed) + "</span></div>" +
      D.chain.map(function (c, i) {
        return '<div class="hrow"><span class="who">' + (i + 1) + '.</span><span class="nm">' +
          esc(c.name) + (c.typed ? ' <span class="typed">(typed “' + esc(c.typed) + "”)</span>" : "") +
          '</span><span class="lg">' + esc(c.league) + "</span></div>";
      }).reverse().join("") +
      "</div>"
    );
  }

  function paintTimer(left) {
    var fill = document.getElementById("daily-fill");
    var num = document.getElementById("daily-num");
    if (!fill) return;
    fill.style.width = (left / RUN_SECONDS) * 100 + "%";
    fill.classList.toggle("warn", left <= 5);
    num.classList.toggle("warn", left <= 5);
    num.textContent = left + "s";
  }

  function renderPlaying() {
    var box = document.getElementById("daily-body");
    box.innerHTML =
      '<div class="round-tag"><span class="rt-round">Chain ' + D.chain.length + "</span>" +
      '<span class="rt-p">seed <b>' + esc(D.seed) + "</b></span></div>" +
      '<div class="turn-card">' +
      '<div class="letter-cap">Next first name starts with</div>' +
      '<div class="letter-badge">' + D.requiredLetter + "</div>" +
      '<div class="timer-wrap"><div class="timer-bar"><div class="timer-fill" id="daily-fill"></div></div>' +
      '<div class="timer-num" id="daily-num">' + RUN_SECONDS + "s</div></div>" +
      '<div class="guess-row"><input type="text" id="daily-guess" placeholder="Type an athlete’s name…" autocomplete="off" />' +
      '<button class="primary-btn" id="daily-go">Go</button></div>' +
      '<div class="feedback" id="daily-feedback"></div>' +
      '<div class="ctl-row"><button class="ctl-btn danger" id="daily-finish">🏁 Finish run</button></div>' +
      "</div>" +
      chainList();
    document.getElementById("daily-go").onclick = submit;
    var inp = document.getElementById("daily-guess");
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    document.getElementById("daily-finish").onclick = function () {
      if (D.tick) { clearInterval(D.tick); D.tick = null; }
      endRun();
    };
    paintTimer(Math.max(0, Math.ceil((D.deadline - Date.now()) / 1000)));
  }

  function shareText(score) {
    var pips = "";
    var n = Math.min(score, 20);
    for (var i = 0; i < n; i++) pips += "🟧";
    return "🏆 The Name Game — Daily #" + dayNumber() + "\nSeed: " + D.seed +
      "\nChain: " + score + " 🔗 " + pips + "\n" + location.origin;
  }

  function renderDone(stats) {
    var box = document.getElementById("daily-body");
    var score = D.chain.length;
    box.innerHTML =
      '<div class="winner-banner"><div class="trophy">' + (score >= 10 ? "🔥" : "🔗") + "</div>" +
      "<h2>" + score + (score === 1 ? " link" : " links") + "</h2>" +
      '<p class="hint">Daily #' + dayNumber() + " · seed " + esc(D.seed) +
      (D.official ? "" : " · practice run") + "</p></div>" +
      statChips(stats) +
      '<div style="height:12px"></div>' +
      '<button class="primary-btn big" id="daily-share">📋 Share result</button>' +
      '<div style="height:8px"></div>' +
      '<button class="ghost-btn" id="daily-practice">Practice run (doesn’t count)</button>' +
      '<div style="height:14px"></div>' +
      chainList();
    document.getElementById("daily-share").onclick = function () {
      var txt = shareText(score);
      if (navigator.share) { navigator.share({ text: txt }).catch(function () {}); }
      else if (navigator.clipboard) {
        navigator.clipboard.writeText(txt);
        document.getElementById("daily-share").textContent = "✓ Copied!";
      }
    };
    document.getElementById("daily-practice").onclick = function () { startRun(false); };
  }

  function statChips(stats) {
    stats = stats || loadStats();
    return (
      '<div class="stat-row">' +
      '<div class="stat"><div class="stat-n">' + (stats.bestChain || 0) + '</div><div class="stat-l">Best chain</div></div>' +
      '<div class="stat"><div class="stat-n">' + (stats.streak || 0) + '</div><div class="stat-l">Day streak</div></div>' +
      '<div class="stat"><div class="stat-n">' + (stats.runs || 0) + '</div><div class="stat-l">Runs</div></div>' +
      "</div>"
    );
  }

  function renderIntro() {
    var box = document.getElementById("daily-body");
    var seed = todaySeed();
    var done = playedToday();
    var stats = loadStats();
    box.innerHTML =
      '<div class="turn-card">' +
      '<div class="turn-player">Daily #' + dayNumber() + "</div>" +
      '<div class="turn-name">Daily Chain</div>' +
      '<p class="op-sub" style="margin:6px 0 14px">Today’s seed is <b>' + esc(seed) + "</b>. You have <b>" +
      RUN_SECONDS + "s</b> to build the longest chain you can — first name starts with <b>" +
      NameGameRules.firstLetterOfLastName(seed) + "</b>. Same seed for everyone today.</p>" +
      (done
        ? '<p class="hint" style="margin-bottom:12px">✅ Today’s run: <b>' + (stats.todayScore || 0) +
          " links</b>. Come back tomorrow for a new seed!</p>" +
          '<button class="primary-btn big" id="daily-share2">📋 Share result</button>' +
          '<div style="height:8px"></div><button class="ghost-btn" id="daily-practice2">Practice run</button>'
        : '<button class="primary-btn big" id="daily-start">Start today’s run</button>') +
      "</div>" +
      statChips(stats);
    if (done) {
      document.getElementById("daily-share2").onclick = function () {
        D = { seed: seed, chain: { length: stats.todayScore || 0 } }; // minimal for shareText
        var txt = "🏆 The Name Game — Daily #" + dayNumber() + "\nSeed: " + seed +
          "\nChain: " + (stats.todayScore || 0) + " 🔗\n" + location.origin;
        if (navigator.share) navigator.share({ text: txt }).catch(function () {});
        else if (navigator.clipboard) { navigator.clipboard.writeText(txt); document.getElementById("daily-share2").textContent = "✓ Copied!"; }
      };
      document.getElementById("daily-practice2").onclick = function () { startRun(false); };
    } else {
      document.getElementById("daily-start").onclick = function () { startRun(true); };
    }
  }

  // public entry point (called when navigating to the daily screen)
  window.NameGameDaily = { open: renderIntro, statChips: statChips };
})();
