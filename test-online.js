// Headless two-client smoke test: timer, pause/resume, challenge, give-up,
// and round-based scoring (last-one-standing, first to target).
const { io } = require("socket.io-client");
const URL = "http://localhost:3000";
const log = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = () => io(URL, { transports: ["websocket"] });
const emit = (s, ev, payload) => new Promise((res) => s.emit(ev, payload, res));

(async () => {
  const A = mk(), B = mk();
  let room = null;
  [A, B].forEach((s) => s.on("room:update", (r) => (room = r)));
  await new Promise((r) => A.on("connect", r));
  await new Promise((r) => B.on("connect", r));
  const sockFor = (id) => (A.id === id ? A : B.id === id ? B : null);
  const check = (label, cond, extra) => log.push([label, cond === true, extra || ""]);
  const sum = (r) => r.scores.reduce((a, s) => a + s.score, 0);

  // ---- room with timer + target ----
  const created = await emit(A, "room:create", { name: "Alice", settings: { leagues: ["NBA"], era: "both", timer: 30, target: 3 } });
  check("create timer=30 target=3", created.room.settings.timer === 30 && created.room.settings.target === 3, "");
  const code = created.code;
  await emit(B, "room:join", { code, name: "Bob" });

  A.emit("game:start");
  await wait(150);
  check("started: round 1, scores 0", room.status === "playing" && room.round === 1 && sum(room) === 0, "round=" + room.round);

  // pause / resume
  sockFor(room.currentPlayerId).emit("game:pause");
  await wait(60);
  check("pause freezes clock", room.paused && room.deadlineTs === null, "");
  sockFor(room.players.find((p) => p.id !== room.currentPlayerId).id).emit("game:resume");
  await wait(60);
  check("resume restarts clock", !room.paused && !!room.deadlineTs, "");

  // opener + challenge undo
  let cur = room.currentPlayerId;
  await emit(sockFor(cur), "game:guess", { guess: "Michael Jordan" });
  await wait(60);
  check("opener next=J", room.requiredLetter === "J", "req=" + room.requiredLetter);
  sockFor(room.currentPlayerId).emit("game:challenge");
  await wait(60);
  check("challenge accepted-kind", room.challenge && room.challenge.kind === "accepted", "");
  sockFor(room.currentPlayerId).emit("game:resolve", { decision: "reject" });
  await wait(60);
  check("undo reverts to opening", room.requiredLetter === "" && !room.challenge, "");

  // bad guess -> challenge allow
  cur = room.currentPlayerId;
  const bad = await emit(sockFor(cur), "game:guess", { guess: "Madeup Person" });
  check("bad guess rejected", bad.ok === false, "");
  sockFor(cur).emit("game:challenge");
  await wait(60);
  sockFor(cur).emit("game:resolve", { decision: "allow" });
  await wait(60);
  check("allow accepts, next=P", room.requiredLetter === "P", "req=" + room.requiredLetter);

  // ---- round scoring: a round ends -> roundover (target 3 not reached) ----
  cur = room.currentPlayerId;
  sockFor(cur).emit("game:giveup");
  await wait(80);
  check("round ends -> roundover", room.status === "roundover" && sum(room) === 1, "status=" + room.status + " sum=" + sum(room));
  check("a player has 1 point", room.scores.some((s) => s.score === 1), "");

  // host advances to next round
  A.emit("game:nextround");
  await wait(120);
  check("next round -> playing, round 2", room.status === "playing" && room.round === 2, "round=" + room.round);
  check("all alive again", room.players.every((p) => p.alive), "");

  // ---- target=1 room: a round IS the match ----
  const C = mk();
  C.on("room:update", () => {});
  await new Promise((r) => C.on("connect", r));
  let room2 = null;
  const upd2 = (r) => (room2 = r);
  A.removeAllListeners("room:update"); A.on("room:update", upd2);
  C.on("room:update", upd2);
  const r2 = await emit(A, "room:create", { name: "Al", settings: { leagues: ["NBA"], era: "both", timer: 0, target: 1 } });
  await emit(C, "room:join", { code: r2.code, name: "Cy" });
  A.emit("game:start");
  await wait(120);
  const cur2 = room2.currentPlayerId;
  (A.id === cur2 ? A : C).emit("game:giveup");
  await wait(100);
  check("target=1: giveup ends match", room2.status === "ended" && !!room2.winnerId, "status=" + room2.status);
  check("match winner has 1 point", room2.scores.find((s) => s.id === room2.winnerId).score === 1, "");

  console.log("\n=== ROUND-SCORING FEATURE TEST ===");
  let pass = 0;
  log.forEach((l) => { if (l[1]) pass++; console.log((l[1] ? "PASS" : "FAIL") + "  " + l[0] + "  ::  " + l[2]); });
  console.log(`\n${pass}/${log.length} checks passed`);
  A.close(); B.close(); C.close();
  process.exit(pass === log.length ? 0 : 1);
})();
