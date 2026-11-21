#!/usr/bin/env node
/* End-to-end check that MEGA//INDEX (/) and POWER//INDEX (/power/) install and work offline
 * independently on ONE origin, in headless Chrome (DevTools protocol, no puppeteer).
 * Run: node src/web/tests/test-two-apps.js
 * Optional: V3_DIR=<copy of the pre-POWER src/web> also runs the upgrade scenario (an old MEGA worker
 * is installed, the site is swapped for this build, then /power/ is opened for the first time).
 * "Offline" means the HTTP server is killed, so the workers' own fetches really fail. */
"use strict";
var child = require("child_process");
var fs = require("fs");
var path = require("path");
var os = require("os");

var WEB = path.resolve(__dirname, "..");
var CHROME = process.env.CHROME || "/usr/bin/google-chrome";
var passed = 0, failed = 0;
function ok(c, m) { if (c) passed++; else { failed++; console.log("FAIL: " + m); } }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ---------------------------------------------------------------- server: serves <root> on a port */
var server = null;
function serve(root, port) {
  stopServer();
  server = child.spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", root], { stdio: "ignore" });
  return waitFor(async function () { try { return (await fetch("http://127.0.0.1:" + port + "/")).ok; } catch (e) { return false; } }, 5000);
}
function stopServer() { if (server) { server.kill("SIGKILL"); server = null; } }
async function waitFor(fn, ms) {
  var t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(150); }
  return false;
}
// a site dir with the app either at the root or under /mega-index/ (the GitHub Pages layout)
var sites = [];
function site(webDir, sub) {
  var d = fs.mkdtempSync(path.join(os.tmpdir(), "two-apps-site-"));
  sites.push(d);
  if (sub) { fs.symlinkSync(webDir, path.join(d, "mega-index")); return d; }
  fs.rmdirSync(d); fs.symlinkSync(webDir, d); return d;
}

/* ---------------------------------------------------------------- chrome */
async function browser() {
  var port = 9700 + Math.floor(Math.random() * 250);
  var prof = fs.mkdtempSync(path.join(os.tmpdir(), "two-apps-chrome-"));
  var proc = child.spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + port, "--user-data-dir=" + prof,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "about:blank"], { stdio: "ignore" });
  var page = null;
  await waitFor(async function () {
    try { page = (await (await fetch("http://127.0.0.1:" + port + "/json/list")).json()).find(function (t) { return t.type === "page"; }); }
    catch (e) { page = null; }
    return !!page;
  }, 20000);
  var ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(function (r) { ws.onopen = r; });
  var id = 0, pending = {}, errors = [];
  ws.onmessage = function (m) {
    var msg = JSON.parse(m.data);
    if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; return; }
    if (msg.method === "Runtime.exceptionThrown") errors.push("EXCEPTION " + (msg.params.exceptionDetails.exception || {}).description);
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push("console.error");
  };
  function send(method, params) {
    return new Promise(function (res, rej) {
      var mid = ++id;
      pending[mid] = function (msg) { msg.error ? rej(new Error(method + ": " + JSON.stringify(msg.error))) : res(msg.result); };
      ws.send(JSON.stringify({ id: mid, method: method, params: params || {} }));
    });
  }
  await send("Page.enable"); await send("Runtime.enable");
  var b = {
    errors: errors, send: send,
    eval: async function (expr) {
      try { var r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return r.result.value; }
      catch (e) { return undefined; }
    },
    go: async function (url) { await send("Page.navigate", { url: url }); await sleep(700); },
    close: function () { ws.close(); proc.kill("SIGKILL"); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* ignore */ } }
  };
  return b;
}

// wait until the page is controlled by <swPath> and the app booted (data loaded)
async function settle(b, swPath) {
  return waitFor(async function () {
    return await b.eval("!!(navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.endsWith(" +
      JSON.stringify(swPath) + ")) && !!document.querySelector('#ticker b')");
  }, 15000);
}
async function snapshot(b) {
  return JSON.parse(await b.eval("JSON.stringify({title: document.title, ctl: navigator.serviceWorker && navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null," +
    " ticker: (document.getElementById('ticker') || {}).textContent || '', bar: !!(document.getElementById('updateBar') && !document.getElementById('updateBar').hidden)})") || "{}");
}
async function checkApp(b, base, label, which) {
  var isPower = which === "power";
  var s = await snapshot(b);
  ok(s.title === (isPower ? "POWER//INDEX" : "MEGA//INDEX"), label + ": title " + s.title);
  ok(s.ticker.indexOf(isPower ? "292,201,338" : "290,472,336") >= 0, label + ": " + which + " game totals in ticker");
  ok(/DATA \d+ DRAWS/.test(s.ticker), label + ": draw data loaded");
  ok(s.ctl === base + (isPower ? "power/sw.js" : "sw.js"), label + ": controlled by own worker (" + s.ctl + ")");
  ok(!s.bar, label + ": no spurious NEW BUILD bar");
}

