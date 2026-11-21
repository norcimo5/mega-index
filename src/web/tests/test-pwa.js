#!/usr/bin/env node
/* Static PWA checks: precache list exists on disk, manifest fields, icon PNG sizes, relative URLs only.
 * Run: node src/web/tests/test-pwa.js */
"use strict";
var fs = require("fs"), path = require("path");
var WEB = path.resolve(__dirname, "..");
var passed = 0, failed = 0;
function ok(c, m) { if (c) passed++; else { failed++; console.log("FAIL: " + m); } }
function pngSize(p) { var b = fs.readFileSync(p); return b.slice(1, 4).toString() === "PNG" ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; }

var sw = fs.readFileSync(path.join(WEB, "sw.js"), "utf8");
var list = JSON.parse(sw.match(/var PRECACHE = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
list.forEach(function (u) {
  ok(/^\.\//.test(u), "precache entry relative: " + u);
  var f = u === "./" ? "index.html" : u.slice(2);
  ok(fs.existsSync(path.join(WEB, f)), "precache entry exists: " + u);
});
ok(/importScripts\("\.\/js\/draws-data\.js"\)/.test(sw) && /MM_DRAWS_UPDATED/.test(sw), "sw cache name keyed on draw data");

var mf = JSON.parse(fs.readFileSync(path.join(WEB, "manifest.webmanifest"), "utf8"));
ok(mf.name === "MEGA//INDEX" && mf.short_name, "manifest names");
ok(mf.start_url === "./" && mf.scope === "./", "manifest start_url/scope relative");
ok(mf.display === "standalone" && mf.orientation === "portrait" && mf.theme_color && mf.background_color, "manifest display/orientation/colors");
var want = { "192x192 any": 0, "512x512 any": 0, "512x512 maskable": 0 };
mf.icons.forEach(function (ic) {
  var sz = pngSize(path.join(WEB, ic.src));
  ok(sz && sz[0] + "x" + sz[1] === ic.sizes, "icon real PNG of declared size: " + ic.src);
  want[ic.sizes + " " + (ic.purpose || "any")] = 1;
  ok(!/^\//.test(ic.src), "icon src relative: " + ic.src);
});
Object.keys(want).forEach(function (k) { ok(want[k], "manifest has icon " + k); });
ok(pngSize(path.join(WEB, "icons/apple-touch-icon.png"))[0] === 180, "apple-touch-icon 180");

var html = fs.readFileSync(path.join(WEB, "index.html"), "utf8");
var urls = [];
html.replace(/(?:src|href)="([^"]+)"/g, function (_, u) { urls.push(u); });
urls.forEach(function (u) {
  if (u[0] === "#") return;
  ok(!/^\//.test(u) && !/^https?:/.test(u), "relative URL in index.html: " + u);
  ok(fs.existsSync(path.join(WEB, u.split("#")[0])), "referenced file exists: " + u);
});
ok(!/type="module"/.test(html), "no ES modules");
ok(/viewport-fit=cover/.test(html), "viewport-fit=cover");
["core.js", "charts.js", "app.js"].forEach(function (f) {
  var src = fs.readFileSync(path.join(WEB, "js", f), "utf8");
  ok(src.indexOf("Math.random") < 0, f + " has no Math.random");
  ok(!/\bfetch\(/.test(src), f + " does not fetch");
});
ok(/var POWER_PATH = new URL\("\.\/power\/", self\.location\)\.pathname/.test(sw) &&
   /if \(\(url\.pathname \+ "\/"\)\.indexOf\(POWER_PATH\) === 0\) return;/.test(sw), "MEGA sw never answers ./power/");
ok(/class="switch-link" href="\.\/power\/"/.test(html), "MEGA links to POWER//INDEX");

/* ---------------------------------------------------------------- POWER//INDEX (power/) */
var PW = path.join(WEB, "power");
var psw = fs.readFileSync(path.join(PW, "sw.js"), "utf8");
var plist = JSON.parse(psw.match(/var PRECACHE = (\[[\s\S]*?\]);/)[1]);
var pdata = fs.existsSync(path.join(PW, "js", "draws-data.js"));
if (!pdata) console.log("SKIP: power/js/draws-data.js not generated yet (precache existence check skips it)");
plist.forEach(function (u) {
  ok(/^\.\.?\//.test(u), "power precache entry relative: " + u);
  var f = path.join(PW, u === "./" ? "index.html" : u);
  if (u === "./js/draws-data.js" && !pdata) return;
  ok(fs.existsSync(f), "power precache entry exists: " + u);
});
ok(/importScripts\("\.\/js\/draws-data\.js"\)/.test(psw) && /PB_DRAWS_UPDATED/.test(psw) && /PB_DRAWS\.length/.test(psw), "power sw cache name keyed on PB data + count");
ok(/var CACHE = "power-index-" \+ APP_VERSION/.test(psw) && /k\.indexOf\("power-index-"\) === 0/.test(psw), "power sw cache prefix power-index-, deletes only its own");

var pmf = JSON.parse(fs.readFileSync(path.join(PW, "manifest.webmanifest"), "utf8"));
ok(pmf.name === "POWER//INDEX" && pmf.short_name === "POWER//INDEX", "power manifest names");
ok(pmf.start_url === "./" && pmf.scope === "./", "power manifest start_url/scope ./");
ok(typeof pmf.id === "string" && typeof mf.id === "string", "both manifests have an explicit id");
// Chrome resolves "id" against the ORIGIN of start_url, so compare the resolved ids on the Pages host
var host = "https://norcimo5.github.io";
function appId(m, dir) { var start = new URL(m.start_url, host + dir); return new URL(m.id, start.origin).href; }
ok(appId(pmf, "/mega-index/power/") !== appId(mf, "/mega-index/"), "resolved ids differ: " + appId(pmf, "/mega-index/power/") + " vs " + appId(mf, "/mega-index/"));
ok(pmf.theme_color.toLowerCase() !== mf.theme_color.toLowerCase() && pmf.background_color.toLowerCase() !== mf.background_color.toLowerCase(), "power has its own theme/background colors");
ok(pmf.display === "standalone" && pmf.orientation === "portrait", "power display/orientation");
var pwant = { "192x192 any": 0, "512x512 any": 0, "512x512 maskable": 0 };
pmf.icons.forEach(function (ic) {
  ok(!/^\//.test(ic.src), "power icon src relative: " + ic.src);
  var sz = pngSize(path.join(PW, ic.src));
  ok(sz && sz[0] + "x" + sz[1] === ic.sizes, "power icon real PNG of declared size: " + ic.src);
  ok(fs.readFileSync(path.join(PW, ic.src)).toString("base64") !== fs.readFileSync(path.join(WEB, ic.src)).toString("base64"), "power icon differs from MEGA's: " + ic.src);
  pwant[ic.sizes + " " + (ic.purpose || "any")] = 1;
});
Object.keys(pwant).forEach(function (k) { ok(pwant[k], "power manifest has icon " + k); });
ok(pngSize(path.join(PW, "icons/apple-touch-icon.png"))[0] === 180, "power apple-touch-icon 180");

var phtml = fs.readFileSync(path.join(PW, "index.html"), "utf8");
var purls = [];
phtml.replace(/(?:src|href)="([^"]+)"/g, function (_, u) { purls.push(u); });
var loader = phtml.match(/var SCRIPTS = (\[[^\]]*\]);/);
ok(!!loader, "power loader script list");
if (loader) purls = purls.concat(JSON.parse(loader[1]));
purls.forEach(function (u) {
  if (u[0] === "#") return;
  ok(!/^\//.test(u) && !/^https?:/.test(u), "relative URL in power/index.html: " + u);
  if (u === "js/draws-data.js" && !pdata) return;
  ok(fs.existsSync(path.join(PW, u.split("#")[0])), "power referenced file exists: " + u);
  if (/\.(js|css)$/.test(u) && u !== "sw.js") ok(plist.indexOf(/^\.\.\//.test(u) ? u : "./" + u) >= 0, "power sw precaches " + u);
});
ok(/window\.APP_GAME = "powerball"/.test(phtml), "power page selects the powerball game");
ok(/<title>POWER\/\/INDEX<\/title>/.test(phtml) && /data-text="POWER\/\/INDEX"/.test(phtml), "power title + glitch text");
ok(phtml.indexOf("292,201,338") >= 0 && phtml.indexOf("290,472,336") < 0 && !/Mega Ball|MEGA BALL/.test(phtml), "power page has Powerball labels only");
ok(/class="switch-link" href="\.\.\/"/.test(phtml), "POWER links back to MEGA");
// app.js drives both pages by element id: the two pages must carry the same ids
function ids(h) { var o = []; h.replace(/\sid="([^"]+)"/g, function (_, i) { o.push(i); }); return o.sort().join(","); }
ok(ids(phtml) === ids(html), "power/index.html has exactly MEGA's element ids");
var pcss = fs.readFileSync(path.join(PW, "css", "power.css"), "utf8");
ok(/--bg:\s*#fff0f2/i.test(pcss) && /--gold:\s*#e0102f/i.test(pcss), "power theme: rose background, red Powerball");
console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
