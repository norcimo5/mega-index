#!/usr/bin/env node
/* Headless-Chrome harness via the DevTools protocol (Node built-in WebSocket; no puppeteer).
 * Usage: node src/web/tools/shoot.js <baseUrl> <outDir> [plan.json]
 * Takes screenshots, collects console errors/exceptions, checks layout width.
 * Default plan = the screenshots used in the summary page. Exit code 1 on console errors
 * or horizontal overflow. */
"use strict";
var child = require("child_process");
var fs = require("fs");
var path = require("path");
var os = require("os");

var base = process.argv[2] || "http://127.0.0.1:8765/";
var outDir = path.resolve(process.argv[3] || path.join(__dirname, "..", "screenshots"));
var planFile = process.argv[4];
var CHROME = process.env.CHROME || "/usr/bin/google-chrome";
var PORT = 9300 + Math.floor(Math.random() * 400);

var PHONE = { width: 360, height: 780, deviceScaleFactor: 3, mobile: true };
var DESK = { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false };
var ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

var DEFAULT_PLAN = [
  { name: "phone-pick", dev: PHONE, hash: "#pick", js: "document.getElementById('genBtn').click()", wait: 2600, scrollTo: 0 },
  { name: "phone-pick-slip", dev: PHONE, hash: "#pick", js: "document.getElementById('genBtn').click()", wait: 2600, scrollSel: "#slipPanel" },
  { name: "phone-pick-full", dev: PHONE, hash: "#pick", js: "document.querySelector('#modeSeg [data-v=mixed]').click();document.getElementById('genBtn').click()", wait: 2600, full: true },
  { name: "phone-encode", dev: PHONE, hash: "#encode", js: "[7,19,33,48,62].forEach(function(n){document.querySelectorAll('#gridW .num')[n-1].click()});document.querySelectorAll('#gridMB .num')[10].click()", wait: 1500 },
  { name: "phone-encode-full", dev: PHONE, hash: "#encode", js: "[7,19,33,48,62].forEach(function(n){document.querySelectorAll('#gridW .num')[n-1].click()});document.querySelectorAll('#gridMB .num')[10].click()", wait: 1500, full: true },
  { name: "phone-decode", dev: PHONE, hash: "#decode", js: "document.getElementById('decInput').value='200000000';document.getElementById('decForm').requestSubmit()", wait: 1500 },
  { name: "phone-guess", dev: PHONE, hash: "#guess", wait: 2200 },
  { name: "phone-guess-full", dev: PHONE, hash: "#guess", wait: 2200, full: true },
  { name: "phone-stats", dev: PHONE, hash: "#stats", wait: 1200 },
  { name: "phone-stats-full", dev: PHONE, hash: "#stats", wait: 1400, full: true },
  { name: "phone-log", dev: PHONE, hash: "#pick", js: "document.getElementById('genBtn').click();setTimeout(function(){document.querySelector('#modeSeg [data-v=hot]').click();document.getElementById('genBtn').click();location.hash='#log'},300)", wait: 1500 },
  { name: "phone-install-sheet", dev: PHONE, hash: "#pick", js: "var b=document.getElementById('installBtn');b.hidden=false;b.click()", wait: 600 },
  { name: "desktop-pick", dev: DESK, hash: "#pick", js: "document.getElementById('genBtn').click()", wait: 2600 },
  { name: "desktop-stats", dev: DESK, hash: "#stats", wait: 1400, full: true },
  { name: "desktop-encode", dev: DESK, hash: "#encode", js: "[10,18,40,42,49].forEach(function(n){document.querySelectorAll('#gridW .num')[n-1].click()});document.querySelectorAll('#gridMB .num')[11].click()", wait: 1500 }
];

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function main() {
  var plan = planFile ? JSON.parse(fs.readFileSync(planFile, "utf8")) : DEFAULT_PLAN;
  fs.mkdirSync(outDir, { recursive: true });
  var prof = fs.mkdtempSync(path.join(process.env.MI_PROFILE_ROOT || os.tmpdir(), "mi-chrome-"));
  var proc = child.spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + prof,
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--disable-gpu", "about:blank"],
    { stdio: process.env.CHROME_LOG ? "inherit" : "ignore" });
  var targets = null;
  for (var i = 0; i < 200 && !(targets && targets.some(function (t) { return t.type === "page"; })); i++) {
    await sleep(150);
    try { targets = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json(); } catch (e) { targets = null; if (i % 40 === 39) console.error("waiting for chrome:", e.cause ? e.cause.code : e.message); }
  }
  var page = targets.find(function (t) { return t.type === "page"; });
  var ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(function (r) { ws.onopen = r; });
  var id = 0, pending = {}, problems = [], logs = [];
  ws.onmessage = function (m) {
    var msg = JSON.parse(m.data);
    if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; return; }
    if (msg.method === "Runtime.exceptionThrown") problems.push("EXCEPTION " + JSON.stringify(msg.params.exceptionDetails.exception ? msg.params.exceptionDetails.exception.description : msg.params.exceptionDetails.text));
    if (msg.method === "Runtime.consoleAPICalled") {
      var txt = msg.params.args.map(function (a) { return a.value !== undefined ? a.value : a.description; }).join(" ");
      logs.push(msg.params.type + ": " + txt);
      if (msg.params.type === "error" || msg.params.type === "warning") problems.push("CONSOLE " + msg.params.type + ": " + txt);
    }
    if (msg.method === "Log.entryAdded") {
      var e = msg.params.entry;
      logs.push("log." + e.level + ": " + e.text + (e.url ? " (" + e.url + ")" : ""));
      if (e.level === "error" || e.level === "warning") problems.push("LOG " + e.level + ": " + e.text + (e.url ? " (" + e.url + ")" : ""));
    }
  };
  function send(method, params) {
    return new Promise(function (res, rej) {
      var mid = ++id;
      pending[mid] = function (msg) { msg.error ? rej(new Error(method + ": " + JSON.stringify(msg.error))) : res(msg.result); };
      ws.send(JSON.stringify({ id: mid, method: method, params: params || {} }));
    });
  }
  async function evaluate(expr) {
    var r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result.value;
  }
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
  var report = [];
  for (var s of plan) {
    var dev = s.dev || PHONE;
    await send("Emulation.setDeviceMetricsOverride", dev);
    await send("Emulation.setTouchEmulationEnabled", { enabled: !!dev.mobile });
    await send("Emulation.setUserAgentOverride", { userAgent: dev.mobile ? ANDROID_UA : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" });
    if (s.reducedMotion) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    else await send("Emulation.setEmulatedMedia", { features: [] });
    if (s.offline !== undefined) await send("Network.enable"), await send("Network.emulateNetworkConditions", { offline: !!s.offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    if (s.shell) child.execSync(s.shell, { stdio: "inherit" });
    var url = (s.url || base) + (s.hash || "");
    await send("Page.navigate", { url: "about:blank" });
    await sleep(100);
    await send("Page.navigate", { url: url });
    await sleep(s.loadWait || 900);
    if (s.js) await evaluate(s.js);
    await sleep(s.wait || 800);
    if (s.scrollSel) await evaluate("window.scrollTo(0, document.querySelector(" + JSON.stringify(s.scrollSel) + ").getBoundingClientRect().top + scrollY - 70)");
    else if (s.scrollTo !== undefined) await evaluate("window.scrollTo(0," + s.scrollTo + ")");
    await sleep(250);
    var m = await evaluate("JSON.stringify({iw: innerWidth, sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, h: document.documentElement.scrollHeight, ctl: !!(navigator.serviceWorker && navigator.serviceWorker.controller), title: document.title, wide: Array.from(document.querySelectorAll('body *')).filter(function(e){var r=e.getBoundingClientRect();return r.width>0 && (r.right>" + dev.width + ".5) && !e.closest('.ticker');}).slice(0,5).map(function(e){return e.tagName+'.'+e.className+' '+Math.round(e.getBoundingClientRect().right)})})");
    m = JSON.parse(m);
    var shotParams = { format: "png" };
    if (s.full) {
      shotParams.captureBeyondViewport = true;
      shotParams.clip = { x: 0, y: 0, width: dev.width, height: m.h, scale: 1 };
      await evaluate("window.scrollTo(0,0);var x=document.createElement('style');x.textContent='.tabbar,.toast{display:none!important}.top{position:relative!important}';document.head.appendChild(x)");
    }
    if (s.extraEval) m.extra = await evaluate(s.extraEval);
    if (s.cdp) { try { m.cdp = await send(s.cdp); } catch (e) { m.cdp = String(e.message); } }
    if (s.full) { await sleep(200); m.h = await evaluate("document.documentElement.scrollHeight"); shotParams.clip.height = m.h; }
    if (!s.noShot) {
      var shot = await send("Page.captureScreenshot", shotParams);
      fs.writeFileSync(path.join(outDir, s.name + ".png"), Buffer.from(shot.data, "base64"));
    }
    var overflow = m.iw > dev.width || m.sw > dev.width || m.bw > dev.width;
    report.push(s.name + ": innerWidth=" + m.iw + " scrollWidth=" + m.sw + " height=" + m.h + " swControlled=" + m.ctl +
      (overflow ? " OVERFLOW" : "") + (m.wide.length ? " wide=" + JSON.stringify(m.wide) : "") + (m.extra !== undefined ? " extra=" + JSON.stringify(m.extra) : "") + (m.cdp !== undefined ? " cdp=" + JSON.stringify(m.cdp) : ""));
    if (overflow) problems.push("overflow in " + s.name);
  }
  ws.close();
  proc.kill("SIGKILL");
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  console.log(report.join("\n"));
  if (process.env.SHOW_LOGS) console.log("--- logs\n" + logs.join("\n"));
  console.log(problems.length ? "--- PROBLEMS\n" + problems.join("\n") : "--- no console errors/warnings, no overflow");
  process.exit(problems.length ? 1 : 0);
}
main().catch(function (e) { console.error(e); process.exit(2); });
