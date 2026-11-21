#!/usr/bin/env node
/* Unit + golden tests for src/web/js/core.js.  Run: node src/web/tests/test-core.js */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../js/core.js");

var ROOT = path.resolve(__dirname, "..", "..", "..");
var GOLD = path.join(ROOT, "tests", "golden");
var passed = 0, failed = 0;

function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.log("FAIL: " + msg); }
}
function eq(a, b, msg) {
  var A = JSON.stringify(a), B = JSON.stringify(b);
  ok(A === B, msg + "\n   got:      " + A + "\n   expected: " + B);
}
function throwsMsg(fn, msg, label) {
  try { fn(); ok(false, label + " (no throw)"); }
  catch (e) { eq(e.message, msg, label); }
}
function section(name) { console.log("-- " + name); }

var MM = M.MEGA_MILLIONS, PB = M.POWERBALL;

section("game config");
eq([MM.white_combos, MM.total], [12103014, 290472336], "MM totals");
eq([PB.white_combos, PB.total], [11238513, 292201338], "PB totals");
eq(M.comb(3, 5), 0, "C(n,k)=0 when n<k");

section("PDF vectors (both directions)");
[[[7, 19, 33, 48, 62], 11, 147183154], [[8, 24, 37, 38, 66], 9, 200000000],
 [[1, 2, 3, 4, 5], 1, 0], [[66, 67, 68, 69, 70], 24, 290472335]].forEach(function (v) {
  eq(M.encode(MM, v[0], v[1]), v[2], "encode " + v[0] + " MB " + v[1]);
  eq(M.decode(MM, v[2]), { whites: v[0], bonus: v[1] }, "decode " + v[2]);
});
eq(M.encode("megamillions", [62, 7, 48, 19, 33], 11), 147183154, "encode unsorted");

section("Powerball endpoints");
eq(M.decode(PB, 0), { whites: [1, 2, 3, 4, 5], bonus: 1 }, "PB 0");
eq(M.decode(PB, 292201337), { whites: [65, 66, 67, 68, 69], bonus: 26 }, "PB max");
eq(M.encode(PB, [65, 66, 67, 68, 69], 26), 292201337, "PB encode max");

section("tests/golden/vectors.txt");
var nvec = 0;
fs.readFileSync(path.join(GOLD, "vectors.txt"), "utf8").split("\n").forEach(function (line) {
  if (!line.trim() || line[0] === "#") return;
  var f = line.trim().split(/\s+/);
  var g = M.getGame(f[0]), w = f.slice(1, 6).map(Number), b = Number(f[6]), idx = Number(f[7]);
  eq(M.encode(g, w, b), idx, "vector encode " + line);
  eq(M.decode(g, idx), { whites: w, bonus: b }, "vector decode " + line);
  nvec++;
});
ok(nvec >= 40, "vectors.txt has lines (" + nvec + ")");

section("ticket display format");
eq(M.fmtTicket(MM, [62, 7, 48, 19, 33], 11), "07 19 33 48 62 MB 11", "fmtTicket");
eq(M.notes(MM), ["NOTE: Fair picks do not improve your odds. Every ticket is 1 in 290,472,336.",
  "NOTE: Hot/cold is for fun and cannot predict draws; uniform is the default mode."], "notes MM");
ok(M.notes(PB)[0].indexOf("292,201,338") > 0, "notes PB total");

