# MEGA//INDEX

**Every Mega Millions ticket has an address.** This project maps each possible ticket
(5 white balls from 1-70 plus a Mega Ball from 1-24) to a single whole number, its *index*,
and back again. Pick an index uniformly at random with a cryptographic RNG, decode it, and
you get a perfectly fair, pattern-free ticket.

- **Bijection:** ticket <-> index, built on the combinatorial number system (combinadics).
- **CSPRNG picks:** uniform over the whole range, no modulo bias (rejection sampling).
- **Hot/cold stats:** frequency and "overdue" analysis of the current-matrix draws, strictly for fun.
- **Four implementations** that agree byte for byte: Python, Rust, C++, and an installable web app.

> **Honest note.** This makes picks fair and pattern-free. It does **not** improve your odds.
> Every ticket is equally likely: **1 in 290,472,336**. Hot/cold analysis cannot predict
> anything, and weighted picks are not uniform, so plain uniform random is the default.
> The same holds for Powerball (5 of 1-69 plus a Powerball 1-26): **1 in 292,201,338**.

## // LIVE APP

**https://norcimo5.github.io/mega-index/**

A static, offline-capable PWA (no backend). Light-mode cyberpunk HUD, built for phones.

### Install on Android (Chrome or Samsung Internet)

1. Open the link above on your phone.
2. Tap the in-app **Install** button. If it does not appear, use the browser menu
   (three dots, or the menu icon in Samsung Internet) and choose **Install app** or
   **Add to Home screen**.
3. Confirm. The app now launches full-screen from your home screen and works offline.

## // POWER//INDEX (POWERBALL)

The same engine also covers Powerball, with its own installable PWA that shares the code
and styling of the Mega Millions app.

**https://norcimo5.github.io/mega-index/power/**

Install on Android: open the link above in Chrome or Samsung Internet, tap the in-app
**Install** button (or browser menu, **Install app** / **Add to Home screen**), and confirm.
It is a separate app from MEGA//INDEX and works offline on its own.

- Powerball history since the current matrix began on **2015-10-07**: 1,435 draws
  (Double Play ignored). Stats summary: [`docs/POWERBALL-STATS.md`](docs/POWERBALL-STATS.md).
- CLI: add `--game powerball` to the Python, Rust or C++ CLI, e.g.
  `python3 src/python3/mega_index.py --game powerball pick`.
- Data file: `data/powerball-draws.csv`, or point `POWER_INDEX_DATA` (instead of
  `MEGA_INDEX_DATA`) at another copy, or pass `--data PATH`.

## // THE FOUR VERSIONS

| Version | Folder | Quick start |
|---|---|---|
| Python 3 (stdlib only) | [`src/python3`](src/python3/README.md) | `python3 src/python3/mega_index.py --help` |
| Rust | [`src/rust`](src/rust/README.md) | `cd src/rust && cargo build --release` |
| C++17 | [`src/cpp`](src/cpp/README.md) | `cmake -S src/cpp -B src/cpp/build && cmake --build src/cpp/build` |
| Web (PWA) | [`src/web`](src/web/) | open `src/web/index.html`, or serve the folder statically |

Each version supports **encode**, **decode**, and **random pick**, plus slips of up to
**5 plays (A-E)**. See each folder's README for the exact commands and flags, and
[`SPEC.md`](SPEC.md) for the shared CLI contract.

## // THE MATH IN BRIEF

1. Sort the five white balls ascending and shift to 0-69: `x_i = c_i - 1`.
2. White-ball rank: `N = C(x1,1) + C(x2,2) + C(x3,3) + C(x4,4) + C(x5,5)`.
3. Fold in the Mega Ball as a mixed-radix digit: `I = 24*N + (m - 1)`.

Example: `7 - 19 - 33 - 48 - 62`, Mega Ball `11`:

```
N = 6 + 153 + 4,960 + 178,365 + 5,949,147 = 6,132,631
I = 24 * 6,132,631 + 10 = 147,183,154
```

Decoding reverses it greedily: split `m = (I mod 24) + 1`, `N = floor(I / 24)`, then for
`i = 5..1` take the largest `x` with `C(x,i) <= N`. The index space is
`24 * C(70,5) = 290,472,336` tickets, indexes `0 ... 290,472,335`. Endpoints:
`1-2-3-4-5 MB 1 = 0` and `66-67-68-69-70 MB 24 = 290,472,335`.
Full write-up: [`docs/Lotto-Index-Protocol.md`](docs/Lotto-Index-Protocol.md).

## // DATA

Draw history comes from NY State Open Data,
[Lottery Mega Millions Winning Numbers: Beginning 2002](https://data.ny.gov/d/5xaw-6ayf),
filtered to draws on or after **2025-04-08** (the current 70/24 matrix).

- `data/draws.csv` is the canonical file read by every CLI.
- `src/web/js/draws-data.js` is the generated copy used by the web app (do not edit by hand).
- Refresh locally: `python3 tools/refresh_data.py` (use `--offline` to rebuild from the saved raw CSV).
- Powerball: [Lottery Powerball Winning Numbers: Beginning 2010](https://data.ny.gov/d/d6yy-54nr),
  filtered to draws on or after **2015-10-07**; canonical file `data/powerball-draws.csv`,
  web copy `src/web/power/js/draws-data.js`.
- `python3 tools/refresh_data.py --game megamillions|powerball|all` (default all).
- A GitHub Actions workflow refreshes both games the morning after each draw
  (Mon/Wed/Sat Powerball, Tue/Fri Mega Millions) and commits any change.
- Stats summaries: [`docs/STATS.md`](docs/STATS.md), [`docs/POWERBALL-STATS.md`](docs/POWERBALL-STATS.md).

## // REPO LAYOUT

```
src/python3/   Python CLI + unit tests
src/rust/      Rust crate (binary: mega-index)
src/cpp/       C++17 CLI (CMake + Makefile)
src/web/       static PWA (index.html; power/ is POWER//INDEX, css/, js/, icons/, sw.js, manifest)
data/          draws.csv and the raw NY Open Data download
tools/         reference oracle, golden generator, data refresh
tests/         golden vectors + conformance runner (check_golden.sh)
docs/          protocol guide (PDF + notes), stats
.github/       CI, Pages deploy, scheduled data refresh
SPEC.md        shared behavior spec
```

## // TESTS

```bash
# Python
python3 -m unittest discover -s src/python3/tests
tests/check_golden.sh python3 src/python3/mega_index.py

# Rust
(cd src/rust && cargo test && cargo build --release)
tests/check_golden.sh src/rust/target/release/mega-index

# C++
cmake -S src/cpp -B src/cpp/build && cmake --build src/cpp/build
ctest --test-dir src/cpp/build
tests/check_golden.sh src/cpp/build/mega-index

# Web
node src/web/tests/test-core.js

# Oracle
python3 -m unittest tests/test_reference.py
```

The golden runner checks every implementation against the same reference outputs, including
the known vectors above and round trips at both endpoints. CI runs all of this on every push.

## // DISCLAIMER

Hobby project for understanding combinatorics. Not affiliated with Mega Millions or any lottery.
Play responsibly: the expected value of a ticket does not change with how you pick it.
