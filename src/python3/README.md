# mega-index (Python 3)

Mega Millions / Powerball ticket <-> index encoder/decoder, CSPRNG ticket picker, and hot/cold
statistics. Python 3 standard library only (RNG: `secrets`). Contract: `/SPEC.md` at the repo root.

Layout: `mega_index.py` (entry point) and the `megaindex/` package (`game`, `core`, `rng`,
`stats`, `picks`, `export`, `cli`).

## Run

```bash
python3 src/python3/mega_index.py encode 7 19 33 48 62 --bonus 11
python3 src/python3/mega_index.py decode 147183154
python3 src/python3/mega_index.py decode 292201337 --game powerball
python3 src/python3/mega_index.py pick -n 3
python3 src/python3/mega_index.py pick -n 5 --mode mixed --export picks.csv
python3 src/python3/mega_index.py stats
python3 src/python3/mega_index.py guess --data data/draws.csv
```

Example:

```
$ mega_index.py encode 7 19 33 48 62 --bonus 11
game: Mega Millions
ticket: 07 19 33 48 62 MB 11
index: 147183154
```

Commands: `encode`, `decode`, `pick [-n 1..5] [--mode uniform|hot|cold|mixed] [--export F.csv|F.json]`,
`stats`, `guess`; `--game megamillions|powerball`; `--help`. Exit codes: 0 ok, 2 usage error,
1 data/IO error; errors go to stderr as `error: <message>`.

Powerball supports `encode`, `decode`, and `pick --mode uniform` only (no draw history).

### Data file

`stats`, `guess` and weighted picks read `data/draws.csv`, located by: `--data PATH`, then env
`MEGA_INDEX_DATA`, then walking up from the current directory, then walking up from the script's
directory.

## Test

```bash
python3 -m unittest discover -s src/python3/tests          # from repo root
tests/check_golden.sh python3 src/python3/mega_index.py    # golden conformance, from repo root
```

## Honest note

Fair (uniform) picks do not improve your odds: every ticket is 1 in 290,472,336 (Mega Millions) or
1 in 292,201,338 (Powerball). Hot/cold modes are weighted and non-uniform, for fun only, and cannot
predict draws. The index is just a ticket's position in colex order; it carries no luck.
