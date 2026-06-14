/*
 * build-db.js — regenerates data/athletes.json from authoritative free sources.
 *
 *   NBA  -> basketball-reference.com player index (A–Z), uses career end year
 *   MLB  -> statsapi.mlb.com season rosters (looped over every season)
 *   NFL  -> nflverse players.csv (uses last_season)
 *   NHL  -> records.nhl.com player API (uses onRoster flag)
 *
 * A player is "current" if active in CURRENT_CUTOFF or later (NHL: currently
 * rostered). Everyone else is "past". Run with:  node scripts/build-db.js
 *
 * No API keys required. Re-run any time to refresh.
 */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "data", "athletes.json");
const CURRENT_CUTOFF = 2024;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

async function getText(url, headers) {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...(headers || {}) } });
  if (!r.ok) throw new Error(url + " -> " + r.status);
  return r.text();
}
async function getJSON(url, headers) {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...(headers || {}) } });
  if (!r.ok) throw new Error(url + " -> " + r.status);
  return r.json();
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await fn(items[i++]);
    })
  );
}

// keyed by league + accent-folded name; collapses duplicates, prefers "current"
function addPlayer(map, league, name, era) {
  name = clean(name);
  if (!name || !name.includes(" ") || name.length < 3) return;
  const key =
    league + "|" + name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const ex = map.get(key);
  if (!ex) map.set(key, { name, league, era });
  else if (ex.era !== "current" && era === "current") ex.era = "current";
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ----------------------------------------------------------------- NFL */
async function buildNFL(map) {
  const csv = await getText(
    "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv"
  );
  const rows = parseCSV(csv);
  const h = rows[0];
  const di = h.indexOf("display_name"), ls = h.indexOf("last_season");
  let n = 0;
  for (let i = 1; i < rows.length; i++) {
    const name = rows[i][di];
    const last = parseInt(rows[i][ls], 10);
    if (!name) continue;
    addPlayer(map, "NFL", name, last >= CURRENT_CUTOFF ? "current" : "past");
    n++;
  }
  console.log(`  NFL: parsed ${n} rows`);
}

/* ----------------------------------------------------------------- MLB */
async function buildMLB(map) {
  const start = 1876, end = new Date().getFullYear();
  const years = [];
  for (let y = start; y <= end; y++) years.push(y);
  const seen = new Map(); // id -> { name, maxYear }
  await pool(years, 8, async (year) => {
    try {
      const d = await getJSON(
        `https://statsapi.mlb.com/api/v1/sports/1/players?season=${year}`
      );
      for (const p of d.people || []) {
        const cur = seen.get(p.id);
        if (!cur || year > cur.maxYear) seen.set(p.id, { name: p.fullName, maxYear: year });
      }
    } catch (e) { /* skip missing season */ }
  });
  for (const { name, maxYear } of seen.values())
    addPlayer(map, "MLB", name, maxYear >= CURRENT_CUTOFF ? "current" : "past");
  console.log(`  MLB: ${seen.size} unique players across ${years.length} seasons`);
}

/* ----------------------------------------------------------------- NHL */
async function buildNHL(map) {
  let start = 0, total = Infinity, count = 0;
  const limit = 1000;
  while (start < total) {
    const d = await getJSON(
      `https://records.nhl.com/site/api/player?start=${start}&limit=${limit}`
    );
    total = d.total;
    for (const r of d.data) {
      const name = clean((r.firstName || "") + " " + (r.lastName || ""));
      addPlayer(map, "NHL", name, r.onRoster === "Y" ? "current" : "past");
      count++;
    }
    start += limit;
  }
  console.log(`  NHL: parsed ${count} players`);
}

/* ----------------------------------------------------------------- NBA */
async function buildNBA(map) {
  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  let count = 0;
  for (const L of letters) {
    try {
      const html = await getText(`https://www.basketball-reference.com/players/${L}/`);
      const table = html.includes('id="players"') ? html.split('id="players"')[1] : html;
      for (const row of table.split("<tr")) {
        const nm = row.match(
          /data-append-csv="[^"]*"[^>]*>(?:<strong>)?<a href="\/players\/[^"]+\.html">([^<]+)<\/a>/
        );
        const ymax = row.match(/data-stat="year_max"[^>]*>(\d{4})/);
        if (nm && ymax) {
          addPlayer(map, "NBA", nm[1], parseInt(ymax[1], 10) >= CURRENT_CUTOFF ? "current" : "past");
          count++;
        }
      }
    } catch (e) {
      console.log(`  NBA: letter ${L} failed (${e.message})`);
    }
    await sleep(1600); // basketball-reference rate-limits; be polite
  }
  console.log(`  NBA: parsed ${count} players`);
}

(async () => {
  const map = new Map();
  console.log("Building athlete database…");
  console.log("• NFL"); await buildNFL(map).catch((e) => console.log("  NFL failed", e.message));
  console.log("• NHL"); await buildNHL(map).catch((e) => console.log("  NHL failed", e.message));
  console.log("• MLB"); await buildMLB(map).catch((e) => console.log("  MLB failed", e.message));
  console.log("• NBA (slow — polite scrape)"); await buildNBA(map).catch((e) => console.log("  NBA failed", e.message));

  // Curated supplement: famous pre-modern players missing from the bulk sources
  // (e.g. pre-1965 NFL legends — Pro-Football-Reference blocks scraping).
  const supPath = path.join(__dirname, "..", "data", "supplement.json");
  if (fs.existsSync(supPath)) {
    const sup = JSON.parse(fs.readFileSync(supPath, "utf8"));
    sup.forEach((p) => addPlayer(map, p.league, p.name, p.era));
    console.log(`  Supplement: merged ${sup.length} curated players`);
  }

  const all = Array.from(map.values()).sort((a, b) =>
    a.league === b.league ? a.name.localeCompare(b.name) : a.league.localeCompare(b.league)
  );

  const byLeague = {};
  const byEra = { current: 0, past: 0 };
  for (const p of all) {
    byLeague[p.league] = (byLeague[p.league] || 0) + 1;
    byEra[p.era]++;
  }
  fs.writeFileSync(OUT, JSON.stringify(all) + "\n");
  console.log("\nWrote", all.length, "players to", OUT);
  console.log("By league:", byLeague);
  console.log("By era:", byEra);
})();
