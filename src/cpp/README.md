# mega-index (C++17)

Mega Millions / Powerball ticket <-> index encoder/decoder, CSPRNG picker, and hot/cold stats.
Contract: `../../SPEC.md`. No third-party dependencies; Linux (uses `getrandom(2)`).

## Build

```sh
# CMake (binary: src/cpp/build/mega-index)
cmake -S . -B build && cmake --build build

# or plain make (same output path)
make
```

## Test

```sh
make test                          # builds and runs build/mega-index-tests
# or: cmake -S . -B build && cmake --build build && ctest --test-dir build --output-on-failure
# golden conformance, from the repo root:
tests/check_golden.sh src/cpp/build/mega-index
```

## Usage

```
mega-index encode <w1> <w2> <w3> <w4> <w5> --bonus N [--game megamillions|powerball]
mega-index decode <index> [--game G]
mega-index pick [-n 1..5] [--mode uniform|hot|cold|mixed] [--game G] [--export FILE.csv|FILE.json] [--data PATH]
mega-index stats [--data PATH] [--game G]
mega-index guess [--data PATH] [--game G]
```

Each game has its own history file and environment variable:

| game | file | env var |
|---|---|---|
| `megamillions` (default) | `data/draws.csv` | `MEGA_INDEX_DATA` |
| `powerball` | `data/powerball-draws.csv` | `POWER_INDEX_DATA` |

The data file is found via `--data`, then the game's env var, then walking up from the current
directory, then walking up from the executable's directory (`/proc/self/exe`). Each game reads only
its own variable. All commands work for both games, including `stats`, `guess` and the
hot/cold/mixed pick modes:

```
mega-index stats --game powerball
mega-index guess --game powerball --data tests/golden/powerball-draws.csv
POWER_INDEX_DATA=data/powerball-draws.csv mega-index pick --game powerball --mode hot -n 3
```

A Mega Millions file passed with `--game powerball` (or the reverse) fails with
`bad data file: line <n>`.

## Layout

- `include/mega_index/*.hpp`, `src/*.cpp`: game presets, combinadic codec (`uint64_t`), CSPRNG
  (`rng`), data loader, integer-only stats, picks, export, CLI (`run()`), `main.cpp`.
- `tests/test_main.cpp`: test executable (vectors, endpoints, 150k round trips per game, picks,
  export, errors, data discovery).

## Honest note

Every ticket has the same chance (1 in 290,472,336 for Mega Millions). Hot/cold weighting is for
fun and cannot predict draws; uniform is the default and the only fair-odds-neutral mode that
matters. Randomness is the OS CSPRNG only (`getrandom`, `/dev/urandom` fallback), never
`std::random_device` or a seeded PRNG.
