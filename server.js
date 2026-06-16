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
const RECONNECT_GRACE_MS = 60000; // how long a dropped player keeps their seat

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
      team: p.team,
      isHost: p.id === room.hostId,
      disconnected: !!p.disconnected,
    })),
    spectators: room.spectators ? room.spectators.size : 0,
    currentPlayerId: room.order[room.turnIndex] || null,
    requiredLetter: room.requiredLetter,
    history: room.history,
    deadlineTs: room.deadlineTs,
    paused: room.paused,
    pauseRemaining: room.pauseRemaining,
    challenge: room.challenge,
    teams: room.teams || 0,
    scores: room.teams > 0
      ? room.teamScores.map((sc, i) => ({ id: "team" + i, name: "Team " + TEAM_LETTER[i], score: sc }))
      : room.players.map((p) => ({ id: p.id, name: p.name, score: (room.scores && room.scores[p.id]) || 0 })),
    round: room.round,
    roundWinnerId: room.roundWinnerId,
    roundWinnerTeam: room.roundWinnerTeam,
    lastOut: room.lastOut || null,
    winnerId: room.winnerId,
    winnerTeam: room.winnerTeam,
    lastError: null,
  };
}

function broadcast(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}

function alivePlayers(room) {
  return room.players.filter((p) => p.alive);
}

const TEAM_LETTER = ["A", "B", "C", "D"];
function aliveTeams(room) {
  const set = {};
  room.players.forEach((p) => { if (p.alive && p.team != null) set[p.team] = true; });
  return Object.keys(set).map(Number);
}
function roundIsOver(room) {
  return room.teams > 0 ? aliveTeams(room).length <= 1 : aliveOrder(room).length <= 1;
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
  if (roundIsOver(room)) return endRound(room);
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
  if (roundIsOver(room)) return endRound(room);
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
    // Recap: real names this player could have said (athlete games only).
    if (room.gameType !== "custom") {
      room.lastOut = {
        player: p.name,
        letter: room.requiredLetter,
        missed: Rules.suggest({
          index: fullIndex, settings: room.settings,
          usedKeys: room.usedKeys, requiredLetter: room.requiredLetter,
        }, 6),
      };
    }
  }
  const alive = alivePlayers(room);
  if (roundIsOver(room)) return endRound(room);
  startTurn(room);
}

// A round ended. Award a point to the last player/team standing; if they hit
// the target it's match over, else show the scoreboard and auto-advance.
function endRound(room) {
  clearTimer(room);
  room.deadlineTs = null;
  room.paused = false;
  room.challenge = null;
  room.decide = null;

  if (room.teams > 0) {
    const at = aliveTeams(room);
    const wTeam = at.length ? at[0] : -1;
    room.roundWinnerTeam = wTeam;
    room.roundWinnerId = null;
    if (wTeam >= 0) {
      room.teamScores[wTeam] = (room.teamScores[wTeam] || 0) + 1;
      room.history.push({ type: "roundwin", player: "Team " + TEAM_LETTER[wTeam], score: room.teamScores[wTeam] });
    }
    if (wTeam >= 0 && room.teamScores[wTeam] >= room.settings.target) {
      room.status = "ended"; room.winnerTeam = wTeam; room.winnerId = null; broadcast(room);
    } else {
      room.status = "roundover"; broadcast(room);
      if (room.nextTimer) clearTimeout(room.nextTimer);
      room.nextTimer = setTimeout(() => startRound(room), 6000);
    }
    return;
  }

  const alive = alivePlayers(room);
  const winnerId = alive.length ? alive[0].id : null;
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
  room.roundWinnerTeam = -1;
  room.lastOut = null;
  room.round = (room.round || 0) + 1;
  room.order = shuffle(room.players.map((p) => p.id));
  room.turnIndex = -1;
  room.status = "playing";
  startTurn(room);
}

// Start a new match: reset scores, assign teams, then start round 1.
function startMatch(room) {
  let teams = room.settings.teams || 0;
  if (teams > room.players.length) teams = room.players.length;
  room.teams = teams;
  room.players.forEach((p, i) => (p.team = teams > 0 ? i % teams : null));
  room.teamScores = teams > 0 ? new Array(teams).fill(0) : null;
  room.scores = {};
  room.players.forEach((p) => (room.scores[p.id] = 0));
  room.round = 0;
  room.winnerId = null;
  room.winnerTeam = -1;
  room.roundWinnerId = null;
  room.roundWinnerTeam = -1;
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
  room.teams = 0;
  room.teamScores = null;
  room.winnerTeam = -1;
  room.roundWinnerTeam = -1;
  room.players.forEach((p) => (p.team = null));
  if (room.nextTimer) { clearTimeout(room.nextTimer); room.nextTimer = null; }
}

