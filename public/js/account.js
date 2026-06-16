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
  var confirmEmail = null; // set after signup when email confirmation is required

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
    { id: "rounds100", icon: "🏹", title: "Round Machine", desc: "Win 100 online rounds", test: function (s) { return (s.mpRoundWins || 0) >= 100; } },
    { id: "chain50", icon: "⛓️", title: "Chain Legend", desc: "50-link daily chain", test: function (s) { return (s.bestChain || 0) >= 50; } },
    { id: "names100", icon: "📣", title: "Name Dropper", desc: "Say 100 names", test: function (s) { return (s.namesSaid || 0) >= 100; } },
    { id: "names500", icon: "📚", title: "Encyclopedia", desc: "Say 500 names", test: function (s) { return (s.namesSaid || 0) >= 500; } },
    { id: "names2000", icon: "🧠", title: "Walking Almanac", desc: "Say 2,000 names", test: function (s) { return (s.namesSaid || 0) >= 2000; } },
    { id: "buzzer", icon: "⚡", title: "Buzzer Beater", desc: "Answer with under 2s left", test: function (s) { return !!(s.feats && s.feats.buzzer); } },
    { id: "flawless", icon: "🛡️", title: "Flawless", desc: "Win a match losing no rounds", test: function (s) { return !!(s.feats && s.feats.flawless); } },
    { id: "specialist", icon: "🎓", title: "Specialist", desc: "Win a single-league match", test: function (s) { return !!(s.feats && s.feats.specialist); } },
    { id: "friend1", icon: "🤝", title: "Squad Up", desc: "Add your first friend", test: function (s) { return (s.friends || 0) >= 1; } },
    { id: "friend5", icon: "🌐", title: "Well Connected", desc: "Add 5 friends", test: function (s) { return (s.friends || 0) >= 5; } },
    { id: "loyal", icon: "💞", title: "Ride or Die", desc: "Say one player 15 times", test: function (s) { return topPlayerCount(s) >= 15; } },
    { id: "ppwin1", icon: "📱", title: "House Champion", desc: "Win a Pass & Play match", test: function (s) { return (s.ppMatchWins || 0) >= 1; } },
    { id: "ppwin10", icon: "🎮", title: "Party Dominator", desc: "Win 10 Pass & Play matches", test: function (s) { return (s.ppMatchWins || 0) >= 10; } },
  ];

  function evaluate() {
    var s = load();
    // keep an all-time best streak even after a current streak resets
    var bs = Math.max(s.bestStreak || 0, s.streak || 0);
    if (bs !== (s.bestStreak || 0)) { s.bestStreak = bs; try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) {} }
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
  function recordPPMatchWin() {
    var s = load();
    s.ppMatchWins = (s.ppMatchWins || 0) + 1;
    save(s); evaluate();
  }
  // Count every accepted athlete name + tally it per-player for "most-played".
  var nameT = null;
  function recordName(name) {
    var s = load();
    s.namesSaid = (s.namesSaid || 0) + 1;
    if (name) { s.players = s.players || {}; s.players[name] = (s.players[name] || 0) + 1; }
    save(s);
    clearTimeout(nameT); nameT = setTimeout(evaluate, 800); // batch achievement checks
  }
  function topPlayer(s) {
    var p = s.players, best = null, bc = 0;
    if (!p) return null;
    for (var k in p) if (p[k] > bc) { bc = p[k]; best = k; }
    return best ? { name: best, count: bc } : null;
  }
  function topPlayerCount(s) { var t = topPlayer(s); return t ? t.count : 0; }

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
    s.namesSaid = Math.max(s.namesSaid || 0, cloud.namesSaid || 0);
    s.bestStreak = Math.max(s.bestStreak || 0, cloud.bestStreak || 0, s.streak || 0);
    s.friends = Math.max(s.friends || 0, cloud.friends || 0);
    if (cloud.players) {
      s.players = s.players || {};
      for (var pk in cloud.players) s.players[pk] = Math.max(s.players[pk] || 0, cloud.players[pk]);
    }
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
        loadFriends(function () { if (open) renderAccount(); });
        startInvitePolling();
        if (open) renderAccount();
      } else {
        var pending = localStorage.getItem("ng-pending-username") || (u.email ? u.email.split("@")[0] : "player");
        createProfile(u.id, pending, function (p) {
          profile = p;
          localStorage.removeItem("ng-pending-username");
          startInvitePolling();
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
    friends = []; friendsLoaded = false;
    stopInvitePolling();
    if (open) renderAccount();
  }

  /* ---------------- friends ---------------- */
  var friends = [];          // [{ id, username, stats, achievements }]
  var friendsLoaded = false;
  var searchT = null;

  function setFriendCount(n) {
    var s = load();
    if ((s.friends || 0) !== n) { s.friends = n; save(s); evaluate(); }
  }
  function loadFriends(cb) {
    if (!DB || !session) { friends = []; return cb && cb(); }
    DB.from("friends").select("friend_id").eq("user_id", session.user.id).then(function (r) {
      var ids = (r.data || []).map(function (x) { return x.friend_id; });
      friendsLoaded = true;
      if (!ids.length) { friends = []; setFriendCount(0); return cb && cb(); }
      DB.from("profiles").select("id,username,stats,achievements").in("id", ids).then(function (p) {
        friends = p.data || [];
        setFriendCount(friends.length);
        cb && cb();
      });
    });
  }
  function addFriend(id, cb) {
    if (!DB || !session) return cb && cb({ ok: false });
    DB.from("friends").insert({ user_id: session.user.id, friend_id: id })
      .then(function (r) { cb && cb({ ok: !r.error, error: r.error }); });
  }
  function removeFriend(id, cb) {
    if (!DB || !session) return cb && cb({ ok: false });
    DB.from("friends").delete().eq("user_id", session.user.id).eq("friend_id", id)
      .then(function (r) { cb && cb({ ok: !r.error }); });
  }
  function searchUsers(q, cb) {
    q = (q || "").trim();
    if (!DB || !session || q.length < 2) return cb([]);
    DB.from("profiles").select("id,username,stats,achievements")
      .ilike("username", "%" + q + "%").neq("id", session.user.id).limit(12)
      .then(function (r) { cb(r && !r.error ? (r.data || []) : []); });
  }

  function friendStatLine(p) {
    var st = p.stats || {};
    return "🔗 " + (st.bestChain || 0) + " · 🏆 " + (st.mpMatchWins || 0) + " · " + ((p.achievements || []).length) + " badges";
  }
  function friendsPanel() {
    return (
      '<div class="panel"><h3>Friends</h3>' +
      '<div class="friend-search"><input type="text" id="fr-q" placeholder="Search a username to add…" autocomplete="off" maxlength="20" /></div>' +
      '<div id="fr-results" class="friend-results"></div>' +
      '<div id="fr-list" class="friend-list"></div>' +
      "</div>"
    );
  }
  function renderFriendList() {
    var el = document.getElementById("fr-list");
    if (!el) return;
    if (!friends.length) { el.innerHTML = '<p class="hint">No friends yet — search a username above to add one.</p>'; return; }
    el.innerHTML = friends.map(function (p, i) {
      return '<div class="friend-row"><div class="fr-main" data-view="' + i + '"><div class="fr-name">@' + esc(p.username) +
        ' <span class="fr-chev">›</span></div><div class="fr-stat">' + friendStatLine(p) + '</div></div>' +
        '<button class="ghost-btn sm" data-rm="' + esc(p.id) + '">Remove</button></div>';
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll("[data-view]"), function (m) {
      m.onclick = function () { renderFriendProfile(friends[+m.getAttribute("data-view")]); };
    });
    Array.prototype.forEach.call(el.querySelectorAll("[data-rm]"), function (b) {
      b.onclick = function () {
        removeFriend(b.getAttribute("data-rm"), function () {
          loadFriends(function () { renderFriendList(); reSearch(); });
        });
      };
    });
  }
  function renderFriendResults(arr) {
    var el = document.getElementById("fr-results");
    if (!el) return;
    var have = {}; friends.forEach(function (f) { have[f.id] = true; });
    if (!arr.length) { el.innerHTML = ""; return; }
    el.innerHTML = arr.map(function (p) {
      var added = have[p.id];
      return '<div class="friend-row res"><div class="fr-main"><div class="fr-name">@' + esc(p.username) +
        '</div><div class="fr-stat">' + friendStatLine(p) + '</div></div>' +
        (added ? '<span class="fr-added">✓ Added</span>'
               : '<button class="primary-btn sm" data-add="' + esc(p.id) + '">Add</button>') + "</div>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll("[data-add]"), function (b) {
      b.onclick = function () {
        b.disabled = true;
        addFriend(b.getAttribute("data-add"), function (r) {
          if (r.ok) loadFriends(function () { renderFriendList(); reSearch(); });
          else b.disabled = false;
        });
      };
    });
  }
  function doSearch(q) {
    clearTimeout(searchT);
    searchT = setTimeout(function () { searchUsers(q, renderFriendResults); }, 250);
  }
  function reSearch() {
    var q = document.getElementById("fr-q");
    if (q && q.value.trim().length >= 2) searchUsers(q.value, renderFriendResults);
  }
  function wireFriends() {
    var q = document.getElementById("fr-q");
    if (q) q.addEventListener("input", function () { doSearch(q.value); });
    if (friendsLoaded) renderFriendList();
    else loadFriends(function () { renderFriendList(); });
  }

  // Full profile of a friend: most-played, stats, badges, + invite to a game.
  function renderFriendProfile(p) {
    var box = document.getElementById("account-body");
    if (!box || !p) return;
    var st = p.stats || {};
    box.innerHTML =
      '<button class="back sm" id="fr-back">‹ Friends</button>' +
      '<div class="turn-card" style="text-align:center;margin-top:10px">' +
      '<div class="turn-player you">Friend</div>' +
      '<div class="turn-name">@' + esc(p.username) + "</div></div>" +
      mostPlayedFrom(st) +
      statsPanelFrom(st, (p.achievements || []).length) +
      '<button class="primary-btn" id="fr-invite">🎮 Invite to a game</button>' +
      '<p class="hint" id="fr-invite-msg" style="margin:8px 0 14px"></p>' +
      achGridFrom(p.achievements, "Badges");
    document.getElementById("fr-back").onclick = function () { renderAccount(); };
    document.getElementById("fr-invite").onclick = function () { inviteFriend(p, this); };
  }

  // Create a room (host lands in the lobby) and drop an invite for the friend.
  function inviteFriend(p, btn) {
    if (!window.NameGameOnline) return;
    if (btn) { btn.disabled = true; btn.textContent = "Setting up…"; }
    NameGameOnline.hostAndInvite(profile ? profile.username : "Player", function (code) {
      if (!code) { if (btn) { btn.disabled = false; btn.textContent = "🎮 Invite to a game"; } return; }
      if (DB && session && profile) {
        DB.from("game_invites").insert({
          from_user_id: session.user.id, from_username: profile.username,
          to_user_id: p.id, code: code,
        }).then(function () {}, function () {});
      }
      // host has already been moved into the lobby (online-room screen)
    });
  }

  /* ---- incoming invites (polled while signed in) ---- */
  var invitePoll = null, shownInvites = {};
  function startInvitePolling() {
    if (!DB || !session) return;
    if (invitePoll) clearInterval(invitePoll);
    pollInvites();
    invitePoll = setInterval(pollInvites, 6000);
  }
  function stopInvitePolling() { if (invitePoll) { clearInterval(invitePoll); invitePoll = null; } shownInvites = {}; }
  function pollInvites() {
    if (!DB || !session) return;
    var since = new Date(Date.now() - 120000).toISOString(); // only recent invites
    DB.from("game_invites").select("*").eq("to_user_id", session.user.id)
      .gte("created_at", since).order("created_at", { ascending: false }).limit(1)
      .then(function (r) {
        var inv = r && r.data && r.data[0];
        if (inv && !shownInvites[inv.id]) { shownInvites[inv.id] = true; showInviteBanner(inv); }
      }, function () {});
  }
  function showInviteBanner(inv) {
    var el = document.createElement("div");
    el.className = "invite-banner";
    el.innerHTML =
      '<div class="ib-text">🎮 <b>@' + esc(inv.from_username || "A friend") + "</b> invited you to a game</div>" +
      '<div class="ib-actions"><button class="primary-btn sm" id="ib-join">Join</button>' +
      '<button class="ghost-btn sm" id="ib-no">Dismiss</button></div>';
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add("show"); }, 20);
    function close() {
      el.classList.remove("show");
      setTimeout(function () { el.remove(); }, 300);
      if (DB) DB.from("game_invites").delete().eq("id", inv.id).then(function () {}, function () {});
    }
    document.getElementById("ib-join").onclick = function () {
      close();
      if (window.NameGameOnline) NameGameOnline.joinByCode(inv.code, profile ? profile.username : "Player");
    };
    document.getElementById("ib-no").onclick = close;
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

  function achGridFrom(achArr, title) {
    var have = {};
    (achArr || []).forEach(function (id) { have[id] = true; });
    var count = (achArr || []).length;
    return (
      '<div class="panel"><h3>' + (title || "Achievements") + " (" + count + "/" + ACH.length + ")</h3>" +
      '<div class="ach-grid">' +
      ACH.map(function (a) {
        var on = !!have[a.id];
        return '<div class="ach' + (on ? " on" : "") + '"><div class="ach-ico">' + a.icon +
          '</div><div class="ach-t">' + esc(a.title) + '</div><div class="ach-d">' + esc(a.desc) + "</div></div>";
      }).join("") +
      "</div></div>"
    );
  }
  function achGrid() { return achGridFrom(load().achievements); }

  function statBox(n, l) {
    return '<div class="stat"><div class="stat-n">' + n + '</div><div class="stat-l">' + l + "</div></div>";
  }
  function mostPlayedFrom(s) {
    var t = topPlayer(s || {});
    if (!t) return "";
    return (
      '<div class="panel mvp"><div class="mvp-label">⭐ Most-played player</div>' +
      '<div class="mvp-name">' + esc(t.name) + "</div>" +
      '<div class="mvp-count">said ' + t.count + (t.count === 1 ? " time" : " times") + "</div></div>" +
      '<div style="height:12px"></div>'
    );
  }
  function mostPlayedHtml() { return mostPlayedFrom(load()); }
  function statsPanelFrom(s, badgeCount) {
    s = s || {};
    if (badgeCount == null) badgeCount = (s.achievements || []).length;
    return (
      '<div class="panel"><h3>Statistics</h3><div class="stat-grid">' +
      statBox(s.bestChain || 0, "Best chain") +
      statBox(s.streak || 0, "Day streak") +
      statBox(s.bestStreak || s.streak || 0, "Best streak") +
      statBox(s.mpMatchWins || 0, "Online wins") +
      statBox(s.ppMatchWins || 0, "P&P wins") +
      statBox(s.mpRoundWins || 0, "Round wins") +
      statBox(s.namesSaid || 0, "Names said") +
      statBox(badgeCount, "Badges") +
      "</div></div>"
    );
  }
  function statsPanel() { return statsPanelFrom(load()); }

  function renderAccount() {
    var box = document.getElementById("account-body");
    if (!box) return;
    if (session && profile) {
      box.innerHTML =
        '<div class="turn-card" style="text-align:center">' +
        '<div class="turn-player you">Signed in</div>' +
        '<div class="turn-name">@' + esc(profile.username) + "</div>" +
        '<p class="hint" style="margin:6px 0 0">Your progress syncs to the cloud. ☁️</p></div>' +
        mostPlayedHtml() +
        statsPanel() + '<div style="height:12px"></div>' +
        friendsPanel() + '<div style="height:12px"></div>' +
        achGrid() +
        '<button class="ghost-btn" id="acc-signout">Sign out</button>';
      document.getElementById("acc-signout").onclick = signOut;
      wireFriends();
      return;
    }
    if (confirmEmail) {
      box.innerHTML =
        '<div class="turn-card" style="text-align:center">' +
        '<div class="trophy" style="font-size:46px">📧</div>' +
        '<div class="turn-name" style="font-size:22px">Confirm your email</div>' +
        '<p class="op-sub" style="margin:10px 0 16px">We sent a confirmation link to <b>' + esc(confirmEmail) +
        "</b>. Open it (check spam too), then come back and log in.</p>" +
        '<button class="primary-btn" id="acc-confirm-done">I’ve confirmed — log in</button>' +
        "</div>";
      document.getElementById("acc-confirm-done").onclick = function () {
        confirmEmail = null; mode = "login"; renderAccount();
      };
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
        if (r.needsConfirm) { confirmEmail = email; renderAccount(); return; }
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

  /* ---------------- daily leaderboard ---------------- */
  function submitDailyScore(day, score) {
    if (!DB || !session || !profile) return;
    DB.from("daily_scores")
      .upsert({ user_id: session.user.id, day: day, username: profile.username, score: score }, { onConflict: "user_id,day" })
      .then(function () {}, function () {});
  }
  function fetchLeaderboard(day, cb) {
    if (!DB) return cb(null);
    DB.from("daily_scores").select("username,score").eq("day", day)
      .order("score", { ascending: false }).limit(50)
      .then(function (r) { cb(r && !r.error ? (r.data || []) : null); });
  }

  window.NameGameAccount = {
    open: openScreen,
    afterDaily: afterDaily,
    submitDailyScore: submitDailyScore,
    fetchLeaderboard: fetchLeaderboard,
    recordRoundWin: recordRoundWin,
    recordMatchWin: recordMatchWin,
    recordPPMatchWin: recordPPMatchWin,
    recordFeat: recordFeat,
    recordName: recordName,
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
