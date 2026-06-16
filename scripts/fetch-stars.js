// Marks "star" players in data/athletes.json using Wikidata fame signals.
// Wikidata's "award received" (P166) only records major individual trophies
// (MVP, Hart, …) — NOT All-Star/Pro-Bowl selections — so award data alone is
// too thin. The most comprehensive, current+retired fame signal is the number
// of Wikipedia language editions a player has (wikibase:sitelinks). We pull all
// players above a per-sport sitelink threshold (thresholds differ because e.g.
// American football is US-centric with few non-English wikis, soccer is global)
// and flag matching roster entries with star:true.
const fs = require("fs");
const path = require("path");
const UA = "NameGameDataBuild/1.0 (harryfoodim@gmail.com)";

function normalize(str) {
  return (str || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[.'`]/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

async function sparql(query, tries) {
  tries = tries || 0;
  const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return (await r.json()).results.bindings;
  } catch (e) {
    if (tries < 4) { await new Promise((s) => setTimeout(s, 3000 * (tries + 1))); return sparql(query, tries + 1); }
    throw e;
  }
}

// occupation QID -> { leagues, threshold }
const CATS = {
  Q3665646:  { name: "basketball",  leagues: ["NBA", "CBB"], th: 12 }, // basketball player
  Q19204627: { name: "amfootball",  leagues: ["NFL", "CFB"], th: 6 },  // American football player
  Q10871364: { name: "baseball",    leagues: ["MLB"],        th: 8 },  // baseball player
  Q11774891: { name: "hockey",      leagues: ["NHL"],        th: 12 }, // ice hockey player
};

async function fetchCat(qid, th) {
  // Pull in sitelink bands to stay under the 60s query timeout on big sports.
  // Iterate every band up to the cap (max real sitelink count is ~140) — do NOT
  // break on the first empty band, or sparse high bands would drop the very
  // biggest stars (Jordan/LeBron sit alone at 100+ with gaps below them).
  const names = new Set();
  for (let lo = th; lo < 220; lo += 8) {
    const hi = lo + 8;
    // P106/P279* = occupation is the sport's player class OR a subclass of it
    // (e.g. "professional baseball player"), so we don't miss players like
    // Derek Jeter who are tagged with a subclass instead of the base class.
    const q = `SELECT ?pLabel WHERE { ?p wdt:P106 ?o . ?o wdt:P279* wd:${qid} . ?p wikibase:sitelinks ?sl .
      FILTER(?sl >= ${lo} && ?sl < ${hi})
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
    const rows = await sparql(q);
    rows.forEach((b) => { const n = b.pLabel && b.pLabel.value; if (n && /[a-zA-Z]/.test(n)) names.add(normalize(n)); });
  }
  return names;
}

(async () => {
  const byLeagueStars = {}; // league -> Set of normalized star names
  for (const qid of Object.keys(CATS)) {
    const c = CATS[qid];
    process.stdout.write(`Fetching ${c.name} (sitelinks >= ${c.th})… `);
    const names = await fetchCat(qid, c.th);
    console.log(names.size + " famous names");
    c.leagues.forEach((lg) => { byLeagueStars[lg] = names; });
  }

  const file = path.join(__dirname, "..", "data", "athletes.json");
  const ath = JSON.parse(fs.readFileSync(file, "utf8"));
  const counts = {};
  let marked = 0;
  for (const p of ath) {
    let star = false;
    if (p.league === "SOC") star = true; // SOC list is already notability-filtered
    else { const set = byLeagueStars[p.league]; if (set && set.has(normalize(p.name))) star = true; }
    if (star) { p.star = true; marked++; counts[p.league] = (counts[p.league] || 0) + 1; }
    else if (p.star) delete p.star;
  }
  fs.writeFileSync(file, JSON.stringify(ath) + "\n");
  console.log("\nMarked", marked, "stars. By league:", counts);
  console.log("Sanity — LeBron star?",
    ath.some((p) => p.name === "LeBron James" && p.star),
    "| Jeter star?", ath.some((p) => p.name === "Derek Jeter" && p.star),
    "| random scrub star?", ath.filter((p) => p.league === "MLB" && !p.star).length, "MLB non-stars");
})();