section("round trips (>= 100k CSPRNG indexes, both games)");
function validTicket(g, t) {
  if (t.whites.length !== 5) return false;
  for (var i = 0; i < 5; i++) {
    if (t.whites[i] < 1 || t.whites[i] > g.white_max) return false;
    if (i && t.whites[i] <= t.whites[i - 1]) return false;
  }
  return t.bonus >= 1 && t.bonus <= g.bonus_max;
}
[[MM, 120000], [PB, 100000]].forEach(function (gc) {
  var g = gc[0], bad = 0;
  for (var i = 0; i < gc[1]; i++) {
    var idx = M.randbelow(g.total), t = M.decode(g, idx);
    if (!validTicket(g, t) || M.encode(g, t.whites, t.bonus) !== idx) { bad++; if (bad < 4) console.log("  bad idx " + idx); }
  }
  ok(bad === 0, g.id + " encode(decode(i)) == i x" + gc[1]);
});
(function () {
  var bad = 0;
  for (var i = 0; i < 20000; i++) {
    var pool = [], w = [];
    for (var n = 1; n <= 70; n++) pool.push(n);
    for (var j = 0; j < 5; j++) w.push(pool.splice(M.randbelow(pool.length), 1)[0]);
    var b = M.randbelow(24) + 1, t = M.decode(MM, M.encode(MM, w, b));
    if (JSON.stringify(t) !== JSON.stringify({ whites: w.slice().sort(function (a, c) { return a - c; }), bonus: b })) bad++;
  }
  ok(bad === 0, "decode(encode(t)) == t x20000");
})();

section("invalid input rejected");
eq(M.validateTicket(MM, [1, 2, 3, 4], 1), "expected 5 white balls, got 4", "count");
eq(M.validateTicket(MM, [1, 2, 3, 4, 71], 1), "white ball 71 out of range 1-70", "white range high");
eq(M.validateTicket(MM, [0, 2, 3, 4, 5], 1), "white ball 0 out of range 1-70", "white range zero");
eq(M.validateTicket(MM, [1, 2, 3, 3, 5], 1), "duplicate white ball 3", "duplicate");
eq(M.validateTicket(MM, [1, 2, 3, 4, 5], null), "missing --bonus", "missing bonus");
eq(M.validateTicket(MM, [1, 2, 3, 4, 5], 25), "Mega Ball 25 out of range 1-24", "MB range");
eq(M.validateTicket(PB, [1, 2, 3, 4, 5], 27), "Powerball 27 out of range 1-26", "PB range");
throwsMsg(function () { M.decode(MM, 290472336); }, "index 290472336 out of range 0-290472335", "decode range");
throwsMsg(function () { M.decode(PB, 292201338); }, "index 292201338 out of range 0-292201337", "PB decode range");
throwsMsg(function () { M.decode(MM, -1); }, "index -1 out of range 0-290472335", "decode negative");
throwsMsg(function () { M.encode(MM, [1, 1, 2, 3, 4], 1); }, "duplicate white ball 1", "encode dup throws");
eq(M.parseIndexText(MM, "147,183,154"), { index: 147183154 }, "parseIndexText commas");
eq(M.parseIndexText(MM, "1.5"), { error: "not an integer: '1.5'" }, "parseIndexText float");
eq(M.parseIndexText(MM, "290472336"), { error: "index 290472336 out of range 0-290472335" }, "parseIndexText range");
throwsMsg(function () { M.getGame("lotto"); }, "unknown game 'lotto'", "unknown game");
throwsMsg(function () { M.makeSlip(MM, 6, "uniform"); }, "plays must be 1-5", "plays range");
throwsMsg(function () { M.makePick(MM, "lucky"); }, "unknown mode 'lucky'", "mode");
throwsMsg(function () { M.makePick(PB, "hot", null); }, "stats required for mode hot", "PB hot needs stats");

section("randbelow");
(function () {
  var inRange = true, buckets = [], N = 240000, i;
  for (i = 0; i < 24; i++) buckets.push(0);
  for (i = 0; i < N; i++) { var r = M.randbelow(24); if (r < 0 || r >= 24 || r !== Math.floor(r)) inRange = false; else buckets[r]++; }
  ok(inRange, "randbelow(24) in range");
  var worst = 0; buckets.forEach(function (c) { worst = Math.max(worst, Math.abs(c - 10000) / 10000); });
  ok(worst <= 0.05, "randbelow(24) buckets within 5% (worst " + (worst * 100).toFixed(2) + "%)");
  for (i = 0; i < 2000; i++) { var x = M.randbelow(MM.total); if (x < 0 || x >= MM.total) inRange = false; }
  for (i = 0; i < 200; i++) { if (M.randbelow(1) !== 0) inRange = false; }
  var big = 4294967295; for (i = 0; i < 200; i++) { var y = M.randbelow(big); if (y < 0 || y >= big) inRange = false; }
  ok(inRange, "randbelow edge sizes in range");
  throwsMsg(function () { M.randbelow(0); }, "randbelow: n out of range", "randbelow(0)");
  throwsMsg(function () { M.randbelow(4294967296); }, "randbelow: n out of range", "randbelow(2^32)");
  var src = fs.readFileSync(path.join(__dirname, "..", "js", "core.js"), "utf8");
  ok(src.indexOf("Math.random") < 0, "core.js never uses Math.random");
})();

