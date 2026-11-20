# PROMPT: Mega Millions Index Picker

## Background

`docs/Lotto-Index-Protocol-Guide-Light.pdf` (summarized in `docs/Lotto-Index-Protocol.md`) explains how to turn a lottery ticket into a single numerical index and back again, a bijection built on the combinatorial number system. It includes a reference encoder/decoder in Python. The PDF came out of an earlier session so Manuel could understand the method personally. This is a pet project he no longer has time to build himself.

## Request

Fill the `src/` folder with **several versions** of a lottery index encoder/decoder, plus a **web page**, based on the PDF's method and sample code. The target subfolders already exist:

| Folder | Version |
|---|---|
| `src/python3/` | Python 3 |
| `src/rust/` | Rust |
| `src/cpp/` | C++ |
| `src/web/` | Web page (HTML/CSS/JS) |

### Core functionality (every version)

1. **Encode:** ticket numbers → numerical index.
2. **Decode:** numerical index → ticket numbers.
3. **Random pick:** generate a well-distributed random index with the **best-distributed random number algorithm available**, then decode it into a playable ticket.

### Game support

- **Primary target: Mega Millions.** 5 white balls from 1–70, plus a Mega Ball from 1–24. That gives 290,472,336 combinations, so indexes run from 0 to 290,472,335.
- Support playing a **full Mega Millions slip of up to 5 plays** (5 tickets max per run).
- **Theme:** Mega Millions look and feel, especially for the web page.
- **Future direction:** a universal lottery picker that handles other games such as Powerball (5 of 1–69 + Powerball 1–26). Design the game parameters (white-ball count and range, bonus-ball range) so they can be swapped later without rewriting the core.

### Randomness requirement

- Use the highest-quality, best-distributed random source available on each platform, preferably the OS cryptographic RNG (e.g. Python `secrets`, Web Crypto `crypto.getRandomValues`).
- Draw the index **uniformly** over the whole range with no modulo bias (rejection sampling or an equivalent `randbelow`). Decoding a uniform index then gives a uniform ticket.
- Keep the PDF's honest note in the output: this makes picks fair and pattern-free but does **not** improve the odds of winning.

### Correctness

- Round-trip tests: encode(decode(i)) == i and decode(encode(t)) == t, on random samples and both endpoints.
- Known vectors from the PDF:
  - `7·19·33·48·62 MB 11 ↔ 147,183,154`
  - `8·24·37·38·66 MB 9 ↔ 200,000,000`
  - `1-2-3-4-5 MB 1 ↔ 0`
  - `66-67-68-69-70 MB 24 ↔ 290,472,335`

## Decisions (confirmed by Manuel)

- **Versions:** python3, rust, cpp, web, matching the `src/` subfolders.
- **Plays:** up to **5 plays (A–E) per slip**, each with 5 white balls + 1 Mega Ball.
- **Web page:** a **static** site (no backend), opened locally or installed as a PWA from GitHub Pages.
- **Extras:** **exporting picks: yes.**

### The mega-gotcha: historical statistics

- **Download as much Mega Millions draw history as possible** since the current matrix took effect: 5 white balls from 1–70 + Mega Ball 1–24. That change started with the **April 8, 2025** draw. Earlier draws used Mega Ball 1–25 and don't match this matrix.
  - Candidate source: NY State Open Data, "Lottery Mega Millions Winning Numbers: Beginning 2002" (data.ny.gov), which can be downloaded as CSV. Filter to draws on or after 2025-04-08.
- **Run statistics** on that history:
  - per-number frequency for white balls (1–70) and Mega Balls (1–24), compared with what uniform chance would predict
  - "hot" (most-drawn) and "cold" (least-drawn / most overdue) numbers, including how long since each number last appeared
- **Produce a "guess"** using **both frequency (hot) and non-frequency (cold/overdue)** picks.
- Each guessed ticket still goes through the encoder, so it has an index too.

- **Graph it on the web version:** charts of white-ball and Mega Ball frequencies against the uniform expectation, with hot and cold numbers highlighted and how long since each number last appeared, so Manuel can see the stats visually.

**Honest note (must appear alongside the guess):** every draw is independent and every ticket is equally likely, 1 in 290,472,336. Hot/cold analysis is for fun and can't predict results. Weighted picks also aren't uniform, so the plain uniform-random mode from the PDF should remain the default.

**Also note:** the April 2025 change removed the optional Megaplier (a built-in multiplier replaced it), so the Megaplier extra mentioned earlier doesn't apply.

### Installable phone web app (PWA)

- The web version must be an **installable Progressive Web App** for Manuel's **Android phone (Samsung Galaxy S24)**:
  - **Mobile-first, phone-friendly layout.** The S24's screen is 1080×2340 at about 3× density, so the CSS viewport is roughly **360×780 px** portrait. Touch-sized controls, no horizontal scroll, and it should still work on desktop.
  - A web app manifest (name, icons at 192/512 including maskable, `display: standalone`, theme colour) plus a **service worker** for offline use, so Chrome or Samsung Internet offers **"Install app" / "Add to Home screen"**.
  - Add a visible **Install button** in the app, using the `beforeinstallprompt` event, with instructions as a fallback if the browser doesn't fire it.
- **Look and feel:** **cyberpunk / badass sci-fi in LIGHT MODE** with a **white background**. Think neon accents, HUD panels, glitch/scanline touches, monospace readouts, built for the phone. Blend in Mega Millions cues (gold Mega Ball, blue/gold palette) to keep the Mega Millions theme.
- **Hosting:** commit everything to **GitHub** and serve the web app over HTTPS with **GitHub Pages**, since installing a PWA requires HTTPS. Give Manuel the **GitHub Pages URL** to open on his phone and install from, plus the repo URL.
  - The web app still works as a static local page too. GitHub Pages is just static hosting.
  - `gh` is authenticated as `norcimo5`, and the repo has no git remote yet.

## Final answers (confirmed by Manuel)

- **GitHub repo:** **public**, named **`mega-index`** (account `norcimo5`). Manuel approved pushing to GitHub and enabling GitHub Pages.
- **Hot/cold/mixed pick modes:** **built into all four versions** (python3, rust, cpp, web), not just the web stats.
- **Updating the data:** builder's choice ("do your best"). Recommended approach: ship a bundled snapshot plus a refresh script that re-downloads the NY Open Data CSV, filters to draws from 2025-04-08 onward, and regenerates the data files each version reads.

## Data already downloaded

- Raw CSV: `data/mega-millions-ny-opendata-raw.csv`, the full NY Open Data history since 2002, downloaded 2026-11-20.
  - Source URL: `https://data.ny.gov/api/views/5xaw-6ayf/rows.csv?accessType=DOWNLOAD`
  - Columns: `Draw Date` (MM/DD/YYYY), `Winning Numbers` (5 space-separated), `Mega Ball`, `Multiplier`. Rows are **not** sorted by date.
- Filtered to the current matrix (2025-04-08 onward): **169 draws**, 2025-04-08 → 2026-11-17, Tue/Fri, no missing draws. White balls fall in 1–70 and Mega Balls in 1–24.

## Toolchains available

Python 3.14, cargo/rustc 1.99, g++ 15 / clang++, cmake, node 26. `gh` is authenticated as `norcimo5`.

## Orchestration

Build using the **Director pattern**: `.claude/settings.json` sets `"agent": "director"`, and `.claude/agents/` defines director, scout, builder, and architect. The Director delegates the build to workers and tracks the work in `bd`.

## Status

**Ready to build** once Manuel says go in the Director session.
