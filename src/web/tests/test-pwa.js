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
console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
