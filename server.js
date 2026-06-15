/*
 * Name Game server.
 * - Serves the static frontend from /public
 * - Exposes the athlete database at /data/athletes.json
 * - Runs authoritative online multiplayer over Socket.io (room codes + turns)
 */
const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const compression = require("compression");
const { Server } = require("socket.io");
const Rules = require("./public/js/rules.js");

const PORT = process.env.PORT || 3000;
const TURN_SECONDS = 30;

const athletes = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "athletes.json"), "utf8")
);
const fullIndex = Rules.buildIndex(athletes);

const app = express();
app.use(compression()); // gzip — the athlete DB is ~3.8MB raw, ~445KB gzipped
// Allow the native (Capacitor) app to fetch the database cross-origin.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});
app.use(express.static(path.join(__dirname, "public")));
app.use("/data", express.static(path.join(__dirname, "data")));
app.get("/health", (_req, res) => res.json({ ok: true, athletes: athletes.length }));

const server = http.createServer(app);
// CORS so the native shell (capacitor://localhost) can reach Socket.io.
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

/* ---------------------------------------------------------------- rooms */
const rooms = new Map(); // code -> room

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 4 }, () =>
      alphabet[Math.floor(Math.random() * alphabet.length)]
    ).join("");
  } while (rooms.has(code));
  return code;
}

function publicRoom(room) {
  return {
    code: room.code,
    gameType: room.gameType,
    settings: room.settings,
    decide: room.decide,
    status: room.status,
    hostId: room.hostId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      isHost: p.id === room.hostId,
    })),
    currentPlayerId: room.order[room.turnIndex] || null,
    requiredLetter: room.requiredLetter,
    history: room.history,
    deadlineTs: room.deadlineTs,
    paused: room.paused,
    pauseRemaining: room.pauseRemaining,
    challenge: room.challenge,
    scores: room.players.map((p) => ({ id: p.id, name: p.name, score: (room.scores && room.scores[p.id]) || 0 })),
    round: room.round,
    roundWinnerId: room.roundWinnerId,
    winnerId: room.winnerId,
    lastError: null,
  };
}

function broadcast(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}

function alivePlayers(room) {
  return room.players.filter((p) => p.alive);
}

