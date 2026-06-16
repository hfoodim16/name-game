/* daily.js — solo "Daily Chain" mode + persistent stats.
 * Everyone gets the same seed athlete each day; 90s to build the longest chain.
 * State is local (localStorage); no server needed. */
/* global NameGameRules */
(function () {
  "use strict";
  var App = window.NameGameApp;
  var esc = App.esc;

  var EPOCH = Date.UTC(2025, 0, 1); // day #1 = 2025-01-01
  var RUN_SECONDS = 45;
  var SETTINGS = { leagues: ["NBA", "MLB", "NFL", "NHL", "SOC", "CFB", "CBB"], era: "both" };

  // Curated, recognizable seeds across all supported leagues.
  var SEEDS = [
    // NBA
    "Michael Jordan", "LeBron James", "Kobe Bryant", "Shaquille O\'Neal", "Stephen Curry",
    "Tim Duncan", "Magic Johnson", "Larry Bird", "Kevin Durant", "Giannis Antetokounmpo",
    "Nikola Jokic", "Allen Iverson", "Charles Barkley", "Dirk Nowitzki", "Kevin Garnett",
    "Carmelo Anthony", "Ray Allen", "Dwyane Wade", "Paul Pierce", "Dwight Howard",
    "Russell Westbrook", "James Harden", "Kyrie Irving", "Damian Lillard", "Kawhi Leonard",
    "Donovan Mitchell", "Anthony Davis", "Devin Booker", "Jayson Tatum", "Jimmy Butler",
    "Trae Young", "Luka Doncic", "Ja Morant", "Joel Embiid", "Victor Wembanyama",
    "Anthony Edwards", "Shai Gilgeous-Alexander", "Zion Williamson", "Oscar Robertson",
    "Wilt Chamberlain", "Kareem Abdul-Jabbar", "Julius Erving", "Bill Russell",
    "John Stockton", "Karl Malone", "Scottie Pippen", "Dennis Rodman", "Patrick Ewing",
    "Clyde Drexler", "Gary Payton", "Reggie Miller", "Vince Carter", "Tracy McGrady",
    "Chris Paul", "Derrick Rose", "Pete Maravich", "Bill Walton", "Christian Laettner",
    // NFL
    "Tom Brady", "Peyton Manning", "Jerry Rice", "Patrick Mahomes", "Barry Sanders",
    "Lawrence Taylor", "Walter Payton", "Deion Sanders", "Joe Montana", "Emmitt Smith",
    "Dan Marino", "Brett Favre", "Aaron Rodgers", "Drew Brees", "Jim Brown",
    "Randy Moss", "Calvin Johnson", "Adrian Peterson", "Rob Gronkowski", "Travis Kelce",
    "Antonio Brown", "J.J. Watt", "Ray Lewis", "LaDainian Tomlinson", "Marshall Faulk",
    "Joe Namath", "John Elway", "Steve Young", "Troy Aikman", "Ronnie Lott",
    "Christian McCaffrey", "Josh Allen", "Lamar Jackson", "Justin Jefferson",
    "Tyreek Hill", "Marcus Allen", "Eric Dickerson", "Stefon Diggs",
    "Bo Jackson", "Tim Tebow", "Charles Woodson", "Herschel Walker",
    // MLB
    "Babe Ruth", "Derek Jeter", "Shohei Ohtani", "Ken Griffey", "Willie Mays",
    "Hank Aaron", "Mike Trout", "Aaron Judge", "Mookie Betts", "Ted Williams",
    "Lou Gehrig", "Cal Ripken", "Albert Pujols", "David Ortiz", "Alex Rodriguez",
    "Randy Johnson", "Pedro Martinez", "Roger Clemens", "Greg Maddux", "Nolan Ryan",
    "Mariano Rivera", "Reggie Jackson", "Johnny Bench", "Mike Schmidt", "George Brett",
    "Tony Gwynn", "Rickey Henderson", "Frank Thomas", "Sandy Koufax", "Bob Gibson",
    // NHL
    "Wayne Gretzky", "Sidney Crosby", "Connor McDavid", "Bobby Orr", "Mario Lemieux",
    "Alex Ovechkin", "Gordie Howe", "Maurice Richard", "Dominik Hasek", "Teemu Selanne",
    "Steve Yzerman", "Mark Messier", "Joe Sakic", "Patrick Roy", "Martin Brodeur",
    "Nicklas Lidstrom", "Jaromir Jagr", "Ray Bourque", "Eric Lindros", "Brett Hull",
    "Mike Modano", "Auston Matthews", "Nathan MacKinnon", "Leon Draisaitl",
    "Patrick Kane", "Jonathan Toews", "Evgeni Malkin",
    // Soccer
    "Lionel Messi", "Cristiano Ronaldo", "Pele", "Zinedine Zidane", "Ronaldinho",
    "Thierry Henry", "Neymar", "Mohamed Salah", "Kylian Mbappe", "Erling Haaland",
    "Kevin De Bruyne", "David Beckham", "Zlatan Ibrahimovic", "Robert Lewandowski",
    "Didier Drogba",
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

  /* ---- session (tab-close recovery for official runs) ---- */
  var SESSION_KEY = "ng-daily-session";
  function saveSession() {
    if (!D || !D.official) return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        dateKey: dateKey(),
        seed: D.seed,
        requiredLetter: D.requiredLetter,
        used: Array.from(D.used),
        chain: D.chain,
        remainingMs: Math.max(0, D.deadline - Date.now()),
      }));
    } catch (e) {}
  }
  function loadSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (s.dateKey !== dateKey() || s.remainingMs <= 0) { sessionStorage.removeItem(SESSION_KEY); return null; }
      return s;
    } catch (e) { return null; }
  }
  function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} }

  /* ---- run state ---- */
  var D = null;

  function startTick() {
    D.tick = setInterval(function () {
      var left = Math.max(0, Math.ceil((D.deadline - Date.now()) / 1000));
      paintTimer(left);
      if (left <= 5 && left > 0 && left !== D.lastTick && window.FX) FX.tick();
      D.lastTick = left;
      if (left <= 0) { clearInterval(D.tick); D.tick = null; endRun(); }
    }, 250);
  }

  function startRun(official) {
    var seed = todaySeed();
    var box = document.getElementById("daily-body");
    var count = 3;
    // Show a 3-second countdown only for the official daily run.
    if (official) {
      var firstLetter = NameGameRules.firstLetterOfLastName(seed);
      function tick() {
        box.innerHTML =
          '<div class="turn-card" style="text-align:center">' +
          '<div class="letter-cap">Get ready — first name starts with</div>' +
          '<div class="letter-badge" style="font-size:56px;height:80px;line-height:80px">' + count + '</div>' +
          '<p class="hint" style="margin-top:10px">Seed: <b>' + esc(seed) + '</b> · starts with <b>' + firstLetter + '</b></p>' +
          '</div>';
        if (count <= 1) { setTimeout(launch, 900); }
        else { count--; setTimeout(tick, 1000); }
      }
      tick();
    }
    function launch() {
      D = {
        seed: seed, official: official,
        requiredLetter: NameGameRules.firstLetterOfLastName(seed),
        used: new Set([NameGameRules.normalize(seed)]),
        chain: [], deadline: Date.now() + RUN_SECONDS * 1000,
        tick: null, playing: true, lastTick: null,
      };
      renderPlaying();
      var inp = document.getElementById("daily-guess");
      if (inp) inp.focus();
      startTick();
    }
    if (!official) launch();
  }

  function continueRun(saved) {
    D = {
      seed: saved.seed, official: true,
      requiredLetter: saved.requiredLetter,
      used: new Set(saved.used),
      chain: saved.chain,
      deadline: Date.now() + saved.remainingMs,
      tick: null, playing: true, lastTick: null,
    };
    renderPlaying();
    var inp = document.getElementById("daily-guess");
    if (inp) inp.focus();
    startTick();
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
    if (window.NameGameAccount) NameGameAccount.recordName(res.athlete.name);
    saveSession();
    inp.value = ""; fb.textContent = "";
    if (window.FX) FX.good();
    renderPlaying();
    document.getElementById("daily-guess").focus();
  }

  function endRun() {
    D.playing = false;
    if (D.tick) { clearInterval(D.tick); D.tick = null; }
    clearSession();
    var missed = (App.index && D.requiredLetter)
      ? NameGameRules.suggest({ index: App.index, settings: SETTINGS, usedKeys: D.used, requiredLetter: D.requiredLetter }, 6)
      : [];
    var stats = recordRun(D.chain.length, D.official);
    if (window.NameGameAccount) {
      NameGameAccount.afterDaily();
      if (D.official) NameGameAccount.submitDailyScore(dateKey(), D.chain.length);
    }
    if (window.FX && D.chain.length > 0) FX.win();
    renderDone(stats, missed);
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
    fill.classList.toggle("warn", left <= 10);
    num.classList.toggle("warn", left <= 10);
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
      '<div class="guess-row"><input type="text" id="daily-guess" placeholder="Type an athlete\'s name…" autocomplete="off" />' +
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

  function renderDone(stats, missed) {
    var box = document.getElementById("daily-body");
    var score = D.chain.length;
    var missedPanel = (missed && missed.length)
      ? App.missedHtml({ player: "You", letter: D.requiredLetter, missed: missed })
      : "";
    box.innerHTML =
      '<div class="winner-banner"><div class="trophy">' + (score >= 10 ? "🔥" : "🔗") + "</div>" +
      "<h2>" + score + (score === 1 ? " link" : " links") + "</h2>" +
      '<p class="hint">Daily #' + dayNumber() + " · seed " + esc(D.seed) +
      (D.official ? "" : " · practice run") + "</p></div>" +
      missedPanel +
      statChips(stats) +
      '<div style="height:12px"></div>' +
      '<button class="primary-btn big" id="daily-share">📋 Share result</button>' +
      '<div style="height:8px"></div>' +
      '<button class="ghost-btn" id="daily-lb">🏆 Today\'s leaderboard</button>' +
      '<div style="height:8px"></div>' +
      '<button class="ghost-btn" id="daily-practice">Practice run (doesn\'t count)</button>' +
      '<div style="height:14px"></div>' +
      chainList();
    document.getElementById("daily-lb").onclick = renderLeaderboard;
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
    var saved = (!done) ? loadSession() : null;
    box.innerHTML =
      '<div class="turn-card">' +
      '<div class="turn-player">Daily #' + dayNumber() + "</div>" +
      '<div class="turn-name">Daily Chain</div>' +
      '<p class="op-sub" style="margin:6px 0 14px">Today\'s seed is <b>' + esc(seed) + "</b>. You have <b>" +
      RUN_SECONDS + "s</b> to build the longest chain you can — first name starts with <b>" +
      NameGameRules.firstLetterOfLastName(seed) + "</b>. Same seed for everyone today.</p>" +
      (done
        ? '<p class="hint" style="margin-bottom:12px">✅ Today\'s run: <b>' + (stats.todayScore || 0) +
          " links</b>. Come back tomorrow for a new seed!</p>" +
          '<button class="primary-btn big" id="daily-share2">📋 Share result</button>' +
          '<div style="height:8px"></div><button class="ghost-btn" id="daily-practice2">Practice run</button>'
        : saved
          ? '<p class="hint" style="margin-bottom:10px">⏳ You have an unfinished run with <b>~' +
            Math.ceil(saved.remainingMs / 1000) + 's</b> left and <b>' + saved.chain.length + ' links</b>.</p>' +
            '<button class="primary-btn big" id="daily-continue">▶ Continue run</button>' +
            '<div style="height:8px"></div><button class="ghost-btn" id="daily-start">Start fresh instead</button>'
          : '<button class="primary-btn big" id="daily-start">Start today\'s run</button>') +
      "</div>" +
      statChips(stats) +
      '<div style="height:12px"></div>' +
      '<button class="ghost-btn" id="daily-lb-intro">🏆 Today\'s leaderboard</button>';
    document.getElementById("daily-lb-intro").onclick = renderLeaderboard;
    if (done) {
      document.getElementById("daily-share2").onclick = function () {
        D = { seed: seed, chain: { length: stats.todayScore || 0 } };
        var txt = "🏆 The Name Game — Daily #" + dayNumber() + "\nSeed: " + seed +
          "\nChain: " + (stats.todayScore || 0) + " 🔗\n" + location.origin;
        if (navigator.share) navigator.share({ text: txt }).catch(function () {});
        else if (navigator.clipboard) { navigator.clipboard.writeText(txt); document.getElementById("daily-share2").textContent = "✓ Copied!"; }
      };
      document.getElementById("daily-practice2").onclick = function () { startRun(false); };
    } else {
      if (saved) {
        document.getElementById("daily-continue").onclick = function () { continueRun(saved); };
        document.getElementById("daily-start").onclick = function () { clearSession(); startRun(true); };
      } else {
        document.getElementById("daily-start").onclick = function () { startRun(true); };
      }
    }
  }

  function renderLeaderboard() {
    var box = document.getElementById("daily-body");
    box.innerHTML =
      '<div class="turn-card" style="text-align:center">' +
      '<div class="turn-player">Daily #' + dayNumber() + "</div>" +
      '<div class="turn-name">🏆 Leaderboard</div>' +
      '<p class="hint" style="margin:6px 0 0">Today\'s top chains · seed ' + esc(todaySeed()) + "</p></div>" +
      '<div class="panel" id="lb-list"><p class="hint">Loading…</p></div>' +
      (window.NameGameAccount && !NameGameAccount.isLoggedIn()
        ? '<p class="hint">Sign in (👤) to appear on the leaderboard.</p>' : "") +
      '<button class="ghost-btn" id="lb-back">‹ Back to Daily</button>';
    document.getElementById("lb-back").onclick = renderIntro;
    var el = document.getElementById("lb-list");
    if (!window.NameGameAccount) { el.innerHTML = '<p class="hint">Leaderboard unavailable.</p>'; return; }
    NameGameAccount.fetchLeaderboard(dateKey(), function (rows) {
      if (!el) return;
      if (rows === null) { el.innerHTML = '<p class="hint error">Couldn\'t load the leaderboard yet.</p>'; return; }
      if (!rows.length) { el.innerHTML = '<p class="hint">No scores yet today — be the first!</p>'; return; }
      el.innerHTML = "<h3>Today\'s top chains</h3>" + rows.map(function (r, i) {
        var medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1) + ".";
        return '<div class="lb-row"><span class="lb-rank">' + medal + '</span><span class="lb-name">@' +
          esc(r.username) + '</span><span class="lb-score">' + r.score + "</span></div>";
      }).join("");
    });
  }

  // public entry point (called when navigating to the daily screen)
  window.NameGameDaily = { open: renderIntro, statChips: statChips };
})();
