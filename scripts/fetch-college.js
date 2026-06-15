// Pulls CURRENT college football (FBS) + men's basketball (D1) rosters from
// ESPN and merges them into data/athletes.json as CFB / CBB (era "current").
const fs = require("fs");
const path = require("path");
const UA = "Mozilla/5.0 (NameGame data build)";

async function getJSON(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(url + " -> " + r.status);
  return r.json();
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}
function rosterNames(d) {
  const out = [];
  for (const grp of d.athletes || []) {
    const items = grp.items || (grp.displayName ? [grp] : []);
    for (const a of items) { const nm = a.displayName || a.fullName; if (nm) out.push(nm); }
  }
  return out;
}
async function fetchLeague(sportLeague, group) {
  const tj = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/${sportLeague}/teams?groups=${group}&limit=400`);
  const teams = tj.sports[0].leagues[0].teams.map((t) => t.team.id);
  const set = new Set();
  await pool(teams, 12, async (id) => {
    try {
      const d = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/${sportLeague}/teams/${id}/roster`);
      rosterNames(d).forEach((nm) => set.add(nm));
    } catch (e) {}
  });
  return Array.from(set);
}
function entries(names, lg) {
  const out = [], seen = new Set();
  for (let nm of names) {
    nm = (nm || "").replace(/\s+/g, " ").trim();
    if (nm.split(" ").length < 2) continue; // need first + last for chaining
    const k = nm.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ name: nm, league: lg, era: "current" });
  }
  return out;
}

(async () => {
  console.log("Fetching current CFB rosters…");
  const cfb = await fetchLeague("football/college-football", 80);
  console.log("Fetching current CBB rosters…");
  const cbb = await fetchLeague("basketball/mens-college-basketball", 50);
  const add = entries(cfb, "CFB").concat(entries(cbb, "CBB"));
  console.log("CFB current:", entries(cfb, "CFB").length, " CBB current:", entries(cbb, "CBB").length);

  const file = path.join(__dirname, "..", "data", "athletes.json");
  const ath = JSON.parse(fs.readFileSync(file, "utf8"));
  const key = (p) => p.league + "|" + p.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const have = new Set(ath.map(key));
  let added = 0;
  for (const e of add) { if (!have.has(key(e))) { ath.push(e); have.add(key(e)); added++; } }
  ath.sort((a, b) => (a.league === b.league ? a.name.localeCompare(b.name) : a.league.localeCompare(b.league)));
  fs.writeFileSync(file, JSON.stringify(ath) + "\n");

  const byLeague = {};
  for (const p of ath) byLeague[p.league] = (byLeague[p.league] || 0) + 1;
  console.log("added", added, "-> total", ath.length, "by league:", byLeague);
  console.log("Jeremiah Smith present:", ath.some((p) => p.name === "Jeremiah Smith" && p.league === "CFB"));
})();