// Rewrite every place a socket id is used as a player's identity, so a
// reconnecting player (new socket) keeps their slot, turn, and score.
function remapId(room, oldId, newId) {
  room.players.forEach((p) => { if (p.id === oldId) p.id = newId; });
  room.order = room.order.map((id) => (id === oldId ? newId : id));
  if (room.hostId === oldId) room.hostId = newId;
  if (room.roundWinnerId === oldId) room.roundWinnerId = newId;
  if (room.winnerId === oldId) room.winnerId = newId;
  if (room.scores && room.scores[oldId] != null) { room.scores[newId] = room.scores[oldId]; delete room.scores[oldId]; }
  (room.turnsStack || []).forEach((t) => { if (t.playerId === oldId) t.playerId = newId; });
  if (room.decide && room.decide.byId === oldId) room.decide.byId = newId;
  if (room.lastRejected && room.lastRejected.playerId === oldId) room.lastRejected.playerId = newId;
}

// Actually remove a player (called when their reconnect grace period expires).
function dropPlayer(room, playerId) {
  const wasCurrent = room.order[room.turnIndex] === playerId;
  room.players = room.players.filter((p) => p.id !== playerId);
  if (room.players.length === 0) {
    clearTimer(room);
    if (room.nextTimer) clearTimeout(room.nextTimer);
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === playerId) room.hostId = room.players[0].id;
  if (room.status === "playing") {
    if (roundIsOver(room)) endRound(room);
    else if (wasCurrent) startTurn(room);
    else broadcast(room);
  } else {
    broadcast(room);
  }
}

/* --------------------------------------------------------------- sockets */
io.on("connection", (socket) => {
  let joinedCode = null;

  socket.on("room:create", ({ name, gameType, settings, clientId }, cb) => {
    const code = makeCode();
    const type = gameType === "custom" ? "custom" : "athlete";
    const room = {
      code,
      hostId: socket.id,
      gameType: type,
      settings: sanitizeSettings(type, settings),
      decide: null,
      players: [{ id: socket.id, clientId: clientId || socket.id, name: cleanName(name), alive: true }],
      spectators: new Set(),
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
      teams: 0,
      teamScores: null,
      winnerTeam: -1,
      roundWinnerTeam: -1,
      timer: null,
      nextTimer: null,
    };
    rooms.set(code, room);
    socket.join(code);
    joinedCode = code;
    cb && cb({ ok: true, code, room: publicRoom(room) });
    broadcast(room);
  });

  socket.on("room:join", ({ code, name, clientId }, cb) => {
    code = (code || "").toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, message: "No room with that code." });
    if (room.status !== "lobby")
      return cb && cb({ ok: false, message: "That game has already started.", canSpectate: true });
    if (room.players.length >= 12)
      return cb && cb({ ok: false, message: "Room is full.", canSpectate: true });
    room.players.push({ id: socket.id, clientId: clientId || socket.id, name: cleanName(name), alive: true });
    socket.join(code);
    joinedCode = code;
    cb && cb({ ok: true, code, room: publicRoom(room) });
    broadcast(room);
  });

  // Rejoin a room you were dropped from (phone lock, refresh, signal loss).
  socket.on("room:rejoin", ({ code, clientId }, cb) => {
    code = (code || "").toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, message: "That game is no longer available." });
    const p = room.players.find((x) => x.clientId && x.clientId === clientId);
    if (!p) return cb && cb({ ok: false, message: "Couldn’t find your spot in that game.", canSpectate: true });
    if (p.dcTimer) { clearTimeout(p.dcTimer); p.dcTimer = null; }
    remapId(room, p.id, socket.id);
    p.disconnected = false;
    socket.join(code);
    joinedCode = code;
    cb && cb({ ok: true, code, room: publicRoom(room) });
    broadcast(room);
  });

  // Watch a game already in progress, without taking a seat.
  socket.on("room:spectate", ({ code }, cb) => {
    code = (code || "").toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, message: "No room with that code." });
    room.spectators.add(socket.id);
    socket.join(code);
    joinedCode = code;
    cb && cb({ ok: true, code, room: publicRoom(room), spectator: true });
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
    // Spectators just leave.
    if (room.spectators && room.spectators.has(socket.id)) {
      room.spectators.delete(socket.id);
      broadcast(room);
      return;
    }
    const p = room.players.find((x) => x.id === socket.id);
    if (!p) return;
    // Give the player a grace window to reconnect before we remove them.
    p.disconnected = true;
    if (p.dcTimer) clearTimeout(p.dcTimer);
    const dropId = socket.id;
    p.dcTimer = setTimeout(() => {
      const r = rooms.get(joinedCode);
      if (!r) return;
      const still = r.players.find((x) => x.id === dropId && x.disconnected);
      if (still) dropPlayer(r, dropId);
    }, RECONNECT_GRACE_MS);
    broadcast(room); // show "(reconnecting…)" to everyone
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
  const allowed = ["NBA", "MLB", "NFL", "NHL", "SOC", "CFB", "CBB"];
  let leagues = Array.isArray(s.leagues)
    ? s.leagues.filter((l) => allowed.indexOf(l) !== -1)
    : [];
  if (!leagues.length) leagues = allowed.slice();
  const era = ["current", "past", "both"].indexOf(s.era) !== -1 ? s.era : "both";
  const difficulty = s.difficulty === "stars" ? "stars" : "all";
  let teams = parseInt(s.teams, 10);
  if (isNaN(teams)) teams = 0;
  teams = Math.max(0, Math.min(4, teams)); // 0 = solo, else 2-4 teams
  return { leagues, era, difficulty, timer, target, teams };
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