section("golden stats + guess (tests/golden/draws.csv)");
var draws = M.parseDrawsCsv(MM, fs.readFileSync(path.join(GOLD, "draws.csv"), "utf8"));
var st = M.computeStats(MM, draws);
var statsTxt = fs.readFileSync(path.join(GOLD, "stats.txt"), "utf8").split("\n");
eq(st.D, 169, "draw count");
ok(statsTxt.indexOf("range: " + st.first + ".." + st.last) >= 0, "range line");
ok(statsTxt.indexOf("expected white freq: " + st.expWText) >= 0, "expected white");
ok(statsTxt.indexOf("expected MB freq: " + st.expBText) >= 0, "expected MB");
M.statsSummaryLines(st).forEach(function (line) {
  ok(statsTxt.indexOf(line) >= 0, "stats.txt has: " + line);
});
// the whole per-number tables, too
var tbl = [];
st.whites.forEach(function (n) { tbl.push(fmtRow(n, st.wf[n], st.devW(n), st.wgap[n])); });
st.bonuses.forEach(function (n) { tbl.push(fmtRow(n, st.bf[n], st.devB(n), st.bgap[n])); });
function lpad(s, w) { s = String(s); while (s.length < w) s = " " + s; return s; }
function fmtRow(n, f, dev, gap) { return M.pad2(n) + "  " + lpad(f, 4) + "  " + lpad(dev, 6) + "  " + lpad(gap, 4); }
var rowsGold = statsTxt.filter(function (l) { return /^\d\d  /.test(l); });
eq(tbl, rowsGold, "per-number freq/dev/gap tables match stats.txt");
var guessGold = fs.readFileSync(path.join(GOLD, "guess.txt"), "utf8").replace(/\n$/, "").split("\n");
eq(M.guessLines(st), guessGold, "guess lines == guess.txt");
var gt = M.guessTickets(st);
eq(gt.map(function (t) { return t.index; }), [43748603, 215053886, 256609788], "guess indexes");
// bundled web data loads and matches data/draws.csv
(function () {
  var sandbox = {};
  new Function("window", fs.readFileSync(path.join(__dirname, "..", "js", "draws-data.js"), "utf8"))(sandbox);
  var webDraws = M.normalizeDraws(MM, sandbox.MM_DRAWS);
  ok(webDraws.length > 0 && typeof sandbox.MM_DRAWS_UPDATED === "string", "draws-data.js loads");
  var csvPath = path.join(ROOT, "data", "draws.csv");
  if (fs.existsSync(csvPath)) eq(webDraws, M.parseDrawsCsv(MM, fs.readFileSync(csvPath, "utf8")), "draws-data.js == data/draws.csv");
})();