function clearTimer(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

// Custom: after a rejected name, resume the SAME player's clock (no advance).
function resumeAfterDecide(room) {
  clearTimer(room);
  if (room.settings.timer > 0) {
    const remaining = room.pauseRemaining || room.settings.timer * 1000;
    room.deadlineTs = Date.now() + remaining;
    room.timer = setTimeout(() => {
      eliminate(room, room.order[room.turnIndex], "ran out of time");
    }, remaining);
  } else {
    room.deadlineTs = null;
  }
  room.pauseRemaining = 0;
  broadcast(room);
}

// Un-pause: restore the remaining time (or no timer at all).
function resumeClock(room) {
  room.paused = false;
  room.challenge = null;
  clearTimer(room);
  if (room.settings.timer > 0) {
    const remaining = room.pauseRemaining || room.settings.timer * 1000;
    room.deadlineTs = Date.now() + remaining;
    room.timer = setTimeout(() => {
      eliminate(room, room.order[room.turnIndex], "ran out of time");
    }, remaining);
  } else {
    room.deadlineTs = null;
  }
  room.pauseRemaining = 0;
}

function aliveOrder(room) {
  return room.order.filter((id) => room.players.find((p) => p.id === id && p.alive));
}

// Set up the turn for whoever room.turnIndex currently points at (no advance).
// Used both for a fresh turn and for "redo turn" after a rejected challenge.
function beginTurnAt(room) {
  clearTimer(room);
  if (aliveOrder(room).length <= 1) return endRound(room, aliveOrder(room)[0] || null);
  // make sure the index lands on an alive player
  let guard = 0;
  while (
    guard++ <= room.order.length &&
    !room.players.find((p) => p.id === room.order[room.turnIndex] && p.alive)
  ) {
    room.turnIndex = (room.turnIndex + 1) % room.order.length;
  }
  room.lastRejected = null;
  room.paused = false;
  room.challenge = null;
  room.decide = null;
  room.pauseRemaining = 0;
  const secs = room.settings.timer;
  if (secs > 0) {
    room.deadlineTs = Date.now() + secs * 1000;
    room.timer = setTimeout(() => {
      eliminate(room, room.order[room.turnIndex], "ran out of time");
    }, secs * 1000);
  } else {
    room.deadlineTs = null; // no timer
  }
  broadcast(room);
}

// Advance to the next alive player, then begin their turn.
function startTurn(room) {
  clearTimer(room);
  if (aliveOrder(room).length <= 1) return endRound(room, aliveOrder(room)[0] || null);
  let guard = 0;
  do {
    room.turnIndex = (room.turnIndex + 1) % room.order.length;
    guard++;
  } while (
    guard <= room.order.length &&
    !room.players.find((p) => p.id === room.order[room.turnIndex] && p.alive)
  );
  beginTurnAt(room);
}

function eliminate(room, playerId, reason) {
  const p = room.players.find((x) => x.id === playerId);
  if (p && p.alive) {
    p.alive = false;
    room.history.push({ type: "out", player: p.name, reason });
  }
  const alive = alivePlayers(room);
  if (alive.length <= 1) return endRound(room, alive[0] ? alive[0].id : null);
  startTurn(room);
}

// A round ended (one player left). Award a point; if they hit the target it's
// match over, otherwise show the scoreboard and auto-start the next round.
function endRound(room, winnerId) {
  clearTimer(room);
  room.deadlineTs = null;
  room.paused = false;
  room.challenge = null;
  room.roundWinnerId = winnerId || null;
  const w = room.players.find((p) => p.id === winnerId);
  if (winnerId) {
    room.scores[winnerId] = (room.scores[winnerId] || 0) + 1;
    if (w) room.history.push({ type: "roundwin", player: w.name, score: room.scores[winnerId] });
  }
  if (winnerId && room.scores[winnerId] >= room.settings.target) {
    room.status = "ended";
    room.winnerId = winnerId;
    broadcast(room);
  } else {
    room.status = "roundover";
    broadcast(room);
    if (room.nextTimer) clearTimeout(room.nextTimer);
    room.nextTimer = setTimeout(() => startRound(room), 6000); // auto-advance
  }
}

// Begin a fresh round (keeps scores). Order is reshuffled each round.
function startRound(room) {
  if (room.nextTimer) { clearTimeout(room.nextTimer); room.nextTimer = null; }
  clearTimer(room);
  room.players.forEach((p) => (p.alive = true));
  room.usedKeys = new Set();
  room.requiredLetter = "";
  room.history = [];
  room.turnsStack = [];
  room.lastRejected = null;
  room.paused = false;
  room.challenge = null;
  room.pauseRemaining = 0;
  room.roundWinnerId = null;
  room.round = (room.round || 0) + 1;
  room.order = shuffle(room.players.map((p) => p.id));
  room.turnIndex = -1;
  room.status = "playing";
  startTurn(room);
}

// Start a new match: reset scores to zero, then start round 1.
function startMatch(room) {
  room.scores = {};
  room.players.forEach((p) => (room.scores[p.id] = 0));
  room.round = 0;
  room.winnerId = null;
  room.roundWinnerId = null;
  startRound(room);
}

function resetRoom(room) {
  clearTimer(room);
  room.status = "lobby";
  room.players.forEach((p) => (p.alive = true));
  room.order = [];
  room.turnIndex = -1;
  room.requiredLetter = "";
  room.usedKeys = new Set();
  room.history = [];
  room.deadlineTs = null;
  room.paused = false;
  room.pauseRemaining = 0;
  room.challenge = null;
  room.decide = null;
  room.turnsStack = [];
  room.lastRejected = null;
  room.scores = {};
  room.round = 0;
  room.roundWinnerId = null;
  room.winnerId = null;
  if (room.nextTimer) { clearTimeout(room.nextTimer); room.nextTimer = null; }
}

/* --------------------------------------------------------------- sockets */
io.on("connection", (socket) => {
  let joinedCode = null;

  socket.on("room:create", ({ name, gameType, settings }, cb) => {
    const code = makeCode();
    const type = gameType === "custom" ? "custom" : "athlete";
    const room = {
      code,
      hostId: socket.id,
      gameType: type,
      settings: sanitizeSettings(type, settings),
      decide: null,
      players: [{ id: socket.id, name: cleanName(name), alive: true }],
      status: "lobby",
      order: [],
      turnIndex: -1,
      requiredLetter: "",
      usedKeys: new Set(),
      history: [],
      deadlineTs: null,
      paused: false,
      pauseRemaining: 0,
      challenge: null,
      turnsStack: [],
      lastRejected: null,
      scores: {},
      round: 0,
      roundWinnerId: null,
      winnerId: null,
      timer: null,
      nextTimer: null,
    };
    rooms.set(code, room);
    socket.join(code);
    joinedCode = code;
    cb && cb({ ok: true, code, room: publicRoom(room) });
    broadcast(room);
  });

  socket.on("room:join", ({ code, name }, cb) => {
    code = (code || "").toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, message: "No room with that code." });
    if (room.status !== "lobby")
      return cb && cb({ ok: false, message: "That game has already started." });
    if (room.players.length >= 12)
      return cb && cb({ ok: false, message: "Room is full." });
    room.players.push({ id: socket.id, name: cleanName(name), alive: true });
    socket.join(code);
    joinedCode = code;
    cb && cb({ ok: true, code, room: publicRoom(room) });
    broadcast(room);
  });

  socket.on("room:settings", ({ gameType, settings }) => {
    const room = rooms.get(joinedCode);
    if (!room || room.hostId !== socket.id || room.status !== "lobby") return;
    if (gameType === "custom" || gameType === "athlete") room.gameType = gameType;
    room.settings = sanitizeSettings(room.gameType, settings);
    broadcast(room);
  });

  socket.on("game:start", () => {
    const room = rooms.get(joinedCode);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) return;
    resetRoom(room);
    startMatch(room); // resets scores, plays round 1
  });

  socket.on("game:nextround", () => {
    const room = rooms.get(joinedCode);
    if (!room || room.status !== "roundover") return;
    if (room.hostId !== socket.id) return; // host skips the auto-advance wait
    startRound(room);
  });

  socket.on("game:guess", ({ guess }, cb) => {
    const room = rooms.get(joinedCode);
    if (!room || room.status !== "playing") return;
    if (room.paused || room.challenge)
      return cb && cb({ ok: false, message: "The game is paused." });
    const currentId = room.order[room.turnIndex];
    if (currentId !== socket.id)
      return cb && cb({ ok: false, message: "It's not your turn." });

    // ---- Custom Category: honor system, no database; the table rules on it ----
    if (room.gameType === "custom") {
      if (room.decide) return cb && cb({ ok: false, message: "Waiting on the table's call." });
      const raw = (guess || "").trim();
      const key = customLetters(raw);
      if (!key) return cb && cb({ ok: false, message: "Type a name." });
      if (room.usedKeys.has(key))
        return cb && cb({ ok: false, message: '"' + raw + '" was already said. No repeats!' });
      if (room.settings.letterRule && room.requiredLetter) {
        const got = key[0].toUpperCase();
        if (got !== room.requiredLetter)
          return cb && cb({ ok: false, message: "Must start with " + room.requiredLetter + ' — "' + raw + '" starts with ' + got + "." });
      }
      // letter-valid -> freeze the clock and ask the table to decide
      if (room.settings.timer > 0 && room.deadlineTs)
        room.pauseRemaining = Math.max(0, room.deadlineTs - Date.now());
      clearTimer(room);
      room.deadlineTs = null;
      const cp = room.players.find((x) => x.id === socket.id);
      room.decide = { byId: socket.id, byName: cp ? cp.name : "?", word: raw, key: key, nextLetter: (key.slice(-1) || "").toUpperCase() };
      cb && cb({ ok: true });
      broadcast(room);
      return;
    }

    const result = Rules.validate(guess, {
      index: fullIndex,
      settings: room.settings,
      usedKeys: room.usedKeys,
      requiredLetter: room.requiredLetter,
    });

    if (!result.ok) {
      room.lastRejected = { playerId: socket.id, guess: (guess || "").trim() };
      return cb && cb({ ok: false, message: result.message });
    }

    const p = room.players.find((x) => x.id === socket.id);
    room.usedKeys.add(result.key);
    room.turnsStack.push({
      playerId: socket.id,
      key: result.key,
      prevRequiredLetter: room.requiredLetter,
      name: result.athlete.name,
      league: result.athlete.league,
      nextLetter: result.nextLetter,
    });
    room.requiredLetter = result.nextLetter;
    room.lastRejected = null;
    room.history.push({
      type: "said",
      player: p ? p.name : "?",
      name: result.athlete.name,
      league: result.athlete.league,
      nextLetter: result.nextLetter,
      typed: result.typed,
    });
    cb && cb({ ok: true, athlete: result.athlete });
    startTurn(room);
  });

  // --- custom: the table rules on the pending name ------------------------
  socket.on("game:decide", ({ counts }) => {
    const room = rooms.get(joinedCode);
    if (!room || room.status !== "playing" || !room.decide) return;
    if (!room.players.find((p) => p.id === socket.id)) return;
    if (socket.id === room.decide.byId) return; // you can't rule on your own answer
    const d = room.decide;
    room.decide = null;
    if (counts) {
      room.usedKeys.add(d.key);
      if (room.settings.letterRule) room.requiredLetter = d.nextLetter;
      room.history.push({ type: "said", player: d.byName, name: d.word });
      startTurn(room); // accepted -> next player, fresh clock
    } else {
      resumeAfterDecide(room); // rejected -> same player goes again
    }
  });

  // --- pause / resume -----------------------------------------------------
  socket.on("game:pause", () => {
    const room = rooms.get(joinedCode);
    if (!room || room.status !== "playing" || room.paused || room.challenge) return;
    if (!room.players.find((p) => p.id === socket.id)) return;
    if (room.settings.timer > 0 && room.deadlineTs)
      room.pauseRemaining = Math.max(0, room.deadlineTs - Date.now());
    clearTimer(room);
    room.paused = true;
    room.deadlineTs = null;
    broadcast(room);
  });

  socket.on("game:resume", () => {
    const room = rooms.get(joinedCode);
    if (!room || room.status !== "playing" || !room.paused || room.challenge) return;
    if (!room.players.find((p) => p.id === socket.id)) return;
    resumeClock(room);
    broadcast(room);
  });

  // --- challenge ----------------------------------------------------------
  socket.on("game:challenge", () => {
    const room = rooms.get(joinedCode);
    if (!room || room.status !== "playing" || room.challenge) return;
    if (!room.players.find((p) => p.id === socket.id)) return;
    if (room.settings.timer > 0 && room.deadlineTs && !room.paused)
      room.pauseRemaining = Math.max(0, room.deadlineTs - Date.now());
    clearTimer(room);
    room.paused = true;
    room.deadlineTs = null;
    if (room.lastRejected) {
      const rp = room.players.find((p) => p.id === room.lastRejected.playerId);
      room.challenge = { kind: "rejected", guess: room.lastRejected.guess, player: rp ? rp.name : "?" };
    } else if (room.turnsStack.length) {
      const t = room.turnsStack[room.turnsStack.length - 1];
      const tp = room.players.find((p) => p.id === t.playerId);
      room.challenge = { kind: "accepted", name: t.name, player: tp ? tp.name : "?" };
    } else {
      room.challenge = { kind: "none" };
    }
    broadcast(room);
  });

  socket.on("game:resolve", ({ decision }) => {
    const room = rooms.get(joinedCode);
    if (!room || room.status !== "playing" || !room.challenge) return;
    if (!room.players.find((p) => p.id === socket.id)) return;
    const ch = room.challenge;
    room.challenge = null;

    if (ch.kind === "rejected" && decision === "allow" && room.lastRejected) {
      const guess = room.lastRejected.guess;
      const key = Rules.normalize(guess);
      const nextL = Rules.firstLetterOfLastName(guess);
      const author = room.players.find((p) => p.id === room.lastRejected.playerId);
      room.usedKeys.add(key);
      room.turnsStack.push({
        playerId: room.lastRejected.playerId, key,
        prevRequiredLetter: room.requiredLetter, name: guess, league: "allowed", nextLetter: nextL,
      });
      room.history.push({ type: "said", player: author ? author.name : "?", name: guess, league: "allowed", nextLetter: nextL });
      room.requiredLetter = nextL;
      room.lastRejected = null;
      // the rejected guess was the current player's, so just advance.
      return startTurn(room);
    }

    if (ch.kind === "accepted" && decision === "reject" && room.turnsStack.length) {
      const rec = room.turnsStack.pop();
      room.usedKeys.delete(rec.key);
      room.requiredLetter = rec.prevRequiredLetter;
      for (let i = room.history.length - 1; i >= 0; i--) {
        if (room.history[i].type === "said" && room.history[i].name === rec.name) {
          room.history.splice(i, 1);
          break;
        }
      }
      const idx = room.order.indexOf(rec.playerId);
      if (idx !== -1) room.turnIndex = idx;
      return beginTurnAt(room); // that player redoes their turn
    }

    // "it counts" / "keep rejected" / nothing → just resume the clock
    resumeClock(room);
    broadcast(room);
  });

  // --- give up (concede current turn) ------------------------------------
  socket.on("game:giveup", () => {
    const room = rooms.get(joinedCode);
    if (!room || room.status !== "playing" || room.challenge) return;
    if (room.order[room.turnIndex] !== socket.id) return; // only the current player
    room.paused = false;
    eliminate(room, socket.id, "gave up");
  });

  socket.on("game:reset", () => {
    const room = rooms.get(joinedCode);
    if (!room || room.hostId !== socket.id) return;
    resetRoom(room);
    broadcast(room);
  });

  socket.on("disconnect", () => {
    const room = rooms.get(joinedCode);
    if (!room) return;
    const wasCurrent = room.order[room.turnIndex] === socket.id;
    room.players = room.players.filter((p) => p.id !== socket.id);

    if (room.players.length === 0) {
      clearTimer(room);
      if (room.nextTimer) clearTimeout(room.nextTimer);
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === socket.id) room.hostId = room.players[0].id;

    if (room.status === "playing") {
      const alive = alivePlayers(room);
      if (alive.length <= 1) endRound(room, alive[0] ? alive[0].id : null);
      else if (wasCurrent) startTurn(room);
      else broadcast(room);
    } else {
      broadcast(room);
    }
  });
});

