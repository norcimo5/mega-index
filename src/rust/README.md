# mega-index (Rust)

Mega Millions / Powerball ticket <-> index encoder/decoder, OS-CSPRNG picker, and hot/cold stats.
Implements `SPEC.md` at the repo root; output is byte-identical to the oracle (`tools/reference.py`).

## Build

```
cd src/rust
cargo build --release        # binary: target/release/mega-index
```

Only dependency: `getrandom` (0.2). If randomness from `getrandom` fails, it falls back to `/dev/urandom`.

## Use

```
mega-index encode 7 19 33 48 62 --bonus 11
mega-index decode 147183154
mega-index pick -n 3 [--mode uniform|hot|cold|mixed] [--export picks.csv|picks.json] [--data PATH]
mega-index stats [--data PATH]
mega-index guess [--data PATH]
mega-index --game powerball decode 0     # powerball: encode/decode/uniform pick only
```

History data is `data/draws.csv`, found via `--data`, then `$MEGA_INDEX_DATA`, then walking up
from the current directory, then from the executable's directory.

## Test

```
cargo test                                           # unit + integration (100k+ round trips per game)
cargo clippy --all-targets
tests/check_golden.sh src/rust/target/release/mega-index   # from repo root: 0 failed
```

Layout: `src/lib.rs` (modules `game`, `codec`, `rng`, `stats`, `picks`, `export`, `data`, `cli`),
thin `src/main.rs`, tests in `tests/lib_tests.rs`. Argument parsing and JSON/CSV output are hand-rolled
to match SPEC byte-for-byte.

## Honest note

Fair picks do not improve your odds: every Mega Millions ticket is 1 in 290,472,336 (Powerball
1 in 292,201,338). Hot/cold modes are weighted for fun only and cannot predict draws; uniform
is the default and the only mode that is a uniform draw over all tickets.