section("Powerball golden stats + guess (tests/golden/powerball-draws.csv)");
(function () {
  var csv = path.join(GOLD, "powerball-draws.csv"), sf = path.join(GOLD, "pb_stats.txt"), gf = path.join(GOLD, "pb_guess.txt");
  if (!fs.existsSync(csv) || !fs.existsSync(sf) || !fs.existsSync(gf)) {
    console.log("   SKIP: Powerball goldens missing (need powerball-draws.csv, pb_stats.txt, pb_guess.txt)");
    return;
  }
  var pd = M.parseDrawsCsv(PB, fs.readFileSync(csv, "utf8"));
  var ps = M.computeStats(PB, pd);
  var txt = fs.readFileSync(sf, "utf8").split("\n");
  ok(txt[0] === "POWERBALL STATS", "pb_stats header");
  ok(txt.indexOf("draws: " + ps.D) >= 0, "pb draws line (" + ps.D + ")");
  ok(txt.indexOf("range: " + ps.first + ".." + ps.last) >= 0, "pb range line");
  ok(txt.indexOf("expected white freq: " + ps.expWText) >= 0, "pb expected white = N*5/69 (" + ps.expWText + ")");
  ok(txt.indexOf("expected PB freq: " + ps.expBText) >= 0, "pb expected PB = N/26 (" + ps.expBText + ")");
  eq([ps.whites.length, ps.bonuses.length, ps.dfW, ps.dfB], [69, 26, 68, 25], "pb ranges + df");
  M.statsSummaryLines(ps).forEach(function (line) { ok(txt.indexOf(line) >= 0, "pb_stats.txt has: " + line); });
  var t2 = [];
  ps.whites.forEach(function (n) { t2.push(fmtRow(n, ps.wf[n], ps.devW(n), ps.wgap[n])); });
  ps.bonuses.forEach(function (n) { t2.push(fmtRow(n, ps.bf[n], ps.devB(n), ps.bgap[n])); });
  eq(t2, txt.filter(function (l) { return /^\d\d  /.test(l); }), "pb per-number tables match pb_stats.txt");
  eq(M.guessLines(ps), fs.readFileSync(gf, "utf8").replace(/\n$/, "").split("\n"), "pb guess lines == pb_guess.txt");
  var g3 = M.guessTickets(ps);
  eq(g3.map(function (t) { return M.fmtTicket(PB, t.whites, t.bonus) + " " + t.index; }),
    ["21 23 28 61 64 PB 14 195511121", "13 26 34 46 49 PB 16 48543757", "21 27 61 63 64 PB 26 198152707"], "pb guess tickets");
  ["uniform", "hot", "cold", "mixed"].forEach(function (mode) {
    var good = true;
    for (var i = 0; i < 200; i++) M.makeSlip(PB, 5, mode, ps).forEach(function (p) {
      if (!validTicket(PB, p) || M.encode(PB, p.whites, p.bonus) !== p.index) good = false;
    });
    ok(good, "pb makeSlip mode=" + mode);
  });
})();
(function () {
  var f = path.join(__dirname, "..", "power", "js", "draws-data.js");
  if (!fs.existsSync(f)) { console.log("   SKIP: src/web/power/js/draws-data.js not generated yet"); return; }
  var sb = {};
  new Function("window", fs.readFileSync(f, "utf8"))(sb);
  var pw = M.normalizeDraws(PB, sb.PB_DRAWS);
  ok(pw.length > 1000 && pw[0].d === "2015-10-07" && typeof sb.PB_DRAWS_UPDATED === "string", "power draws-data.js loads (" + pw.length + ")");
  ok(M.computeStats(PB, pw).D === pw.length, "power data computes stats");
  var c = path.join(ROOT, "data", "powerball-draws.csv");
  if (fs.existsSync(c)) eq(pw, M.parseDrawsCsv(PB, fs.readFileSync(c, "utf8")), "power draws-data.js == data/powerball-draws.csv");
})();

section("weighted modes");
(function () {
  // deterministic rb: always 0 -> first number in ascending order each round
  var zero = function () { return 0; };
  eq(M.weightedTake({ 3: 1, 1: 5, 2: 2 }, 3, zero), [1, 2, 3], "weightedTake ascending walk");
  var last = function (n) { return n - 1; };
  eq(M.weightedTake({ 1: 1, 2: 1, 3: 9 }, 1, last), [3], "weightedTake last bucket");
  eq(M.coldWeights([0, 5, 2, 9], [1, 2, 3]), { 1: 5, 2: 8, 3: 1 }, "cold weights");
  eq(M.hotWeights([0, 5, 2, 9], [1, 2, 3]), { 1: 6, 2: 3, 3: 10 }, "hot weights");
  ["uniform", "hot", "cold", "mixed"].forEach(function (mode) {
    var allOk = true;
    for (var i = 0; i < 300; i++) {
      var s = M.makeSlip(MM, 5, mode, st), seen = {};
      s.forEach(function (p, j) {
        if (!validTicket(MM, p) || p.play !== "ABCDE"[j] || p.mode !== mode || seen[p.index] ||
            M.encode(MM, p.whites, p.bonus) !== p.index) allOk = false;
        seen[p.index] = true;
      });
    }
    ok(allOk, "makeSlip mode=" + mode + " valid, labelled, unique");
  });
  var slip = M.makeSlip(MM, 3, "uniform");
  var r = M.rerollPlay(MM, slip, 1, "hot", st);
  ok(r.play === "B" && r.mode === "hot" && r.index !== slip[0].index && r.index !== slip[2].index, "rerollPlay");
})();

