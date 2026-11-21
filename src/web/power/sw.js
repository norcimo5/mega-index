/* POWER//INDEX service worker: offline-first precache, scope /power/ (registered as ./sw.js).
 * Same scheme as MEGA//INDEX's ../sw.js. The cache name combines APP_VERSION with the draw-data stamp
 * from ./js/draws-data.js (pulled in with importScripts), so a scheduled data refresh installs a new
 * worker and a fresh precache by itself.
 * Bump APP_VERSION whenever any file in PRECACHE changes, INCLUDING the shared ../js and ../css files
 * (a change there needs both this APP_VERSION and MEGA's ../sw.js APP_VERSION bumped).
 * Only "power-index-" caches are ever deleted here, so MEGA's caches on the same origin are untouched. */
var APP_VERSION = "v2";
self.window = self; /* draws-data.js assigns window.PB_DRAWS / window.PB_DRAWS_UPDATED */
try { importScripts("./js/draws-data.js"); } catch (e) { /* keep working without the stamp */ }
var DATA_STAMP = String(self.PB_DRAWS_UPDATED || "nodata") + "-" + ((self.PB_DRAWS && self.PB_DRAWS.length) || 0);
var CACHE = "power-index-" + APP_VERSION + "-" + DATA_STAMP;

var PRECACHE = [
  "./",
  "./index.html",
  "./css/power.css",
  "../css/app.css",
  "../js/core.js",
  "../js/charts.js",
  "../js/app.js",
  "./js/draws-data.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon.ico"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE.map(function (u) { return new Request(u, { cache: "reload" }); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf("power-index-") === 0 && k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
          return res;
        }).catch(function () {
          if (req.mode === "navigate") return cache.match("./index.html");
          return Response.error();
        });
      });
    })
  );
});
