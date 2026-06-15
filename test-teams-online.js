// Headless test for ONLINE team mode: 4 players, 2 teams, last team standing.
const { io } = require("socket.io-client");
const URL = "http://localhost:3000";
const log = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = () => io(URL, { transports: ["websocket"] });
const emit = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));

(async () => {
  const S = [mk(), mk(), mk(), mk()];
  let room = null;
  S.forEach((s) => s.on("room:update", (r) => (room = r)));
  for (const s of S) await new Promise((r) => s.on("connect", r));
  const byId = (id) => S.find((s) => s.id === id);
  const check = (l, c, e) => log.push([l, c === true, e || ""]);
  const teamOf = (id) => room.players.find((p) => p.id === id).team;

  // host creates a 2-team room (timer off, first to 1)
  const created = await emit(S[0], "room:create", { name: "P1", gameType: "athlete", settings: { leagues: ["NBA"], era: "both", timer: 0, target: 1, teams: 2 } });
  check("create teams=2", created.room.settings.teams === 2, "");
  for (let i = 1; i < 4; i++) await emit(S[i], "room:join", { code: created.code, name: "P" + (i + 1) });

  S[0].emit("game:start");
  await wait(200);
  check("teams assigned (2 per team)", room.teams === 2 && room.players.filter((p) => p.team === 0).length === 2 && room.players.filter((p) => p.team === 1).length === 2, "");
  check("scores are team rows", room.scores.length === 2 && room.scores[0].name === "Team A", "");

  // Eliminate ALL of one team via give-up, proving the round only ends when a
  // whole team is gone (not at one player left).
  // Strategy: whenever the current player is on the team we want to keep (teamKeep),
  // they make a valid move to pass; otherwise they give up.
  const teamKeep = teamOf(room.currentPlayerId); // keep current player's team, eliminate the other
  const NAMES = ["Michael Jordan", "John Stockton", "Scottie Pippen", "Steve Nash", "Nikola Jokic", "Chris Paul"];
  let ni = 0, guard = 0, sawThreeAlive = false;
  while (room.status === "playing" && guard++ < 40) {
    const cur = room.currentPlayerId;
    const aliveCount = room.players.filter((p) => p.alive).length;
    if (aliveCount === 3) sawThreeAlive = true; // one of the losing team already out, still playing
    if (teamOf(cur) === teamKeep) {
      // pass the turn with a valid (or forced) name
      const g = NAMES[ni++ % NAMES.length];
      const r = await emit(byId(cur), "game:guess", { guess: g });
      if (!r.ok) { // letter mismatch — just give up to keep the loop moving (rare)
        byId(cur).emit("game:giveup");
      }
    } else {
      byId(cur).emit("game:giveup");
    }
    await wait(70);
  }
  check("round continued past 1-player-out (3 alive seen)", sawThreeAlive, "");
  check("match ended, a team won", room.status === "ended" && room.winnerTeam >= 0, "winnerTeam=" + room.winnerTeam);
  check("winning team is the kept team", room.winnerTeam === teamKeep, "kept=" + teamKeep + " won=" + room.winnerTeam);
  check("winning team has 1 point", room.scores[room.winnerTeam].score === 1, "");

  console.log("\n=== ONLINE TEAM MODE TEST ===");
  let pass = 0;
  log.forEach((l) => { if (l[1]) pass++; console.log((l[1] ? "PASS" : "FAIL") + "  " + l[0] + "  ::  " + l[2]); });
  console.log(`\n${pass}/${log.length} checks passed`);
  S.forEach((s) => s.close());
  process.exit(pass === log.length ? 0 : 1);
})();
