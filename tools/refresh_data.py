#!/usr/bin/env python3
"""Refresh Mega Millions and Powerball draw history (stdlib only).

Downloads the NY Open Data CSVs (or uses the saved raw copies with --offline),
filters each game to its current matrix, validates, sorts, and writes:

  Mega Millions (draws on/after 2025-04-08: 5 of 1-70 + Mega Ball 1-24)
    data/mega-millions-ny-opendata-raw.csv  raw download
    data/draws.csv                          canonical file read by every CLI
    src/web/js/draws-data.js                plain script (window.MM_DRAWS) for the web app
  Powerball (draws on/after 2015-10-07: 5 of 1-69 + Powerball 1-26; Double Play ignored)
    data/powerball-ny-opendata-raw.csv      raw download
    data/powerball-draws.csv                canonical file (same header; column "mb" holds the Powerball)
    src/web/power/js/draws-data.js          plain script (window.PB_DRAWS)

Powerball also gets a schedule check (Wed/Sat, plus Mon from 2021-08-23): missing
or extra draw dates are reported as warnings, never as failures.

Usage: python3 tools/refresh_data.py [--offline] [--game megamillions|powerball|all]
       (default --game all)
"""
import csv
import io
import json
import os
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WHITE_COUNT = 5


class GameSrc:
    def __init__(self, gid, url, matrix_start, white_max, bonus_max, bonus_name,
                 raw, draws, js, js_var, schedule):
        self.id, self.url, self.matrix_start = gid, url, matrix_start
        self.white_max, self.bonus_max, self.bonus_name = white_max, bonus_max, bonus_name
        self.raw = os.path.join(ROOT, *raw)
        self.draws = os.path.join(ROOT, *draws)
        self.js = os.path.join(ROOT, *js)
        self.js_var = js_var
        self.schedule = schedule  # None, or function(date) -> True if a draw is scheduled


def _pb_scheduled(d):
    wd = d.weekday()  # Mon=0 .. Sun=6
    return wd in (2, 5) or (wd == 0 and d >= date(2021, 8, 23))


MEGA_MILLIONS = GameSrc(
    "megamillions", "https://data.ny.gov/api/views/5xaw-6ayf/rows.csv?accessType=DOWNLOAD",
    "2025-04-08", 70, 24, "Mega Ball",
    ("data", "mega-millions-ny-opendata-raw.csv"), ("data", "draws.csv"),
    ("src", "web", "js", "draws-data.js"), "MM", None)
POWERBALL = GameSrc(
    "powerball", "https://data.ny.gov/api/views/d6yy-54nr/rows.csv?accessType=DOWNLOAD",
    "2015-10-07", 69, 26, "Powerball",
    ("data", "powerball-ny-opendata-raw.csv"), ("data", "powerball-draws.csv"),
    ("src", "web", "power", "js", "draws-data.js"), "PB", _pb_scheduled)
GAMES = {"megamillions": [MEGA_MILLIONS], "powerball": [POWERBALL],
         "all": [MEGA_MILLIONS, POWERBALL]}


def fail(msg):
    print("error: " + msg, file=sys.stderr)
    sys.exit(1)


def warn(msg):
    print("warning: " + msg)