/* --------------------------------------------------------------- helpers */
function cleanName(name) {
  return (name || "Player").toString().slice(0, 20).trim() || "Player";
}
function sanitizeSettings(gameType, s) {
  s = s || {};
  let timer = parseInt(s.timer, 10);
  if (isNaN(timer)) timer = TURN_SECONDS;
  timer = Math.max(0, Math.min(300, timer)); // 0 = off, capped at 5 min
  let target = parseInt(s.target, 10);
  if (isNaN(target)) target = 3;
  target = Math.max(1, Math.min(15, target)); // rounds to win the match

  if (gameType === "custom") {
    const category = (s.category || "").toString().slice(0, 40).trim();
    const letterRule = s.letterRule !== false;
    return { category, letterRule, timer, target };
  }
  const allowed = ["NBA", "MLB", "NFL", "NHL"];
  let leagues = Array.isArray(s.leagues)
    ? s.leagues.filter((l) => allowed.indexOf(l) !== -1)
    : [];
  if (!leagues.length) leagues = allowed.slice();
  const era = ["current", "past", "both"].indexOf(s.era) !== -1 ? s.era : "both";
  return { leagues, era, timer, target };
}

function customLetters(word) {
  return Rules.normalize(word).replace(/[^a-z0-9]/g, "");
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

server.listen(PORT, () => {
  console.log(`Name Game running on http://localhost:${PORT} (${athletes.length} athletes)`);
});
