/*
 * NameGameRules — shared, isomorphic rules engine.
 * Loaded in the browser (attaches to window) and required by the Node server.
 *
 * The chaining rule (per the game spec):
 *   The FIRST letter of the previous player's LAST name determines the
 *   FIRST letter of the next player's FIRST name.
 *   e.g. "Michael Jordan" (Jordan -> J) -> next must start with J -> "John Wall"
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

  // Tokenize, dropping trailing suffixes like "Jr." so the last name is real.
  function tokens(name) {
    var t = normalize(name).split(" ").filter(Boolean);
    while (t.length > 1 && SUFFIXES.indexOf(t[t.length - 1]) !== -1) {
      t.pop();
    }
    return t;
  }

  function firstName(name) {
    var t = tokens(name);
    return t[0] || "";
  }

  function lastName(name) {
    var t = tokens(name);
    return t.length ? t[t.length - 1] : "";
  }

  function firstLetterOfFirstName(name) {
    return (firstName(name)[0] || "").toUpperCase();
  }

  function firstLetterOfLastName(name) {
    return (lastName(name)[0] || "").toUpperCase();
  }

  // Build a fast lookup index from the raw athlete list.
  function buildIndex(athletes) {
    var byKey = {};
    athletes.forEach(function (a) {
      var key = normalize(a.name);
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(a);
    });
    return byKey;
  }

  // Does this athlete pass the enabled league / era filters?
  function eligible(athlete, settings) {
    if (settings.leagues && settings.leagues.indexOf(athlete.league) === -1) {
      return false;
    }
    if (settings.era && settings.era !== "both" && athlete.era !== settings.era) {
      return false;
    }
    return true;
  }

  /*
   * Validate a submitted guess.
   *   guess      - raw string the player typed
   *   ctx.index  - prebuilt index from buildIndex()
   *   ctx.settings { leagues:[], era:"current"|"past"|"both" }
   *   ctx.usedKeys - array/Set of normalized names already played
   *   ctx.requiredLetter - uppercase letter the FIRST name must start with,
   *                        or null/"" for the opening turn (any player allowed)
   * Returns { ok, code, message, athlete, nextLetter }
   */
  function validate(guess, ctx) {
    var key = normalize(guess);
    if (!key) {
      return { ok: false, code: "empty", message: "Type a player's name." };
    }

    var matches = ctx.index[key];
    if (!matches || !matches.length) {
      return {
        ok: false,
        code: "unknown",
        message: '"' + guess.trim() + '" isn\'t in the athlete database.',
      };
    }

    // Among same-name entries, accept any that passes the active filters.
    var match = null;
    for (var i = 0; i < matches.length; i++) {
      if (eligible(matches[i], ctx.settings)) {
        match = matches[i];
        break;
      }
    }
    if (!match) {
      var found = matches[0];
      return {
        ok: false,
        code: "filtered",
        message:
          found.name +
          " is " +
          found.league +
          " / " +
          found.era +
          " — not allowed by the current settings.",
      };
    }

    var used = ctx.usedKeys;
    var alreadyUsed =
      used && (used.has ? used.has(key) : used.indexOf(key) !== -1);
    if (alreadyUsed) {
      return {
        ok: false,
        code: "repeat",
        message: match.name + " has already been said. No repeats!",
      };
    }

    var req = (ctx.requiredLetter || "").toUpperCase();
    if (req) {
      var got = firstLetterOfFirstName(match.name);
      if (got !== req) {
        return {
          ok: false,
          code: "letter",
          message:
            "Needs a first name starting with " +
            req +
            ' — "' +
            match.name +
            '" starts with ' +
            got +
            ".",
        };
      }
    }

    return {
      ok: true,
      code: "ok",
      athlete: match,
      key: key,
      nextLetter: firstLetterOfLastName(match.name),
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
  };
});