section("fillTicket: locks kept, rest uniform (CODEC RANDOM)");
(function () {
  // locks preserved, result valid + distinct, index consistent
  var good = true;
  [[MM, [7, 19], 8], [PB, [69], null], [MM, [], 8], [PB, [1, 2, 3, 4], 26], [MM, [], null]].forEach(function (c) {
    for (var i = 0; i < 3000; i++) {
      var t = M.fillTicket(c[0], c[1], c[2]);
      if (!validTicket(c[0], t) || M.encode(c[0], t.whites, t.bonus) !== t.index) good = false;
      c[1].forEach(function (w) { if (t.whites.indexOf(w) < 0) good = false; });
      if (c[2] != null && t.bonus !== c[2]) good = false;
      if (t.drawnWhites.length !== 5 - c[1].length || t.drawnBonus !== (c[2] == null)) good = false;
      t.drawnWhites.forEach(function (w) { if (c[1].indexOf(w) >= 0) good = false; });
    }
  });
  ok(good, "fillTicket keeps locks, valid distinct tickets, correct index");
  // all six locked: exactly the locks, nothing drawn, rng never called
  var calls = 0;
  var all = M.fillTicket(MM, [62, 7, 48, 19, 33], 11, function () { calls++; return 0; });
  eq([all.whites, all.bonus, all.index, all.drawnWhites, all.drawnBonus, calls], [[7, 19, 33, 48, 62], 11, 147183154, [], false, 0], "fillTicket all locked = locks");
  // deterministic with a stub rng
  var zero = function () { return 0; };
  eq(M.fillTicket(MM, [3], null, zero), { whites: [1, 2, 3, 4, 5], bonus: 1, index: M.encode(MM, [1, 2, 3, 4, 5], 1), drawnWhites: [1, 2, 4, 5], drawnBonus: true }, "fillTicket stub rng 0");
  var last = function (n) { return n - 1; };
  var tl = M.fillTicket(PB, [], 8, last);
  eq([tl.whites, tl.bonus], [[65, 66, 67, 68, 69], 8], "fillTicket stub rng n-1");
  eq(M.fillTicket(MM, [10, 20], 8, zero), M.fillTicket(MM, [20, 10], 8, zero), "fillTicket deterministic, lock order irrelevant");
  throwsMsg(function () { M.fillTicket(MM, [1, 1], null); }, "duplicate white ball 1", "fillTicket dup lock");
  throwsMsg(function () { M.fillTicket(MM, [71], null); }, "white ball 71 out of range 1-70", "fillTicket white range");
  throwsMsg(function () { M.fillTicket(PB, [], 27); }, "Powerball 27 out of range 1-26", "fillTicket bonus range");
  throwsMsg(function () { M.fillTicket(MM, [1, 2, 3, 4, 5, 6], null); }, "expected 5 white balls, got 6", "fillTicket too many locks");
  // uniformity: Mega Ball 8 locked -> whites uniform over 1..70; df 69. Also 2 whites locked -> free over 68.
  function chi(counts, expct) { var x = 0; counts.forEach(function (c) { x += (c - expct) * (c - expct) / expct; }); return x; }
  var N = 60000, cw = [], cb = [], i, n;
  for (i = 0; i < 70; i++) cw.push(0);
  for (i = 0; i < N; i++) { var t = M.fillTicket(MM, [], 8); t.whites.forEach(function (w) { cw[w - 1]++; }); if (t.bonus !== 8) cb.push(t.bonus); }
  var x1 = chi(cw, N * 5 / 70);
  ok(cb.length === 0 && x1 < 69 + 5 * Math.sqrt(2 * 69), "MB 8 locked: bonus always 8, whites chi2 " + x1.toFixed(1) + " (df 69)");
  var cf = {}, nb = [];
  for (i = 0; i < 26; i++) nb.push(0);
  for (i = 0; i < N; i++) {
    var u = M.fillTicket(PB, [7, 64], null);
    u.drawnWhites.forEach(function (w) { cf[w] = (cf[w] || 0) + 1; });
    nb[u.bonus - 1]++;
  }
  var free = []; for (n = 1; n <= 69; n++) if (n !== 7 && n !== 64) free.push(cf[n] || 0);
  var x2 = chi(free, N * 3 / 67), x3 = chi(nb, N / 26);
  ok(!cf[7] && !cf[64] && x2 < 66 + 5 * Math.sqrt(2 * 66), "PB 2 whites locked: free whites chi2 " + x2.toFixed(1) + " (df 66)");
  ok(x3 < 25 + 5 * Math.sqrt(50), "PB unlocked bonus chi2 " + x3.toFixed(1) + " (df 25)");
})();

