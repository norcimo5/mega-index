#!/usr/bin/env python3
"""Regenerate tests/golden/ from tools/reference.py (the oracle).

Golden stats/guess use frozen fixtures, so refreshing data/ does not break golden tests:
  tests/golden/draws.csv            snapshot of data/draws.csv (Mega Millions)
  tests/golden/powerball-draws.csv  snapshot of data/powerball-draws.csv (Powerball)
Usage: python3 tools/make_golden.py [--refresh-fixture] [--refresh-pb-fixture]
  --refresh-fixture     re-snapshot BOTH fixtures from data/
  --refresh-pb-fixture  re-snapshot only the Powerball fixture
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = os.path.join(ROOT, "tests", "golden")
REF = [sys.executable, os.path.join(ROOT, "tools", "reference.py")]
sys.path.insert(0, os.path.join(ROOT, "tools"))
import reference as R  # noqa: E402

# name, args (FIXTURE / PBFIXTURE are replaced by the fixture paths relative to repo root)
CASES = [
    ("encode_147183154", "encode 7 19 33 48 62 --bonus 11"),
    ("encode_200000000", "encode 8 24 37 38 66 --bonus 9"),
    ("encode_0", "encode 1 2 3 4 5 --bonus 1"),
    ("encode_290472335", "encode 66 67 68 69 70 --bonus 24"),
    ("encode_unsorted_mb", "encode 62 48 33 19 7 --mb 11"),
    ("encode_pb_max", "encode 65 66 67 68 69 --bonus 26 --game powerball"),
    ("decode_147183154", "decode 147183154"),
    ("decode_200000000", "decode 200000000"),
    ("decode_0", "decode 0"),
    ("decode_290472335", "decode 290472335"),
    ("decode_pb_0", "decode 0 --game powerball"),
    ("decode_pb_max", "decode 292201337 --game powerball"),
    ("stats", "stats --data FIXTURE"),
    ("guess", "guess --data FIXTURE"),
    ("err_count", "encode 1 2 3 4 --bonus 1"),
    ("err_white_range", "encode 1 2 3 4 71 --bonus 1"),
    ("err_white_zero", "encode 0 2 3 4 5 --bonus 1"),
    ("err_duplicate", "encode 1 2 2 4 5 --bonus 1"),
    ("err_missing_bonus", "encode 1 2 3 4 5"),
    ("err_bonus_range", "encode 1 2 3 4 5 --bonus 25"),
    ("err_pb_bonus_range", "encode 1 2 3 4 5 --bonus 27 --game powerball"),
    ("err_not_int", "encode 1 2 3 4 x --bonus 1"),
    ("err_index_range", "decode 290472336"),
    ("err_pb_index_range", "decode 292201338 --game powerball"),
    ("err_decode_args", "decode"),
    ("err_plays", "pick -n 6"),
    ("err_mode", "pick --mode lucky"),
    ("err_game", "pick --game keno"),
    ("err_export_ext", "pick --export picks.txt"),
    ("err_unknown_cmd", "frobnicate"),
    ("err_unknown_opt", "encode 1 2 3 4 5 --bonus 1 --wat"),
    ("err_data_missing", "stats --data tests/golden/no-such-file.csv"),
    ("stats_bom", "stats --data tests/golden/data_bom.csv"),
    ("guess_cr", "guess --data tests/golden/data_cr.csv"),
    ("err_data_nbsp", "stats --data tests/golden/bad_nbsp.csv"),
    ("err_data_unicode_digit", "stats --data tests/golden/bad_digit.csv"),
    ("err_data_underscore", "stats --data tests/golden/bad_underscore.csv"),
    ("err_data_nel", "stats --data tests/golden/bad_nel.csv"),
    ("err_data_header_nbsp", "stats --data tests/golden/bad_header.csv"),
    ("encode_pb_sample", "encode 7 19 33 48 62 --bonus 11 --game powerball"),
    ("pb_stats", "stats --game powerball --data PBFIXTURE"),
    ("pb_guess", "guess --game powerball --data PBFIXTURE"),
    ("err_pb_wrong_data", "stats --game powerball --data FIXTURE"),
    ("err_mm_wrong_data", "guess --data PBFIXTURE"),
    ("err_pb_data_missing", "guess --game powerball --data tests/golden/no-such-file.csv"),
]


def write_data_fixtures():
    """Derived data-file variants (ASCII-only parsing rules, SPEC section 4)."""
    with open(os.path.join(G, "draws.csv"), "rb") as fh:
        base = fh.read()
    lines = base.split(b"\n")
    assert lines[-1] == b""
    lines.pop()
    out = {
        "data_bom.csv": b"\xef\xbb\xbf" + base,
        "data_cr.csv": b"\r".join(lines) + b"\r",
        "bad_nbsp.csv": b"\n".join(lines[:5] + [lines[5].replace(b",", b",\xc2\xa0", 1)] + lines[6:]) + b"\n",
        "bad_digit.csv": b"\n".join(lines[:5] + [lines[5][:-1] + b"\xd9\xa6"] + lines[6:]) + b"\n",
        "bad_underscore.csv": b"\n".join(lines[:5] + [lines[5].replace(b",", b",1_", 1)] + lines[6:]) + b"\n",
        "bad_nel.csv": b"\n".join(lines[:5] + [lines[5] + b"\xc2\x85"] + lines[6:]) + b"\n",
        "bad_header.csv": b"\n".join([lines[0] + b"\xc2\xa0"] + lines[1:]) + b"\n",
    }
    for name, data in out.items():
        with open(os.path.join(G, name), "wb") as fh:
            fh.write(data)


def main():
    if "--refresh-fixture" in sys.argv:
        shutil.copy(os.path.join(ROOT, "data", "draws.csv"), os.path.join(G, "draws.csv"))
    if "--refresh-fixture" in sys.argv or "--refresh-pb-fixture" in sys.argv:
        shutil.copy(os.path.join(ROOT, "data", "powerball-draws.csv"), os.path.join(G, "powerball-draws.csv"))
    write_data_fixtures()
    for f in os.listdir(G):
        if f.endswith((".txt", ".err")) or f == "cases.tsv":
            os.remove(os.path.join(G, f))
    rows = []
    for name, args in CASES:
        args = args.replace("PBFIXTURE", "tests/golden/powerball-draws.csv")
        args = args.replace("FIXTURE", "tests/golden/draws.csv")
        p = subprocess.run(REF + args.split(), cwd=ROOT, capture_output=True, text=True)
        with open(os.path.join(G, name + ".txt"), "w", newline="\n") as fh:
            fh.write(p.stdout)
        if p.returncode != 0:
            with open(os.path.join(G, name + ".err"), "w", newline="\n") as fh:
                fh.write(p.stderr)
        rows.append("%s\t%d\t%s" % (name, p.returncode, args))
    with open(os.path.join(G, "cases.tsv"), "w", newline="\n") as fh:
        fh.write("# name<TAB>expected_exit<TAB>args  (stdout -> name.txt, stderr -> name.err when exit != 0)\n")
        fh.write("\n".join(rows) + "\n")
    # vectors.txt: game w1 w2 w3 w4 w5 bonus index
    vec = []
    mm, pb = R.MEGA_MILLIONS, R.POWERBALL
    fixed = [(mm, 147183154), (mm, 200000000), (mm, 0), (mm, mm.total - 1),
             (pb, 0), (pb, pb.total - 1), (mm, 23), (mm, 24), (mm, mm.total - 24)]
    for k in range(1, 25):
        fixed.append((mm, (k * 14523617 + 1234567) % mm.total))
    for k in range(1, 9):
        fixed.append((pb, (k * 36525167 + 7654321) % pb.total))
    for g, i in fixed:
        w, b = R.decode(g, i)
        assert R.encode(g, w, b) == i
        vec.append("%s %s %d %d" % (g.id, " ".join(map(str, w)), b, i))
    with open(os.path.join(G, "vectors.txt"), "w", newline="\n") as fh:
        fh.write("# game w1 w2 w3 w4 w5 bonus index   (encode(whites,bonus)==index and decode(index)==whites,bonus)\n")
        fh.write("\n".join(vec) + "\n")
    print("golden: %d cases, %d vectors" % (len(CASES), len(vec)))


if __name__ == "__main__":
    main()