def load_raw(g, offline):
    if offline:
        if not os.path.exists(g.raw):
            fail("raw CSV not found: " + g.raw)
        with open(g.raw, "rb") as fh:
            return fh.read().decode("utf-8-sig")
    req = urllib.request.Request(g.url, headers={"User-Agent": "mega-index-refresh/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    text = data.decode("utf-8-sig")
    if "Draw Date" not in text.splitlines()[0]:
        fail("unexpected download format (no 'Draw Date' header)")
    os.makedirs(os.path.dirname(g.raw), exist_ok=True)
    with open(g.raw, "wb") as fh:
        fh.write(data)
    return text


def row_numbers(g, row, iso):
    """Returns (whites sorted, bonus) for one raw row."""
    nums = row["Winning Numbers"].split()
    if g is POWERBALL:
        # 6 numbers: 5 whites then the Powerball. Double Play columns are ignored.
        if len(nums) != WHITE_COUNT + 1:
            fail("%s: need %d numbers (5 whites + Powerball), got %r" % (iso, WHITE_COUNT + 1, nums))
        return sorted(int(x) for x in nums[:WHITE_COUNT]), int(nums[WHITE_COUNT])
    return sorted(int(x) for x in nums), int(row["Mega Ball"])


def parse(g, text):
    draws = {}
    for row in csv.DictReader(io.StringIO(text)):
        m, d, y = row["Draw Date"].strip().split("/")
        iso = "%04d-%02d-%02d" % (int(y), int(m), int(d))
        if iso < g.matrix_start:
            continue
        whites, mb = row_numbers(g, row, iso)
        if len(whites) != WHITE_COUNT or len(set(whites)) != WHITE_COUNT:
            fail("%s: need %d distinct white balls, got %r" % (iso, WHITE_COUNT, whites))
        if not all(1 <= w <= g.white_max for w in whites):
            fail("%s: white ball out of range 1-%d: %r" % (iso, g.white_max, whites))
        if not 1 <= mb <= g.bonus_max:
            fail("%s: %s out of range 1-%d: %d" % (iso, g.bonus_name, g.bonus_max, mb))
        rec = (whites, mb)
        if iso in draws:
            if draws[iso] != rec:
                fail("%s: conflicting duplicate rows" % iso)
            warn("%s: identical duplicate row ignored" % iso)
        draws[iso] = rec
    if not draws:
        fail("no draws on/after " + g.matrix_start)
    return sorted((d, w, m) for d, (w, m) in draws.items())


def check_schedule(g, draws):
    """Report (never fail on) dates missing from, or extra to, the expected draw schedule."""
    have = {date.fromisoformat(d) for d, _, _ in draws}
    first, last = date.fromisoformat(g.matrix_start), max(have)
    expected, d = set(), first
    while d <= last:
        if g.schedule(d):
            expected.add(d)
        d += timedelta(days=1)
    missing, extra = sorted(expected - have), sorted(have - expected)
    for d in missing:
        warn("%s: no draw on scheduled date %s (%s)" % (g.id, d.isoformat(), d.strftime("%a")))
    for d in extra:
        warn("%s: irregular draw on %s (%s)" % (g.id, d.isoformat(), d.strftime("%a")))
    print("schedule: %d missing, %d irregular" % (len(missing), len(extra)))


def write_outputs(g, draws):
    os.makedirs(os.path.dirname(g.draws), exist_ok=True)
    with open(g.draws, "w", newline="\n") as fh:
        fh.write("date,w1,w2,w3,w4,w5,mb\n")
        for d, w, m in draws:
            fh.write("%s,%s,%d\n" % (d, ",".join(str(x) for x in w), m))
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    os.makedirs(os.path.dirname(g.js), exist_ok=True)
    with open(g.js, "w", newline="\n") as fh:
        fh.write("/* Generated by tools/refresh_data.py - do not edit. Plain script, no module. */\n")
        fh.write("window.%s_DRAWS = [\n" % g.js_var)
        fh.write(",\n".join(json.dumps({"d": d, "w": w, "m": m}, separators=(",", ":")) for d, w, m in draws))
        fh.write("\n];\n")
        fh.write('window.%s_DRAWS_UPDATED = "%s";\n' % (g.js_var, stamp))


def main(argv):
    if "-h" in argv or "--help" in argv:
        print(__doc__)
        return 0
    offline, which, i = False, "all", 0
    while i < len(argv):
        a = argv[i]
        if a == "--offline":
            offline = True
        elif a == "--game" and i + 1 < len(argv):
            i += 1
            which = argv[i]
        elif a.startswith("--game="):
            which = a[len("--game="):]
        else:
            fail("usage: refresh_data.py [--offline] [--game megamillions|powerball|all]")
        i += 1
    if which not in GAMES:
        fail("unknown game '%s' (megamillions, powerball, all)" % which)
    for g in GAMES[which]:
        if len(GAMES[which]) > 1:
            print("[%s]" % g.id)
        draws = parse(g, load_raw(g, offline))
        if g.schedule is not None:
            check_schedule(g, draws)
        write_outputs(g, draws)
        print("draws: %d (%s .. %s)" % (len(draws), draws[0][0], draws[-1][0]))
        print("wrote " + os.path.relpath(g.draws, ROOT))
        print("wrote " + os.path.relpath(g.js, ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