section("export format (SPEC section 9)");
(function () {
  var plays = [
    { play: "A", mode: "uniform", whites: [3, 21, 43, 49, 57], bonus: 14, index: 96625645 },
    { play: "B", mode: "hot", whites: [7, 19, 33, 48, 62], bonus: 11, index: 147183154 }
  ];
  var stamp = "2026-11-20T22:36:10Z";
  eq(M.exportCsv(MM, plays, stamp),
    "play,mode,w1,w2,w3,w4,w5,bonus,index,game,generated_at\n" +
    "A,uniform,3,21,43,49,57,14,96625645,megamillions,2026-11-20T22:36:10Z\n" +
    "B,hot,7,19,33,48,62,11,147183154,megamillions,2026-11-20T22:36:10Z\n", "CSV");
  eq(M.exportJson(MM, plays, stamp),
    "[\n" +
    '  {"play": "A", "mode": "uniform", "w1": 3, "w2": 21, "w3": 43, "w4": 49, "w5": 57, "bonus": 14, "index": 96625645, "game": "megamillions", "generated_at": "2026-11-20T22:36:10Z"},\n' +
    '  {"play": "B", "mode": "hot", "w1": 7, "w2": 19, "w3": 33, "w4": 48, "w5": 62, "bonus": 11, "index": 147183154, "game": "megamillions", "generated_at": "2026-11-20T22:36:10Z"}\n' +
    "]\n", "JSON");
  ok(M.exportCsv(PB, plays.slice(0, 1), stamp).split("\n")[1] === "A,uniform,3,21,43,49,57,14,96625645,powerball,2026-11-20T22:36:10Z", "CSV game field powerball");
  ok(M.exportJson(PB, plays.slice(0, 1), stamp).indexOf('"game": "powerball"') > 0, "JSON game field powerball");
  eq(M.fmtTicket(PB, [62, 7, 48, 19, 33], 11), "07 19 33 48 62 PB 11", "PB ticket format");
  eq(M.validateTicket(PB, [1, 2, 3, 4, 70], 1), "white ball 70 out of range 1-69", "PB white range");
  eq(M.parseIndexText(PB, "292201338"), { error: "index 292201338 out of range 0-292201337" }, "PB parseIndexText range");
  eq(M.utcStamp(new Date(Date.UTC(2026, 10, 20, 22, 36, 10, 123))), "2026-11-20T22:36:10Z", "utcStamp");
  ok(/^[0-9A-Za-z-]+$/.test(M.fileStamp(stamp)), "fileStamp is filename-safe: " + M.fileStamp(stamp));
  eq(M.fmt2(-5, 10, true), "-0.50", "fmt2 half away from zero (neg)");
  eq(M.fmt2(0, 7, true), "+0.00", "fmt2 zero signed");
  eq(M.fmt2(-1, 1000, true), "+0.00", "fmt2 tiny negative rounds to +0.00");
})();

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