async function scenario(name, root, sub, order) {
  var port = 8600 + Math.floor(Math.random() * 300);
  var base = "http://127.0.0.1:" + port + "/" + (sub ? "mega-index/" : "");
  await serve(root, port);
  var b = await browser();
  var ids = {};
  for (var which of order) {
    var url = base + (which === "power" ? "power/" : "");
    await b.go(url);
    ok(await settle(b, which === "power" ? "/power/sw.js" : "/sw.js"), name + ": " + which + " settles under its own worker");
    await b.go(url); // second load: from the worker's cache
    await settle(b, which === "power" ? "/power/sw.js" : "/sw.js");
    await checkApp(b, base, name + " online " + which, which);
    var inst = await b.send("Page.getInstallabilityErrors");
    ok(inst.installabilityErrors.length === 0, name + ": " + which + " installable " + JSON.stringify(inst.installabilityErrors));
    ids[which] = (await b.send("Page.getAppId")).appId;
  }
  ok(ids.mega && ids.power && ids.mega !== ids.power, name + ": distinct manifest ids " + JSON.stringify(ids));
  var keys = await b.eval("caches.keys()");
  ok(keys.filter(function (k) { return /^mega-index-/.test(k); }).length === 1 && keys.filter(function (k) { return /^power-index-/.test(k); }).length === 1,
    name + ": one cache per app " + JSON.stringify(keys));
  var regs = await b.eval("navigator.serviceWorker.getRegistrations().then(function(r){return r.map(function(x){return x.scope})})");
  ok(regs && regs.length === 2, name + ": two registrations " + JSON.stringify(regs));
  stopServer();
  for (var w of ["mega", "power", "mega"]) {
    await b.go(base + (w === "power" ? "power/#stats" : "#stats"));
    await settle(b, w === "power" ? "/power/sw.js" : "/sw.js");
    await checkApp(b, base, name + " OFFLINE " + w, w);
    var kp = await b.eval("document.getElementById('kpis').textContent");
    ok(/DRAWS\d{3,}/.test(kp || ""), name + " OFFLINE " + w + ": stats rendered");
  }
  ok(b.errors.length === 0, name + ": no exceptions " + JSON.stringify(b.errors));
  b.close();
}

async function noHijack(root) {
  var port = 8600 + Math.floor(Math.random() * 300);
  var base = "http://127.0.0.1:" + port + "/mega-index/";
  await serve(root, port);
  var b = await browser();
  await b.go(base); await settle(b, "/sw.js"); await b.go(base); await settle(b, "/sw.js");
  stopServer();
  await b.go(base + "power/");
  await sleep(800);
  var t = await b.eval("document.title");
  ok(t !== "MEGA//INDEX", "MEGA worker does not answer /power/ navigations (offline, power never visited): title=" + JSON.stringify(t));
  await b.go(base);
  ok((await b.eval("document.title")) === "MEGA//INDEX", "MEGA still works offline after that");
  b.close();
}

async function upgrade(v3dir) {
  var port = 8600 + Math.floor(Math.random() * 300);
  var base = "http://127.0.0.1:" + port + "/mega-index/";
  var oldSite = site(v3dir, true), newSite = site(WEB, true);
  await serve(oldSite, port);
  var b = await browser();
  await b.go(base); await settle(b, "/sw.js"); await b.go(base); await settle(b, "/sw.js");
  var old = await b.eval("caches.keys()");
  ok(old && old.some(function (k) { return /^mega-index-v3-/.test(k); }), "upgrade: old v3 MEGA worker installed " + JSON.stringify(old));
  await serve(newSite, port); // deploy
  await b.go(base + "power/");
  ok(await settle(b, "/power/sw.js"), "upgrade: first /power/ visit hands over to POWER's worker");
  await checkApp(b, base, "upgrade first visit", "power");
  await b.go(base);
  // the current build replaces v3 (the NEW BUILD bar may legitimately show on this load); wait until v3's cache is gone
  var cur = "mega-index-" + fs.readFileSync(path.join(WEB, "sw.js"), "utf8").match(/APP_VERSION = "([^"]+)"/)[1] + "-";
  ok(await waitFor(async function () { var k = JSON.stringify(await b.eval("caches.keys()")); return k.indexOf(cur) >= 0 && !/mega-index-v3-/.test(k); }, 15000), "upgrade: MEGA worker updated to " + cur);
  await b.go(base); await settle(b, "/sw.js");
  await checkApp(b, base, "upgrade mega", "mega");
  ok(b.errors.length === 0, "upgrade: no exceptions " + JSON.stringify(b.errors));
  b.close();
}

(async function () {
  if (!fs.existsSync(path.join(WEB, "power", "js", "draws-data.js"))) {
    console.log("SKIP: src/web/power/js/draws-data.js missing (run tools/refresh_data.py)");
    process.exit(0);
  }
  var rootSite = site(WEB, false), subSite = site(WEB, true);
  try {
    console.log("-- root layout (python3 -m http.server from src/web), MEGA then POWER");
    await scenario("root", rootSite, false, ["mega", "power"]);
    console.log("-- Pages layout (/mega-index/), POWER then MEGA");
    await scenario("pages", subSite, true, ["power", "mega"]);
    console.log("-- MEGA's worker never answers /power/");
    await noHijack(subSite);
    if (process.env.V3_DIR) { console.log("-- upgrade from an installed v3 MEGA"); await upgrade(path.resolve(process.env.V3_DIR)); }
    else console.log("-- upgrade scenario skipped (set V3_DIR to a pre-POWER copy of src/web)");
  } catch (e) { failed++; console.log("FAIL: " + (e && e.stack || e)); }
  stopServer();
  sites.forEach(function (d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* ignore */ } });
  console.log(passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})();
