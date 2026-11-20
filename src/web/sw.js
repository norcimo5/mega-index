/* MEGA//INDEX service worker: offline-first precache.
 * The cache name combines APP_VERSION (bump on any app-file change) with the draw-data stamp
 * from js/draws-data.js. That file is pulled in with importScripts, so when the scheduled data
 * refresh rewrites it, the browser's SW update check sees a changed import, installs this worker
 * again under a new cache name, and old caches are deleted on activate. */
var APP_VERSION = "v1";
self.window = self; /* draws-data.js assigns window.MM_DRAWS / window.MM_DRAWS_UPDATED */
try { importScripts("./js/draws-data.js"); } catch (e) { /* keep working without the stamp */ }
var DATA_STAMP = String(self.MM_DRAWS_UPDATED || "nodata") + "-" + ((self.MM_DRAWS && self.MM_DRAWS.length) || 0);
var CACHE = "mega-index-" + APP_VERSION + "-" + DATA_STAMP;

var PRECACHE = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/core.js",
  "./js/charts.js",
  "./js/app.js",
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
      /* cache: "reload" bypasses the HTTP cache so a new version never precaches stale files */
      return cache.addAll(PRECACHE.map(function (u) { return new Request(u, { cache: "reload" }); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf("mega-index-") === 0 && k !== CACHE) return caches.delete(k);
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
