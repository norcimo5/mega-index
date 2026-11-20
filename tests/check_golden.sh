#!/usr/bin/env bash
# Run a mega-index CLI against tests/golden/ and report PASS/FAIL per file.
# Usage (from anywhere): tests/check_golden.sh <cli command...>
#   tests/check_golden.sh python3 tools/reference.py
#   tests/check_golden.sh python3 src/python3/mega_index.py
#   tests/check_golden.sh src/rust/target/release/mega-index
#   tests/check_golden.sh src/cpp/build/mega-index
# Commands run with cwd = repo root. Exit 0 only if everything passes.
set -u
if [ $# -eq 0 ]; then echo "usage: $0 <cli command...>" >&2; exit 2; fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
G="$ROOT/tests/golden"
cd "$ROOT" || exit 2
CLI=("$@")
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok()  { echo "PASS $1"; pass=$((pass+1)); }
bad() { echo "FAIL $1${2:+  ($2)}"; fail=$((fail+1)); }

# 1. exact-output cases
while IFS=$'\t' read -r name code args; do
  case "$name" in ''|'#'*) continue;; esac
  read -r -a argv <<< "$args"
  "${CLI[@]}" "${argv[@]}" > "$TMP/out" 2> "$TMP/err" < /dev/null
  rc=$?
  why=""
  [ "$rc" = "$code" ] || why="exit $rc, want $code"
  cmp -s "$TMP/out" "$G/$name.txt" || why="${why:+$why; }stdout differs"
  if [ -f "$G/$name.err" ]; then cmp -s "$TMP/err" "$G/$name.err" || why="${why:+$why; }stderr differs"; fi
  if [ -z "$why" ]; then ok "$name.txt"; else bad "$name.txt" "$why"
    diff "$G/$name.txt" "$TMP/out" | head -5; fi
done < "$G/cases.tsv"

# 1b. data path via env var (no --data)
MEGA_INDEX_DATA=tests/golden/draws.csv "${CLI[@]}" guess > "$TMP/out" 2>/dev/null < /dev/null
if cmp -s "$TMP/out" "$G/guess.txt"; then ok "env:MEGA_INDEX_DATA"; else bad "env:MEGA_INDEX_DATA" "guess via env differs"; fi

# 2. vectors: encode and decode every line
vf=0
while read -r game w1 w2 w3 w4 w5 b idx; do
  case "$game" in ''|'#'*) continue;; esac
  e="$("${CLI[@]}" encode "$w1" "$w2" "$w3" "$w4" "$w5" --bonus "$b" --game "$game" 2>/dev/null | sed -n 's/^index: //p')"
  d="$("${CLI[@]}" decode "$idx" --game "$game" 2>/dev/null | sed -n 's/^ticket: //p')"
  want="$(printf '%02d %02d %02d %02d %02d' "$((10#$w1))" "$((10#$w2))" "$((10#$w3))" "$((10#$w4))" "$((10#$w5))")"
  if [ "$e" != "$idx" ] || [ "${d% * *}" != "$want" ] || [ "$((10#${d##* }))" != "$b" ]; then
    echo "  vector mismatch: $game $w1 $w2 $w3 $w4 $w5 $b $idx -> encode=[$e] decode=[$d]"; vf=$((vf+1))
  fi
done < "$G/vectors.txt"
if [ $vf -eq 0 ]; then ok "vectors.txt"; else bad "vectors.txt" "$vf mismatches"; fi

# 3. pick format smoke tests (random values, so check shape + index consistency)
pick_check() {  # label, game, args...
  local label="$1" game="$2"; shift 2
  "${CLI[@]}" pick "$@" > "$TMP/pick" 2> "$TMP/perr"; local rc=$?
  local why=""
  [ $rc -eq 0 ] || why="exit $rc"
  local n; n="$(grep -c '^[A-E]: ' "$TMP/pick")"
  head -1 "$TMP/pick" | grep -Eq '^(MEGA MILLIONS|POWERBALL) PICK  mode=(uniform|hot|cold|mixed)  plays=[1-5]$' || why="${why:+$why; }bad header"
  grep -q '^NOTE: Fair picks do not improve your odds' "$TMP/pick" || why="${why:+$why; }missing note"
  while read -r line; do
    echo "$line" | grep -Eq '^[A-E]: [0-9]{2} [0-9]{2} [0-9]{2} [0-9]{2} [0-9]{2} (MB|PB) [0-9]{2}  index [0-9]+$' || { why="${why:+$why; }bad line '$line'"; continue; }
    read -r _ a b c d e _ m _ i <<< "$line"
    local got; got="$("${CLI[@]}" encode "$a" "$b" "$c" "$d" "$e" --bonus "$m" --game "$game" | sed -n 's/^index: //p')"
    [ "$got" = "$i" ] || why="${why:+$why; }index mismatch '$line'"
  done < <(grep '^[A-E]: ' "$TMP/pick")
  echo "$*" | grep -q -- '-n 5' && [ "$n" != 5 ] && why="${why:+$why; }want 5 plays, got $n"
  if [ -z "$why" ]; then ok "pick:$label"; else bad "pick:$label" "$why"; fi
}
pick_check uniform megamillions -n 5
pick_check uniform-pb powerball -n 5 --game powerball
for m in hot cold mixed; do pick_check "$m" megamillions -n 5 --mode "$m" --data tests/golden/draws.csv; done

# 4. export
for ext in csv json; do
  f="$TMP/picks.$ext"
  "${CLI[@]}" pick -n 3 --export "$f" > /dev/null 2>&1
  why=""
  if [ ! -s "$f" ]; then why="no file"
  elif [ "$ext" = csv ]; then
    [ "$(head -1 "$f")" = "play,mode,w1,w2,w3,w4,w5,bonus,index,game,generated_at" ] || why="bad header"
    [ "$(wc -l < "$f")" -eq 4 ] || why="${why:+$why; }want 3 rows"
    grep -Eq '^A,uniform,([0-9]+,){7}megamillions,[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' "$f" || why="${why:+$why; }bad row"
  else
    [ "$(head -1 "$f")" = "[" ] && [ "$(tail -1 "$f")" = "]" ] || why="bad brackets"
    grep -Eq '^  \{"play": "A", "mode": "uniform", "w1": [0-9]+, "w2": [0-9]+, "w3": [0-9]+, "w4": [0-9]+, "w5": [0-9]+, "bonus": [0-9]+, "index": [0-9]+, "game": "megamillions", "generated_at": "[0-9T:Z-]+"\},$' "$f" || why="${why:+$why; }bad object"
  fi
  if [ -z "$why" ]; then ok "export.$ext"; else bad "export.$ext" "$why"; fi
done

echo "----"
echo "TOTAL: $pass passed, $fail failed"
[ $fail -eq 0 ]
