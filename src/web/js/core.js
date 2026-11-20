/* MEGA//INDEX core: pure logic (no DOM). Classic script; exposes window.MegaIndex,
 * and module.exports under Node. Contract: SPEC.md sections 1-7, 9. Oracle: tools/reference.py. */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------ combinatorics */
  function comb(n, k) {
    if (k < 0 || n < k) return 0;
    if (k === 0 || k === n) return 1;
    if (k > n - k) k = n - k;
    var r = 1;
    for (var i = 1; i <= k; i++) r = (r * (n - k + i)) / i; // exact: r stays an integer < 2^53
    return r;
  }

  /* ------------------------------------------------------------ games */
  function makeGame(o) {
    o.bonus_count = 1;
    o.white_combos = comb(o.white_max, o.white_count);
    o.total = o.white_combos * o.bonus_max;
    // C(x,i) table for x in 0..white_max-1, i in 0..white_count
    var t = [];
    for (var x = 0; x < o.white_max; x++) {
      t.push([]);
      for (var i = 0; i <= o.white_count; i++) t[x].push(comb(x, i));
    }
    o._C = t;
    return o;
  }

  var MEGA_MILLIONS = makeGame({
    id: "megamillions", name: "Mega Millions", white_count: 5, white_max: 70, bonus_max: 24,
    bonus_name: "Mega Ball", bonus_abbr: "MB", matrix_start: "2025-04-08", has_history: true
  });
  var POWERBALL = makeGame({
    id: "powerball", name: "Powerball", white_count: 5, white_max: 69, bonus_max: 26,
    bonus_name: "Powerball", bonus_abbr: "PB", matrix_start: "2015-10-07", has_history: false
  });
  var GAMES = { megamillions: MEGA_MILLIONS, powerball: POWERBALL };
  var PLAY_LABELS = "ABCDE";
  var MODES = ["uniform", "hot", "cold", "mixed"];

  function getGame(id) {
    if (id === undefined || id === null) return MEGA_MILLIONS;
    if (typeof id === "object") return id;
    if (!Object.prototype.hasOwnProperty.call(GAMES, id)) throw new Error("unknown game '" + id + "'");
    return GAMES[id];
  }

  function numAsc(a, b) { return a - b; }

  /* ------------------------------------------------------------ validation */
  // Returns null when valid, else the SPEC error message (same order as the CLI).
  function validateTicket(g, whites, bonus) {
    g = getGame(g);
    if (!whites || whites.length !== g.white_count)
      return "expected " + g.white_count + " white balls, got " + (whites ? whites.length : 0);
    var i;
    for (i = 0; i < whites.length; i++) {
      var w = whites[i];
      if (!Number.isInteger(w) || w < 1 || w > g.white_max)
        return "white ball " + w + " out of range 1-" + g.white_max;
    }
    var seen = {};
    for (i = 0; i < whites.length; i++) {
      if (seen[whites[i]]) return "duplicate white ball " + whites[i];
      seen[whites[i]] = true;
    }
    if (bonus === undefined || bonus === null) return "missing --bonus";
    if (!Number.isInteger(bonus) || bonus < 1 || bonus > g.bonus_max)
      return g.bonus_name + " " + bonus + " out of range 1-" + g.bonus_max;
    return null;
  }

  function validateIndex(g, index) {
    g = getGame(g);
    if (!Number.isInteger(index) || index < 0 || index >= g.total)
      return "index " + index + " out of range 0-" + (g.total - 1);
    return null;
  }

  // Parse an index string from a text field: digits only (spaces/commas/underscores allowed as separators).
  function parseIndexText(g, text) {
    g = getGame(g);
    var s = String(text == null ? "" : text).replace(/[\s,_]/g, "");
    if (!/^[0-9]{1,18}$/.test(s)) return { error: "not an integer: '" + String(text).trim() + "'" };
    var i = Number(s);
    var err = validateIndex(g, i);
    return err ? { error: err } : { index: i };
  }

  /* ------------------------------------------------------------ encode / decode */
  function encode(g, whites, bonus) {
    g = getGame(g);
    var err = validateTicket(g, whites, bonus);
    if (err) throw new Error(err);
    var xs = whites.map(function (w) { return w - 1; }).sort(numAsc);
    var n = 0;
    for (var i = 0; i < xs.length; i++) n += g._C[xs[i]][i + 1];
    return g.bonus_max * n + (bonus - 1);
  }

  function decode(g, index) {
    g = getGame(g);
    var err = validateIndex(g, index);
    if (err) throw new Error(err);
    var b = (index % g.bonus_max) + 1;
    var n = Math.floor(index / g.bonus_max);
    var balls = [];
    var x = g.white_max - 1;
    for (var i = g.white_count; i >= 1; i--) {
      while (g._C[x][i] > n) x--;
      n -= g._C[x][i];
      balls.push(x + 1);
      x--;
    }
    balls.sort(numAsc);
    return { whites: balls, bonus: b };
  }

  /* ------------------------------------------------------------ RNG (CSPRNG only) */
  var cryptoObj = (typeof globalThis !== "undefined" && globalThis.crypto) ||
                  (typeof root !== "undefined" && root && root.crypto) || null;
  if ((!cryptoObj || !cryptoObj.getRandomValues) && typeof require === "function") {
    try { cryptoObj = require("crypto").webcrypto; } catch (e) { /* ignore */ }
  }
  var u32buf = new Uint32Array(1);

  function randU32() {
    if (!cryptoObj || !cryptoObj.getRandomValues) throw new Error("no CSPRNG (crypto.getRandomValues) available");
    cryptoObj.getRandomValues(u32buf);
    return u32buf[0];
  }

  // Uniform integer in [0, n), 1 <= n < 2^32, rejection sampling (no modulo bias).
  function randbelow(n) {
    if (!Number.isInteger(n) || n < 1 || n >= 4294967296) throw new Error("randbelow: n out of range");
    var limit = 4294967296 - (4294967296 % n); // plain Number math, exact
    for (;;) {
      var u = randU32();
      if (u < limit) return u % n;
    }
  }

  /* ------------------------------------------------------------ formatting */
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function fmtTicket(g, whites, bonus) {
    g = getGame(g);
    return whites.slice().sort(numAsc).map(pad2).join(" ") + " " + g.bonus_abbr + " " + pad2(bonus);
  }
  // num/den to 2 decimals, half away from zero, integer math (values here are small, exact in Number).
  function fmt2(num, den, signed) {
    var a = Math.abs(num);
    var q = Math.floor((200 * a + den) / (2 * den));
    var s = Math.floor(q / 100) + "." + pad2(q % 100);
    if (!signed) return s;
    return (num < 0 && q !== 0 ? "-" : "+") + s;
  }
  function notes(g) {
    g = getGame(g);
    return ["NOTE: Fair picks do not improve your odds. Every ticket is 1 in " + group(g.total) + ".",
            "NOTE: Hot/cold is for fun and cannot predict draws; uniform is the default mode."];
  }

  /* ------------------------------------------------------------ draw history + stats */
  // Accepts [{d, w:[...], m}] (window.MM_DRAWS) and returns a validated, sorted copy.
  function normalizeDraws(g, raw) {
    g = getGame(g);
    var out = [];
    (raw || []).forEach(function (r, i) {
      var w = (r.w || []).slice().sort(numAsc);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.d) || validateTicket(g, w, r.m))
        throw new Error("bad draw record " + i);
      out.push({ d: r.d, w: w, m: r.m, _i: i });
    });
    out.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : a._i - b._i; }); // stable
    return out.map(function (r) { return { d: r.d, w: r.w, m: r.m }; });
  }

  // Parse draws.csv text (SPEC section 4 loader rules: ASCII-only, optional leading BOM).
  function asciiTrim(x) { return x.replace(/^[ \t\r\v\f]+|[ \t\r\v\f]+$/g, ""); }
  function parseDrawsCsv(g, text) {
    g = getGame(g);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var lines = text.split(/\r\n|\r|\n/);
    if (asciiTrim(lines[0]) !== "date,w1,w2,w3,w4,w5,mb")
      throw new Error("bad data file: header must be 'date,w1,w2,w3,w4,w5,mb'");
    var raw = [];
    for (var ln = 1; ln < lines.length; ln++) {
      var line = asciiTrim(lines[ln]);
      if (!line) continue;
      var f = line.split(",").map(asciiTrim);
      var bad = f.length !== 7 || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(f[0]);
      var nums = f.slice(1).map(function (x) { return /^[+-]?[0-9]+$/.test(x) ? parseInt(x, 10) : NaN; });
      if (!bad && nums.some(isNaN)) bad = true;
      var w = bad ? null : nums.slice(0, 5).sort(numAsc);
      if (bad || validateTicket(g, w, nums[5])) throw new Error("bad data file: line " + (ln + 1));
      raw.push({ d: f[0], w: w, m: nums[5] });
    }
    if (!raw.length) throw new Error("bad data file: no draws");
    return normalizeDraws(g, raw);
  }

  function rankHot(f, gap, nums) {
    return nums.slice().sort(function (a, b) { return (f[b] - f[a]) || (gap[a] - gap[b]) || (a - b); });
  }
  function rankCold(f, gap, nums) {
    return nums.slice().sort(function (a, b) { return (f[a] - f[b]) || (gap[b] - gap[a]) || (a - b); });
  }
  function rankOverdue(f, gap, nums) {
    return nums.slice().sort(function (a, b) { return (gap[b] - gap[a]) || (f[a] - f[b]) || (a - b); });
  }
  function range1(n) { var a = []; for (var i = 1; i <= n; i++) a.push(i); return a; }

  function computeStats(g, draws) {
    g = getGame(g);
    if (!g.has_history) throw new Error("no draw history for " + g.name);
    if (!draws || !draws.length) throw new Error("bad data file: no draws");
    var D = draws.length, k = g.white_count, K = g.white_max, B = g.bonus_max;
    var wf = [], bf = [], wgap = [], bgap = [], i;
    for (i = 0; i <= K; i++) { wf.push(0); wgap.push(D); }
    for (i = 0; i <= B; i++) { bf.push(0); bgap.push(D); }
    draws.forEach(function (dr, idx) {
      var age = D - 1 - idx;
      dr.w.forEach(function (w) { wf[w]++; wgap[w] = age; });
      bf[dr.m]++; bgap[dr.m] = age;
    });
    var W = range1(K), Bn = range1(B);
    var chiW = 0, chiB = 0;
    W.forEach(function (n) { var d = wf[n] * K - D * k; chiW += d * d; });
    Bn.forEach(function (n) { var d = bf[n] * B - D; chiB += d * d; });
    var st = {
      game: g, draws: draws, D: D, first: draws[0].d, last: draws[D - 1].d,
      wf: wf, bf: bf, wgap: wgap, bgap: bgap, whites: W, bonuses: Bn,
      expW: D * k / K, expB: D / B,
      expWText: fmt2(D * k, K, false), expBText: fmt2(D, B, false),
      chiW: chiW / (K * D * k), chiB: chiB / (B * D),
      chiWText: fmt2(chiW, K * D * k, false), chiBText: fmt2(chiB, B * D, false),
      dfW: K - 1, dfB: B - 1,
      devW: function (n) { return fmt2(wf[n] * K - D * k, K, true); },
      devB: function (n) { return fmt2(bf[n] * B - D, B, true); },
      hotW: rankHot(wf, wgap, W), coldW: rankCold(wf, wgap, W), overW: rankOverdue(wf, wgap, W),
      hotB: rankHot(bf, bgap, Bn), coldB: rankCold(bf, bgap, Bn), overB: rankOverdue(bf, bgap, Bn)
    };
    return st;
  }

  // The six summary lines exactly as `stats` prints them (used by tests and the UI).
  function statsSummaryLines(st) {
    var g = st.game;
    function toks(list, vals, top) { return list.slice(0, top).map(function (n) { return pad2(n) + ":" + vals[n]; }).join(" "); }
    return [
      "HOT WHITES: " + toks(st.hotW, st.wf, 10),
      "COLD WHITES: " + toks(st.coldW, st.wf, 10),
      "OVERDUE WHITES: " + toks(st.overW, st.wgap, 10),
      "HOT " + g.bonus_abbr + ": " + toks(st.hotB, st.bf, 5),
      "COLD " + g.bonus_abbr + ": " + toks(st.coldB, st.bf, 5),
      "OVERDUE " + g.bonus_abbr + ": " + toks(st.overB, st.bgap, 5),
      "chi-square white: " + st.chiWText + " (df " + st.dfW + ")",
      "chi-square " + g.bonus_abbr + ": " + st.chiBText + " (df " + st.dfB + ")"
    ];
  }

  /* ------------------------------------------------------------ pick modes */
  // weights: {num: intWeight}. Without replacement; ascending walk each round.
  function weightedTake(weights, count, rb) {
    rb = rb || randbelow;
    var remaining = {};
    Object.keys(weights).forEach(function (k) { remaining[k] = weights[k]; });
    var chosen = [];
    for (var c = 0; c < count; c++) {
      var nums = Object.keys(remaining).map(Number).sort(numAsc);
      var total = 0;
      nums.forEach(function (n) { total += remaining[n]; });
      var r = rb(total), acc = 0;
      for (var j = 0; j < nums.length; j++) {
        acc += remaining[nums[j]];
        if (r < acc) { chosen.push(nums[j]); delete remaining[nums[j]]; break; }
      }
    }
    return chosen;
  }
  function hotWeights(f, nums) { var w = {}; nums.forEach(function (n) { w[n] = f[n] + 1; }); return w; }
  function coldWeights(f, nums) {
    var mx = -Infinity; nums.forEach(function (n) { if (f[n] > mx) mx = f[n]; });
    var w = {}; nums.forEach(function (n) { w[n] = mx - f[n] + 1; }); return w;
  }

  function makePick(g, mode, st, rb) {
    g = getGame(g);
    rb = rb || randbelow;
    mode = mode || "uniform";
    if (MODES.indexOf(mode) < 0) throw new Error("unknown mode '" + mode + "'");
    if (mode === "uniform") {
      var i = rb(g.total), t = decode(g, i);
      return { whites: t.whites, bonus: t.bonus, index: i, mode: mode };
    }
    if (!g.has_history) throw new Error("no draw history for " + g.name);
    if (!st) throw new Error("stats required for mode " + mode);
    var W = st.whites, B = st.bonuses, whites, bonus;
    if (mode === "hot") {
      whites = weightedTake(hotWeights(st.wf, W), g.white_count, rb);
      bonus = weightedTake(hotWeights(st.bf, B), 1, rb)[0];
    } else if (mode === "cold") {
      whites = weightedTake(coldWeights(st.wf, W), g.white_count, rb);
      bonus = weightedTake(coldWeights(st.bf, B), 1, rb)[0];
    } else {
      whites = weightedTake(hotWeights(st.wf, W), 3, rb);
      var rest = W.filter(function (n) { return whites.indexOf(n) < 0; });
      whites = whites.concat(weightedTake(coldWeights(st.wf, rest), g.white_count - 3, rb));
      bonus = rb(2) === 0 ? weightedTake(hotWeights(st.bf, B), 1, rb)[0]
                          : weightedTake(coldWeights(st.bf, B), 1, rb)[0];
    }
    whites.sort(numAsc);
    return { whites: whites, bonus: bonus, index: encode(g, whites, bonus), mode: mode };
  }

  // A slip of n plays (1..5), labelled A..E, never repeating an index.
  function makeSlip(g, n, mode, st, rb) {
    g = getGame(g);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error("plays must be 1-5");
    var rows = [], seen = {};
    while (rows.length < n) {
      var p = makePick(g, mode, st, rb);
      if (seen[p.index]) continue;
      seen[p.index] = true;
      p.play = PLAY_LABELS[rows.length];
      rows.push(p);
    }
    return rows;
  }

  // Replace one play, never colliding with the other plays' indexes.
  function rerollPlay(g, slip, pos, mode, st, rb) {
    g = getGame(g);
    var others = {};
    slip.forEach(function (p, i) { if (i !== pos) others[p.index] = true; });
    for (;;) {
      var p = makePick(g, mode || slip[pos].mode, st, rb);
      if (others[p.index]) continue;
      p.play = slip[pos].play;
      return p;
    }
  }

  /* ------------------------------------------------------------ guess (deterministic) */
  function guessTickets(st) {
    var g = st.game;
    var bal = st.hotW.slice(0, 3);
    for (var i = 0; i < st.overW.length && bal.length < g.white_count; i++) {
      if (bal.indexOf(st.overW[i]) < 0) bal.push(st.overW[i]);
    }
    return [
      ["A", "HOT", st.hotW.slice(0, 5), st.hotB[0], "guess-hot"],
      ["B", "COLD", st.coldW.slice(0, 5), st.coldB[0], "guess-cold"],
      ["C", "BALANCED", bal, st.overB[0], "guess-balanced"]
    ].map(function (r) {
      var w = r[2].slice().sort(numAsc);
      return { play: r[0], label: r[1], whites: w, bonus: r[3], index: encode(g, w, r[3]), mode: r[4] };
    });
  }

  function guessLines(st) {
    var g = st.game;
    var lines = [g.name.toUpperCase() + " GUESS  draws=" + st.D + "  " + st.first + ".." + st.last];
    guessTickets(st).forEach(function (t) {
      lines.push(t.play + ": " + fmtTicket(g, t.whites, t.bonus) + "  index " + t.index + "  (" + t.label + ")");
    });
    return lines.concat(notes(g));
  }

  /* ------------------------------------------------------------ export (SPEC section 9) */
  function utcStamp(date) { return (date || new Date()).toISOString().replace(/\.\d{3}Z$/, "Z"); }
  function fileStamp(stamp) { return stamp.replace(/[-:]/g, "").replace("T", "-").replace("Z", "Z"); }

  var EXPORT_KEYS = ["play", "mode", "w1", "w2", "w3", "w4", "w5", "bonus", "index", "game", "generated_at"];

  // plays: [{play, mode, whites, bonus, index}]; each play carries its own mode.
  function exportRecords(g, plays, stamp) {
    g = getGame(g);
    return plays.map(function (p) {
      var w = p.whites.slice().sort(numAsc);
      return [p.play, p.mode].concat(w).concat([p.bonus, p.index, g.id, stamp]);
    });
  }
  function exportCsv(g, plays, stamp) {
    var recs = exportRecords(g, plays, stamp);
    return EXPORT_KEYS.join(",") + "\n" + recs.map(function (r) { return r.join(",") + "\n"; }).join("");
  }
  function exportJson(g, plays, stamp) {
    var recs = exportRecords(g, plays, stamp);
    var objs = recs.map(function (r) {
      return "  {" + EXPORT_KEYS.map(function (k, i) {
        var v = r[i];
        return '"' + k + '": ' + (typeof v === "string" ? '"' + v + '"' : String(v));
      }).join(", ") + "}";
    });
    return "[\n" + objs.join(",\n") + "\n]\n";
  }

  var api = {
    comb: comb, GAMES: GAMES, MEGA_MILLIONS: MEGA_MILLIONS, POWERBALL: POWERBALL, MODES: MODES,
    PLAY_LABELS: PLAY_LABELS, getGame: getGame,
    validateTicket: validateTicket, validateIndex: validateIndex, parseIndexText: parseIndexText,
    encode: encode, decode: decode, randbelow: randbelow, randU32: randU32,
    pad2: pad2, group: group, fmtTicket: fmtTicket, fmt2: fmt2, notes: notes,
    normalizeDraws: normalizeDraws, parseDrawsCsv: parseDrawsCsv, computeStats: computeStats,
    statsSummaryLines: statsSummaryLines,
    rankHot: rankHot, rankCold: rankCold, rankOverdue: rankOverdue,
    weightedTake: weightedTake, hotWeights: hotWeights, coldWeights: coldWeights,
    makePick: makePick, makeSlip: makeSlip, rerollPlay: rerollPlay,
    guessTickets: guessTickets, guessLines: guessLines,
    utcStamp: utcStamp, fileStamp: fileStamp, exportCsv: exportCsv, exportJson: exportJson
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MegaIndex = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
