/* account.js — optional accounts (Supabase) + achievements.
 * Works fully without login (stats + achievements live in localStorage);
 * signing in syncs them to the cloud so they follow you across devices. */
(function () {
  "use strict";
  var App = window.NameGameApp;
  var esc = App.esc;
  var DB = window.NG_DB; // Supabase client or null
  var STATS_KEY = "ng-stats";

  var session = null;   // supabase session
  var profile = null;   // profiles row { username, ... }
  var open = false;     // is the account screen currently shown?
  var mode = "login";   // "login" | "signup" form

  /* ---------------- stats (shared with daily.js) ---------------- */
  function load() { try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) {} schedulePush(); }

  /* ---------------- achievements ---------------- */
  var ACH = [
    { id: "streak3", icon: "🔥", title: "On Fire", desc: "3-day daily streak", test: function (s) { return (s.streak || 0) >= 3; } },
    { id: "streak7", icon: "🔥", title: "Week Warrior", desc: "7-day daily streak", test: function (s) { return (s.streak || 0) >= 7; } },
    { id: "streak30", icon: "🌟", title: "Unstoppable", desc: "30-day daily streak", test: function (s) { return (s.streak || 0) >= 30; } },
    { id: "chain10", icon: "🔗", title: "Chain Gang", desc: "10-link daily chain", test: function (s) { return (s.bestChain || 0) >= 10; } },
    { id: "chain20", icon: "🔗", title: "Chainsmith", desc: "20-link daily chain", test: function (s) { return (s.bestChain || 0) >= 20; } },
    { id: "chain30", icon: "💎", title: "Chain Master", desc: "30-link daily chain", test: function (s) { return (s.bestChain || 0) >= 30; } },
    { id: "win1", icon: "🏆", title: "First Win", desc: "Win an online match", test: function (s) { return (s.mpMatchWins || 0) >= 1; } },
    { id: "win10", icon: "🏆", title: "Contender", desc: "Win 10 online matches", test: function (s) { return (s.mpMatchWins || 0) >= 10; } },
    { id: "win50", icon: "👑", title: "Champion", desc: "Win 50 online matches", test: function (s) { return (s.mpMatchWins || 0) >= 50; } },
    { id: "rounds25", icon: "🎯", title: "Round Hunter", desc: "Win 25 online rounds", test: function (s) { return (s.mpRoundWins || 0) >= 25; } },
    { id: "buzzer", icon: "⚡", title: "Buzzer Beater", desc: "Answer with under 2s left", test: function (s) { return !!(s.feats && s.feats.buzzer); } },
    { id: "flawless", icon: "🛡️", title: "Flawless", desc: "Win a match losing no rounds", test: function (s) { return !!(s.feats && s.feats.flawless); } },
    { id: "specialist", icon: "🎓", title: "Specialist", desc: "Win a single-league match", test: function (s) { return !!(s.feats && s.feats.specialist); } },
  ];

  function evaluate() {
    var s = load();
    var have = {};
    (s.achievements || []).forEach(function (id) { have[id] = true; });
    var newly = [];
    ACH.forEach(function (a) {
      if (!have[a.id] && a.test(s)) { have[a.id] = true; newly.push(a); }
    });
    if (newly.length) {
      s.achievements = Object.keys(have);
      save(s);
      newly.forEach(function (a) { toast(a); });
      if (open) renderAccount();
    }
    return newly;
  }

  /* event hooks called by daily.js / online.js */
  function afterDaily() { evaluate(); }
  function recordRoundWin() { var s = load(); s.mpRoundWins = (s.mpRoundWins || 0) + 1; save(s); evaluate(); }
  function recordMatchWin(info) {
    var s = load();
    s.mpMatchWins = (s.mpMatchWins || 0) + 1;
    s.feats = s.feats || {};
    if (info && info.flawless) s.feats.flawless = true;
    if (info && info.specialist) s.feats.specialist = true;
    save(s); evaluate();
  }
  function recordFeat(name) {
    var s = load(); s.feats = s.feats || {};
    if (!s.feats[name]) { s.feats[name] = true; save(s); evaluate(); }
  }

  /* ---------------- cloud sync ---------------- */
  var pushT = null;
  function schedulePush() {
    if (!DB || !session) return;
    clearTimeout(pushT);
    pushT = setTimeout(pushNow, 1200);
  }
  function pushNow() {
    if (!DB || !session) return;
    var s = load();
    DB.from("profiles").update({
      stats: s, achievements: s.achievements || [], updated_at: new Date().toISOString(),
    }).eq("id", session.user.id).then(function () {}, function () {});
  }
  function mergeIntoLocal(cloud, cloudAch) {
    cloud = cloud || {};
    var s = load();
    s.bestChain = Math.max(s.bestChain || 0, cloud.bestChain || 0);
    s.streak = Math.max(s.streak || 0, cloud.streak || 0);
    s.runs = Math.max(s.runs || 0, cloud.runs || 0);
    s.mpMatchWins = Math.max(s.mpMatchWins || 0, cloud.mpMatchWins || 0);
    s.mpRoundWins = Math.max(s.mpRoundWins || 0, cloud.mpRoundWins || 0);
    if (cloud.lastPlayed && (!s.lastPlayed || cloud.lastPlayed > s.lastPlayed)) {
      s.lastPlayed = cloud.lastPlayed; s.todayDate = cloud.todayDate; s.todayScore = cloud.todayScore;
    }
    s.feats = Object.assign({}, cloud.feats || {}, s.feats || {});
    var set = {};
    [].concat(s.achievements || [], cloudAch || []).forEach(function (id) { set[id] = true; });
    s.achievements = Object.keys(set);
    try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function sanitizeUsername(u) {
    return (u || "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
  }

  function createProfile(id, baseName, done) {
    var s = load();
    var name = sanitizeUsername(baseName) || "player";
    var tries = 0;
    function attempt() {
      var uname = tries === 0 ? name : name + Math.floor(Math.random() * 900 + 100);
      DB.from("profiles").insert({ id: id, username: uname, stats: s, achievements: s.achievements || [] })
        .select().maybeSingle().then(function (r) {
          if (!r.error) { done(r.data); }
          else if (r.error.code === "23505" && tries++ < 5) attempt();
          else done(null);
        });
    }
    attempt();
  }

  function loadProfile() {
    if (!DB || !session) return;
    var u = session.user;
    DB.from("profiles").select("*").eq("id", u.id).maybeSingle().then(function (r) {
      if (r.data) {
        profile = r.data;
        mergeIntoLocal(r.data.stats || {}, r.data.achievements || []);
        evaluate(); pushNow();
        if (open) renderAccount();
      } else {
        var pending = localStorage.getItem("ng-pending-username") || (u.email ? u.email.split("@")[0] : "player");
        createProfile(u.id, pending, function (p) {
          profile = p;
          localStorage.removeItem("ng-pending-username");
          if (open) renderAccount();
        });
      }
    });
  }

  /* ---------------- auth actions ---------------- */
  function signUp(username, email, password, cb) {
    if (!DB) return cb({ ok: false, message: "Accounts aren’t set up." });
    username = sanitizeUsername(username);
    if (username.length < 3) return cb({ ok: false, message: "Username needs 3+ letters/numbers." });
    if (!email || !password || password.length < 6) return cb({ ok: false, message: "Enter an email and a 6+ character password." });
    DB.from("profiles").select("id").eq("username", username).maybeSingle().then(function (r) {
      if (r.data) return cb({ ok: false, message: "That username is taken." });
      localStorage.setItem("ng-pending-username", username);
      DB.auth.signUp({ email: email, password: password }).then(function (res) {
        if (res.error) return cb({ ok: false, message: res.error.message });
        if (res.data.session) { session = res.data.session; loadProfile(); cb({ ok: true }); }
        else cb({ ok: true, needsConfirm: true });
      });
    });
  }
  function signIn(email, password, cb) {
    if (!DB) return cb({ ok: false, message: "Accounts aren’t set up." });
    DB.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
      if (res.error) return cb({ ok: false, message: res.error.message });
      session = res.data.session; loadProfile(); cb({ ok: true });
    });
  }
  function signOut() {
    if (DB) DB.auth.signOut();
    session = null; profile = null;
    if (open) renderAccount();
  }

  /* ---------------- UI ---------------- */
  function toast(a) {
    var t = document.createElement("div");
    t.className = "ach-toast";
    t.innerHTML = '<span class="at-ico">' + a.icon + "</span><span><b>Achievement!</b><br>" + esc(a.title) + "</span>";
    document.body.appendChild(t);
    if (window.FX) FX.good();
    setTimeout(function () { t.classList.add("show"); }, 20);
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 400); }, 3200);
  }

  function achGrid() {
    var s = load();
    var have = {};
    (s.achievements || []).forEach(function (id) { have[id] = true; });
    var count = (s.achievements || []).length;
    return (
      '<div class="panel"><h3>Achievements (' + count + "/" + ACH.length + ")</h3>" +
      '<div class="ach-grid">' +
      ACH.map(function (a) {
        var on = !!have[a.id];
        return '<div class="ach' + (on ? " on" : "") + '"><div class="ach-ico">' + a.icon +
          '</div><div class="ach-t">' + esc(a.title) + '</div><div class="ach-d">' + esc(a.desc) + "</div></div>";
      }).join("") +
      "</div></div>"
    );
  }

  function statsPanel() {
    var s = load();
    return (
      '<div class="stat-row">' +
      '<div class="stat"><div class="stat-n">' + (s.bestChain || 0) + '</div><div class="stat-l">Best chain</div></div>' +
      '<div class="stat"><div class="stat-n">' + (s.streak || 0) + '</div><div class="stat-l">Day streak</div></div>' +
      '<div class="stat"><div class="stat-n">' + (s.mpMatchWins || 0) + '</div><div class="stat-l">Match wins</div></div>' +
      "</div>"
    );
  }

  function renderAccount() {
    var box = document.getElementById("account-body");
    if (!box) return;
    if (session && profile) {
      box.innerHTML =
        '<div class="turn-card" style="text-align:center">' +
        '<div class="turn-player you">Signed in</div>' +
        '<div class="turn-name">@' + esc(profile.username) + "</div>" +
        '<p class="hint" style="margin:6px 0 0">Your progress syncs to the cloud. ☁️</p></div>' +
        statsPanel() + '<div style="height:12px"></div>' +
        achGrid() +
        '<button class="ghost-btn" id="acc-signout">Sign out</button>';
      document.getElementById("acc-signout").onclick = signOut;
      return;
    }
    // logged out
    var notice = !DB
      ? '<p class="hint error">Accounts aren’t configured on this build.</p>'
      : "";
    box.innerHTML =
      '<div class="panel">' +
      '<div class="seg" style="margin-bottom:14px">' +
      '<button id="tab-login" class="' + (mode === "login" ? "on" : "") + '">Log in</button>' +
      '<button id="tab-signup" class="' + (mode === "signup" ? "on" : "") + '">Sign up</button>' +
      "</div>" +
      (mode === "signup"
        ? '<label class="field"><span>Username</span><input type="text" id="acc-user" maxlength="20" placeholder="e.g. harry" autocomplete="username" /></label>'
        : "") +
      '<label class="field"><span>Email</span><input type="text" id="acc-email" placeholder="you@email.com" autocomplete="email" /></label>' +
      '<label class="field"><span>Password</span><input type="password" id="acc-pass" placeholder="6+ characters" autocomplete="' + (mode === "signup" ? "new-password" : "current-password") + '" /></label>' +
      '<button class="primary-btn" id="acc-go">' + (mode === "signup" ? "Create account" : "Log in") + "</button>" +
      '<p class="hint" id="acc-msg">' + notice + "</p>" +
      '<p class="hint" style="margin-top:4px">Saves your streak, chains &amp; achievements across devices.</p>' +
      "</div>" +
      achGrid();

    document.getElementById("tab-login").onclick = function () { mode = "login"; renderAccount(); };
    document.getElementById("tab-signup").onclick = function () { mode = "signup"; renderAccount(); };
    var msg = function (m, bad) { var e = document.getElementById("acc-msg"); e.textContent = m; e.className = "hint" + (bad ? " error" : ""); };
    document.getElementById("acc-go").onclick = function () {
      var email = (document.getElementById("acc-email").value || "").trim();
      var pass = document.getElementById("acc-pass").value || "";
      var btn = document.getElementById("acc-go");
      btn.disabled = true; msg("Working…");
      function done(r) {
        btn.disabled = false;
        if (!r.ok) return msg(r.message || "Something went wrong.", true);
        if (r.needsConfirm) return msg("Check your email to confirm, then log in.", false);
        renderAccount();
      }
      if (mode === "signup") signUp((document.getElementById("acc-user").value || ""), email, pass, done);
      else signIn(email, pass, done);
    };
    var p = document.getElementById("acc-pass");
    if (p) p.addEventListener("keydown", function (e) { if (e.key === "Enter") document.getElementById("acc-go").click(); });
  }

  function openScreen() { open = true; renderAccount(); }

  // header label (so home can show who's signed in)
  function label() { return session && profile ? "@" + profile.username : "Sign in"; }

  window.NameGameAccount = {
    open: openScreen,
    afterDaily: afterDaily,
    recordRoundWin: recordRoundWin,
    recordMatchWin: recordMatchWin,
    recordFeat: recordFeat,
    evaluate: evaluate,
    isLoggedIn: function () { return !!session; },
    label: label,
  };

  // init: restore session + run an initial achievement sweep
  evaluate();
  if (DB) {
    DB.auth.getSession().then(function (r) {
      if (r.data && r.data.session) { session = r.data.session; loadProfile(); refreshHeader(); }
    });
  }
  function refreshHeader() {
    var b = document.getElementById("account-btn");
    if (b) b.textContent = session ? "👤" : "👤";
  }
})();
