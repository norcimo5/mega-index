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
python3 src/python3/mega_index.py stats --game powerball
python3 src/python3/mega_index.py guess --game powerball --data data/powerball-draws.csv
python3 src/python3/mega_index.py pick -n 3 --mode hot --game powerball
POWER_INDEX_DATA=data/powerball-draws.csv python3 src/python3/mega_index.py pick --mode cold --game powerball
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

Both games support every command. Powerball tickets print with the `PB` label, e.g. `07 19 33 48 62 PB 11`;
`stats --game powerball` and `guess --game powerball` use the Powerball history.

### Data file

`stats`, `guess` and weighted picks (`hot`, `cold`, `mixed`) read the selected game's own draw file:
`data/draws.csv` (Mega Millions) or `data/powerball-draws.csv` (Powerball). The file is located by:
`--data PATH`, then the game's env var (`MEGA_INDEX_DATA` for Mega Millions, `POWER_INDEX_DATA` for
Powerball; each game reads only its own), then walking up from the current directory, then walking up
from the script's directory. If nothing is found: `error: data file not found (use --data or
POWER_INDEX_DATA)` (or `MEGA_INDEX_DATA`), exit 1. The file is validated for the selected game, so a
Mega Millions file passed with `--game powerball` fails with `bad data file: line <n>`.

## Test

```bash
python3 -m unittest discover -s src/python3/tests          # from repo root
tests/check_golden.sh python3 src/python3/mega_index.py    # golden conformance, from repo root
```

## Honest note

Fair (uniform) picks do not improve your odds: every ticket is 1 in 290,472,336 (Mega Millions) or
1 in 292,201,338 (Powerball). Hot/cold modes are weighted and non-uniform, for fun only, and cannot
predict draws. The index is just a ticket's position in colex order; it carries no luck.
