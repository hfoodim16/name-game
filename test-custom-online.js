// Headless test for ONLINE Custom Category mode (honor-system "decide").
const { io } = require("socket.io-client");
const URL = "http://localhost:3000";
const log = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = () => io(URL, { transports: ["websocket"] });
const emit = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));

(async () => {
  const A = mk(), B = mk();
  let room = null;
  [A, B].forEach((s) => s.on("room:update", (r) => (room = r)));
  await new Promise((r) => A.on("connect", r));
  await new Promise((r) => B.on("connect", r));
  const sockFor = (id) => (A.id === id ? A : B.id === id ? B : null);
  const other = () => room.players.find((p) => p.id !== room.currentPlayerId).id;
  const check = (l, c, e) => log.push([l, c === true, e || ""]);

  const created = await emit(A, "room:create", { name: "Alice", gameType: "custom", settings: { category: "Movies", letterRule: true, timer: 0, target: 1 } });
  check("create custom (Movies)", created.room.gameType === "custom" && created.room.settings.category === "Movies", "");
  await emit(B, "room:join", { code: created.code, name: "Bob" });

  A.emit("game:start");
  await wait(150);
  check("started, round 1", room.status === "playing" && room.round === 1, "");

  // current player submits a movie -> enters "decide" (no DB validation)
  let cur = room.currentPlayerId;
  const g1 = await emit(sockFor(cur), "game:guess", { guess: "Inception" });
  await wait(60);
  check("submit -> decide state", g1.ok === true && room.decide && room.decide.word === "Inception", room.decide && room.decide.word);

  // submitter cannot rule on their own answer
  sockFor(cur).emit("game:decide", { counts: true });
  await wait(60);
  check("submitter can't self-decide", !!room.decide, "decide still pending");

  // the other player rules it counts -> accepted, chain -> N (Inception)
  sockFor(other()).emit("game:decide", { counts: true });
  await wait(80);
  check("counts -> accepted, next letter N", !room.decide && room.requiredLetter === "N", "req=" + room.requiredLetter);

  // now it's the other player's turn, needs N; wrong letter is rejected
  cur = room.currentPlayerId;
  const wrong = await emit(sockFor(cur), "game:guess", { guess: "Avatar" });
  check("wrong letter rejected", wrong.ok === false, wrong.message ? wrong.message.slice(0, 28) : "");

  // correct letter -> decide -> ruled DOESN'T count -> same player goes again
  const g2 = await emit(sockFor(cur), "game:guess", { guess: "Nope" });
  await wait(60);
  check("valid letter -> decide", room.decide && room.decide.word === "Nope", "");
  sockFor(other()).emit("game:decide", { counts: false });
  await wait(80);
  check("doesn't count -> same player, letter unchanged", !room.decide && room.currentPlayerId === cur && room.requiredLetter === "N", "cur same=" + (room.currentPlayerId === cur));

  // give up -> with target 1, a round IS the match -> ended
  sockFor(room.currentPlayerId).emit("game:giveup");
  await wait(80);
  check("give up ends match (target 1)", room.status === "ended" && !!room.winnerId, "status=" + room.status);

  console.log("\n=== ONLINE CUSTOM MODE TEST ===");
  let pass = 0;
  log.forEach((l) => { if (l[1]) pass++; console.log((l[1] ? "PASS" : "FAIL") + "  " + l[0] + "  ::  " + l[2]); });
  console.log(`\n${pass}/${log.length} checks passed`);
  A.close(); B.close();
  process.exit(pass === log.length ? 0 : 1);
})();
