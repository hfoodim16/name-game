// Headless two-client smoke test for the online multiplayer flow,
// including the timer setting, pause/resume, challenge, and give-up.
const { io } = require("socket.io-client");
const URL = "http://localhost:3000";
const log = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = () => io(URL, { transports: ["websocket"] });
const emit = (s, ev, payload) => new Promise((res) => s.emit(ev, payload, res));

(async () => {
  const A = mk(); // host
  const B = mk(); // joiner
  let room = null;
  [A, B].forEach((s) => s.on("room:update", (r) => (room = r)));
  await new Promise((r) => A.on("connect", r));
  await new Promise((r) => B.on("connect", r));

  const sockFor = (id) => (A.id === id ? A : B.id === id ? B : null);
  const check = (label, cond, extra) => log.push([label, cond === true, extra || ""]);

  // create with a 30s timer
  const created = await emit(A, "room:create", { name: "Alice", settings: { leagues: ["NBA"], era: "both", timer: 30 } });
  check("create (timer=30)", created.ok && created.room.settings.timer === 30, "timer=" + created.room.settings.timer);
  const code = created.code;
  await emit(B, "room:join", { code, name: "Bob" });

  A.emit("game:start");
  await wait(150);
  check("started + has deadline", room.status === "playing" && !!room.deadlineTs, "deadline set");

  // pause / resume
  sockFor(room.currentPlayerId).emit("game:pause");
  await wait(80);
  check("pause freezes clock", room.paused === true && room.deadlineTs === null, "");
  const other = room.players.find((p) => p.id !== room.currentPlayerId).id;
  sockFor(other).emit("game:resume"); // anyone can resume
  await wait(80);
  check("resume restarts clock", room.paused === false && !!room.deadlineTs, "");

  // opener
  let cur = room.currentPlayerId;
  await emit(sockFor(cur), "game:guess", { guess: "Michael Jordan" });
  await wait(80);
  check("opener accepted, next=J", room.requiredLetter === "J", "req=" + room.requiredLetter);

  // CHALLENGE the accepted answer -> doesn't count -> undo
  sockFor(room.currentPlayerId).emit("game:challenge");
  await wait(80);
  check("challenge pauses (accepted)", room.paused && room.challenge && room.challenge.kind === "accepted", room.challenge && room.challenge.kind);
  sockFor(room.currentPlayerId).emit("game:resolve", { decision: "reject" });
  await wait(80);
  check("undo reverts letter to opening", room.requiredLetter === "" && !room.challenge, "req='" + room.requiredLetter + "'");

  // current player makes a bad guess -> challenge -> allow
  cur = room.currentPlayerId;
  const bad = await emit(sockFor(cur), "game:guess", { guess: "Nonexistent Person" });
  check("bad guess rejected", bad.ok === false, bad.message ? bad.message.slice(0, 30) : "");
  sockFor(cur).emit("game:challenge");
  await wait(80);
  check("challenge (rejected kind)", room.challenge && room.challenge.kind === "rejected", room.challenge && room.challenge.kind);
  sockFor(cur).emit("game:resolve", { decision: "allow" });
  await wait(80);
  check("allow accepts it, next=P", room.requiredLetter === "P" && !room.challenge, "req=" + room.requiredLetter);

  // give up (current player concedes) -> someone gets eliminated, game ends (2 players)
  cur = room.currentPlayerId;
  sockFor(cur).emit("game:giveup");
  await wait(80);
  check("give up ends 2-player game", room.status === "ended" && !!room.winnerId, "status=" + room.status);

  // timer OFF game
  const A2created = await emit(A, "room:create", { name: "Al", settings: { leagues: ["NBA"], era: "both", timer: 0 } });
  check("create timer=off", A2created.room.settings.timer === 0, "");

  console.log("\n=== ONLINE FEATURE TEST ===");
  let pass = 0;
  log.forEach((l) => { if (l[1]) pass++; console.log((l[1] ? "PASS" : "FAIL") + "  " + l[0] + "  ::  " + l[2]); });
  console.log(`\n${pass}/${log.length} checks passed`);
  A.close(); B.close();
  process.exit(pass === log.length ? 0 : 1);
})();
