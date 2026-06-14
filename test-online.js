// Headless two-client smoke test for the online multiplayer flow.
const { io } = require("socket.io-client");
const URL = "http://localhost:3000";
const log = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function mk() {
  return io(URL, { transports: ["websocket"] });
}

(async () => {
  const A = mk(); // host
  const B = mk(); // joiner
  let lastRoom = null;
  [A, B].forEach((s) =>
    s.on("room:update", (room) => {
      lastRoom = room;
    })
  );

  await new Promise((res) => A.on("connect", res));
  await new Promise((res) => B.on("connect", res));

  // create
  const created = await new Promise((res) =>
    A.emit("room:create", { name: "Alice", settings: { leagues: ["NBA"], era: "both" } }, res)
  );
  log.push(["create", created.ok, "code=" + created.code]);
  const code = created.code;

  // join
  const joined = await new Promise((res) =>
    B.emit("room:join", { code, name: "Bob" }, res)
  );
  log.push(["join", joined.ok, "players=" + joined.room.players.length]);

  // start
  A.emit("game:start");
  await wait(150);
  log.push(["started", lastRoom.status === "playing", "current=" + nameOf(lastRoom, lastRoom.currentPlayerId)]);

  // figure out whose turn, and the right socket
  function sockFor(id) {
    return A.id === id ? A : B.id === id ? B : null;
  }
  function nameOf(room, id) {
    const p = room.players.find((x) => x.id === id);
    return p ? p.name : "?";
  }

  // wrong player tries to guess -> rejected
  const wrongId = lastRoom.players.find((p) => p.id !== lastRoom.currentPlayerId).id;
  const wrongRes = await new Promise((res) =>
    sockFor(wrongId).emit("game:guess", { guess: "LeBron James" }, res)
  );
  log.push(["out-of-turn rejected", wrongRes.ok === false, wrongRes.message]);

  // current player: valid opener
  let curId = lastRoom.currentPlayerId;
  const r1 = await new Promise((res) =>
    sockFor(curId).emit("game:guess", { guess: "Michael Jordan" }, res)
  );
  log.push(["opener Michael Jordan", r1.ok, "next=" + lastRoom.requiredLetter]);

  // next player must start with J; give a wrong letter -> rejected
  await wait(80);
  curId = lastRoom.currentPlayerId;
  const r2bad = await new Promise((res) =>
    sockFor(curId).emit("game:guess", { guess: "Kobe Bryant" }, res)
  );
  log.push(["wrong letter rejected", r2bad.ok === false, r2bad.message]);

  // correct: John Stockton (J)
  const r2 = await new Promise((res) =>
    sockFor(curId).emit("game:guess", { guess: "John Stockton" }, res)
  );
  log.push(["John Stockton accepted", r2.ok, "next=" + lastRoom.requiredLetter]);

  // repeat Michael Jordan now should be rejected (need S though) -> letter or repeat
  await wait(80);
  curId = lastRoom.currentPlayerId;
  const rRep = await new Promise((res) =>
    sockFor(curId).emit("game:guess", { guess: "Scottie Pippen" }, res)
  );
  log.push(["Scottie Pippen (S) accepted", rRep.ok, "next=" + lastRoom.requiredLetter]);

  console.log("\n=== ONLINE TEST RESULTS ===");
  let pass = 0;
  log.forEach((l) => {
    const ok = l[1] === true;
    if (ok) pass++;
    console.log((ok ? "PASS" : "FAIL") + "  " + l[0] + "  ::  " + (l[2] || ""));
  });
  console.log(`\n${pass}/${log.length} checks passed`);
  A.close();
  B.close();
  process.exit(pass === log.length ? 0 : 1);
})();
