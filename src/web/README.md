# MEGA//INDEX (web / PWA)

A static, installable Mega Millions picker and ticket-to-index codec. It has no backend and no external fonts, CDNs or libraries, and it works from `file://` as well as over HTTPS.

## Run

- **Local file:** open `index.html` in a browser. Everything works except installing and offline caching.
- **Local server:** `python3 -m http.server 8000` from this folder, then open http://localhost:8000/.
- **Phone:** open the GitHub Pages URL, then tap the in-app **INSTALL** button. If the browser doesn't offer the prompt, use the menu instead: Chrome is ⋮ → Install app; Samsung Internet is ≡ → Add page to → Home screen.

## Features

| Tab | What it does |
|---|---|
| PICK | Builds a slip of 1-5 plays (A-E) in one of four modes: uniform (the default), hot, cold or mixed. You can re-roll a single play, copy the slip, export it as CSV or JSON, share it, or clear it. |
| CODEC | ENCODE turns a 5+1 selection from tap grids into its index. DECODE turns an index back into a ticket and shows the combinadic steps. |
| GUESS | Shows the deterministic HOT, COLD and BALANCED tickets (SPEC section 7). |
| STATS | Charts frequency versus expected, a heatmap and draws since each number was last seen (tap or scrub for detail). Also shows the chi-square fairness check and the rankings. |
| LOG | Keeps the slips you generated in localStorage, on this device only. |

All randomness comes from `crypto.getRandomValues` with rejection sampling, so there is no modulo bias. `Math.random` is never used.

## Files

- `js/core.js` holds the pure logic (games, encode/decode, randbelow, stats, pick modes, guess, export). It sets `window.MegaIndex` and also loads in Node through `module.exports`.
- `js/charts.js` draws the inline SVG charts. `js/app.js` is the UI.
- `js/draws-data.js` is **generated** by `tools/refresh_data.py`. Do not edit it by hand.
- `sw.js` is the offline-first service worker. Its cache name is `mega-index-<APP_VERSION>-<MM_DRAWS_UPDATED>-<count>`, and it pulls the data stamp in with `importScripts`. A data refresh therefore triggers a service worker update and a fresh precache on installed phones, with no change to `sw.js` needed. **Bump `APP_VERSION` whenever you change any other app file.**
- `manifest.webmanifest` and `icons/` (regenerate the icons with `python3 tools/make_icons.py`).

## Test

```
node src/web/tests/test-core.js   # vectors, endpoints, 140k round trips, golden stats/guess, export format
node src/web/tests/test-pwa.js    # precache files exist, manifest, icon sizes, relative URLs
node src/web/tools/shoot.js http://127.0.0.1:8000/ /tmp/shots   # headless Chrome: screenshots, console errors, overflow
```

## Honest note

Fair picks do not improve your odds. Every ticket is 1 in 290,472,336. Hot/cold is for fun and cannot predict draws, and uniform is the default mode.
