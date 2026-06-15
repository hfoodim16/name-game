/*
 * NameGameRules — shared, isomorphic rules engine.
 * Loaded in the browser (attaches to window) and required by the Node server.
 *
 * The chaining rule (per the game spec):
 *   The FIRST letter of the previous player's LAST name determines the
 *   FIRST letter of the next player's FIRST name.
 *   e.g. "Michael Jordan" (Jordan -> J) -> next must start with J -> "John Wall"
 *
 * Matching is forgiving: it understands common nicknames (Shaq, King James,
 * Big Papi…) and tolerates small typos, reporting back what it matched.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api; // Node
  } else {
    root.NameGameRules = api; // Browser
  }
})(typeof self !== "undefined" ? self : this, function () {
  var SUFFIXES = ["jr", "sr", "ii", "iii", "iv", "v"];

  // Strip accents, lowercase, drop punctuation, collapse whitespace.
  function normalize(str) {
    return (str || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[.'`]/g, "")
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokens(name) {
    var t = normalize(name).split(" ").filter(Boolean);
    while (t.length > 1 && SUFFIXES.indexOf(t[t.length - 1]) !== -1) t.pop();
    return t;
  }
  function firstName(name) { return tokens(name)[0] || ""; }
  function lastName(name) { var t = tokens(name); return t.length ? t[t.length - 1] : ""; }
  function firstLetterOfFirstName(name) { return (firstName(name)[0] || "").toUpperCase(); }
  function firstLetterOfLastName(name) { return (lastName(name)[0] || "").toUpperCase(); }

  // Common nicknames -> canonical name (must match a DB entry to resolve).
  // Keys are pre-normalized. Ambiguous ones (e.g. "AD", "LT") are omitted.
  var ALIASES = {
    // NBA
    mj: "Michael Jordan", "air jordan": "Michael Jordan",
    "king james": "LeBron James", "the king": "LeBron James", lebron: "LeBron James", bron: "LeBron James",
    "black mamba": "Kobe Bryant", "the black mamba": "Kobe Bryant", mamba: "Kobe Bryant", kobe: "Kobe Bryant",
    shaq: "Shaquille O'Neal", magic: "Magic Johnson",
    "greek freak": "Giannis Antetokounmpo", "the greek freak": "Giannis Antetokounmpo", giannis: "Giannis Antetokounmpo",
    kd: "Kevin Durant", durant: "Kevin Durant",
    steph: "Stephen Curry", "steph curry": "Stephen Curry", "chef curry": "Stephen Curry", curry: "Stephen Curry",
    cp3: "Chris Paul", "the answer": "Allen Iverson", ai: "Allen Iverson", "the beard": "James Harden",
    joker: "Nikola Jokic", "the joker": "Nikola Jokic", jokic: "Nikola Jokic",
    "the process": "Joel Embiid", embiid: "Joel Embiid",
    luka: "Luka Doncic", doncic: "Luka Doncic", wemby: "Victor Wembanyama",
    dame: "Damian Lillard", "the brow": "Anthony Davis", melo: "Carmelo Anthony",
    dwade: "Dwyane Wade", "d wade": "Dwyane Wade", "the dream": "Hakeem Olajuwon",
    "the mailman": "Karl Malone", "the admiral": "David Robinson", "dr j": "Julius Erving",
    wilt: "Wilt Chamberlain", kareem: "Kareem Abdul-Jabbar",
    "the glove": "Gary Payton", "big o": "Oscar Robertson", "the big o": "Oscar Robertson",
    tmac: "Tracy McGrady", "t mac": "Tracy McGrady", vc: "Vince Carter", vinsanity: "Vince Carter",
    klay: "Klay Thompson", dray: "Draymond Green", russ: "Russell Westbrook",
    spida: "Donovan Mitchell", ja: "Ja Morant", zion: "Zion Williamson",
    sga: "Shai Gilgeous-Alexander", ant: "Anthony Edwards", "ant man": "Anthony Edwards",
    kat: "Karl-Anthony Towns", "the truth": "Paul Pierce", kg: "Kevin Garnett", "the big ticket": "Kevin Garnett",
    "d rose": "Derrick Rose", drose: "Derrick Rose",
    // NFL
    "tom terrific": "Tom Brady", "the goat": "Tom Brady", tb12: "Tom Brady",
    "the sheriff": "Peyton Manning", megatron: "Calvin Johnson", sweetness: "Walter Payton",
    "prime time": "Deion Sanders", primetime: "Deion Sanders", "neon deion": "Deion Sanders",
    "broadway joe": "Joe Namath", cmc: "Christian McCaffrey", "run cmc": "Christian McCaffrey",
    gronk: "Rob Gronkowski", "all day": "Adrian Peterson", cheetah: "Tyreek Hill",
    mahomes: "Patrick Mahomes",
    // MLB
    "the babe": "Babe Ruth", "the bambino": "Babe Ruth", bambino: "Babe Ruth", "sultan of swat": "Babe Ruth",
    "hammerin hank": "Hank Aaron", "say hey kid": "Willie Mays", "the say hey kid": "Willie Mays",
    "the splendid splinter": "Ted Williams", "teddy ballgame": "Ted Williams",
    "big papi": "David Ortiz", papi: "David Ortiz", "a rod": "Alex Rodriguez", arod: "Alex Rodriguez",
    "the captain": "Derek Jeter", jeter: "Derek Jeter", "the iron horse": "Lou Gehrig",
    "the ryan express": "Nolan Ryan", "the kid": "Ken Griffey", griffey: "Ken Griffey",
    "the machine": "Albert Pujols", vlad: "Vladimir Guerrero", "vlad jr": "Vladimir Guerrero",
    shotime: "Shohei Ohtani", showtime: "Shohei Ohtani", ohtani: "Shohei Ohtani",
    trout: "Mike Trout", "the judge": "Aaron Judge", kershaw: "Clayton Kershaw",
    // NHL
    "the great one": "Wayne Gretzky", gretzky: "Wayne Gretzky", "super mario": "Mario Lemieux",
    "sid the kid": "Sidney Crosby", crosby: "Sidney Crosby", ovi: "Alex Ovechkin",
    "the great eight": "Alex Ovechkin", ovechkin: "Alex Ovechkin", "mr hockey": "Gordie Howe",
    "the rocket": "Maurice Richard", "the dominator": "Dominik Hasek", mcdavid: "Connor McDavid",
    matthews: "Auston Matthews", "the finnish flash": "Teemu Selanne",
  };

  // Bounded Levenshtein — returns early if distance exceeds `max`.
  function editDistance(a, b, max) {
    var al = a.length, bl = b.length;
    if (Math.abs(al - bl) > max) return max + 1;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= bl; j++) prev[j] = j;
    for (i = 1; i <= al; i++) {
      cur[0] = i;
      var rowMin = cur[0];
      for (j = 1; j <= bl; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      for (j = 0; j <= bl; j++) prev[j] = cur[j];
    }
    return prev[bl];
  }

  // Find the closest DB key to `key` (same first letter, similar length).
  function fuzzyFind(key, index) {
    if (key.length < 4) return null;
    if (!index.__keys) {
      Object.defineProperty(index, "__keys", { value: Object.keys(index), enumerable: false, configurable: true });
    }
    var keys = index.__keys, first = key.charCodeAt(0);
    // Distance 1 only: catches real typos without "correcting" one real
    // player's name into a different real player's.
    var maxD = 1;
    var best = null, bestD = maxD + 1, ties = 0;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.charCodeAt(0) !== first) continue;
      if (Math.abs(k.length - key.length) > maxD) continue;
      var d = editDistance(key, k, maxD);
      if (d < bestD) { bestD = d; best = k; ties = 1; }
      else if (d === bestD) { ties++; }
    }
    // Only auto-correct when there's a single unambiguous closest match.
    return bestD <= maxD && ties === 1 ? best : null;
  }

  function buildIndex(athletes) {
    var byKey = {};
    athletes.forEach(function (a) {
      var key = normalize(a.name);
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(a);
    });
    return byKey;
  }

  function eligible(athlete, settings) {
    if (settings.leagues && settings.leagues.indexOf(athlete.league) === -1) return false;
    if (settings.era && settings.era !== "both" && athlete.era !== settings.era) return false;
    return true;
  }

  /*
   * Validate a submitted guess. Resolves nicknames + typos.
   * Returns { ok, code, message, athlete, key, nextLetter, typed, note }
   *   typed  - the raw text the player entered, when it differs from the match
   *   note   - "alias" or "fuzzy" when the match wasn't exact (else "")
   */
  function validate(guess, ctx) {
    var raw = (guess || "").trim();
    var key = normalize(guess);
    if (!key) return { ok: false, code: "empty", message: "Type a player's name." };

    var lookKey = key, note = "";
    if (!ctx.index[lookKey]) {
      // alias lookup, tolerant of hyphens ("a-rod" -> "a rod"/"arod")
      var ak = ALIASES[lookKey] || ALIASES[lookKey.replace(/-/g, " ")] || ALIASES[lookKey.replace(/-/g, "")];
      if (ak) { lookKey = normalize(ak); note = "alias"; }
    }
    if (!ctx.index[lookKey]) {
      var fz = fuzzyFind(key, ctx.index);
      if (fz) { lookKey = fz; note = "fuzzy"; }
    }

    var matches = ctx.index[lookKey];
    if (!matches || !matches.length) {
      return { ok: false, code: "unknown", message: '"' + raw + "\" isn't a player we recognize." };
    }

    var match = null;
    for (var i = 0; i < matches.length; i++) {
      if (eligible(matches[i], ctx.settings)) { match = matches[i]; break; }
    }
    if (!match) {
      var found = matches[0];
      return {
        ok: false, code: "filtered",
        message: found.name + " is " + found.league + " / " + found.era + " — not allowed by the current settings.",
      };
    }

    var used = ctx.usedKeys;
    if (used && (used.has ? used.has(lookKey) : used.indexOf(lookKey) !== -1)) {
      return { ok: false, code: "repeat", message: match.name + " has already been said. No repeats!" };
    }

    var req = (ctx.requiredLetter || "").toUpperCase();
    if (req) {
      var got = firstLetterOfFirstName(match.name);
      if (got !== req) {
        return {
          ok: false, code: "letter",
          message: "Needs a first name starting with " + req + ' — "' + match.name + '" starts with ' + got + ".",
        };
      }
    }

    var corrected = normalize(match.name) !== key;
    return {
      ok: true, code: "ok",
      athlete: match,
      key: lookKey,
      nextLetter: firstLetterOfLastName(match.name),
      typed: corrected ? raw : null,
      note: corrected ? note : "",
    };
  }

  return {
    normalize: normalize,
    firstName: firstName,
    lastName: lastName,
    firstLetterOfFirstName: firstLetterOfFirstName,
    firstLetterOfLastName: firstLetterOfLastName,
    buildIndex: buildIndex,
    eligible: eligible,
    validate: validate,
    ALIASES: ALIASES,
  };
});
