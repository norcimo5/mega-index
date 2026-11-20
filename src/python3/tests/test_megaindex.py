import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stderr

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
sys.path.insert(0, SRC)

from megaindex import MEGA_MILLIONS as MM, POWERBALL as PB, decode, encode, randbelow  # noqa: E402
from megaindex.cli import main  # noqa: E402
from megaindex.core import fmt2, validate_ticket  # noqa: E402
from megaindex.errors import CliError  # noqa: E402
from megaindex.picks import guess_tickets, make_pick  # noqa: E402
from megaindex.stats import Stats, find_data, load_draws  # noqa: E402

REPO = os.path.dirname(os.path.dirname(SRC))
GOLDEN_DRAWS = os.path.join(REPO, "tests", "golden", "draws.csv")
SCRIPT = os.path.join(SRC, "mega_index.py")


def run(argv, **kw):
    """Run the CLI in-process -> (rc, stdout, stderr)."""
    out, err = io.StringIO(), io.StringIO()
    with redirect_stderr(err):
        rc = main(argv, stdout=out, **kw)
    return rc, out.getvalue(), err.getvalue()


def valid(g, w, b):
    return (len(w) == g.white_count and len(set(w)) == g.white_count
            and all(1 <= x <= g.white_max for x in w) and 1 <= b <= g.bonus_max)


class TestVectors(unittest.TestCase):
    VECTORS = [([7, 19, 33, 48, 62], 11, 147183154), ([8, 24, 37, 38, 66], 9, 200000000),
               ([1, 2, 3, 4, 5], 1, 0), ([66, 67, 68, 69, 70], 24, 290472335)]

    def test_pdf_vectors(self):
        for w, b, i in self.VECTORS:
            self.assertEqual(encode(MM, w, b), i)
            self.assertEqual(decode(MM, i), (w, b))

    def test_totals(self):
        self.assertEqual(MM.total, 290472336)
        self.assertEqual(PB.total, 292201338)

    def test_powerball_endpoints(self):
        self.assertEqual(decode(PB, 0), ([1, 2, 3, 4, 5], 1))
        self.assertEqual(decode(PB, 292201337), ([65, 66, 67, 68, 69], 26))
        self.assertEqual(encode(PB, [65, 66, 67, 68, 69], 26), 292201337)

    def test_unsorted_whites(self):
        self.assertEqual(encode(MM, [62, 48, 33, 19, 7], 11), 147183154)

    def test_golden_vectors_file(self):
        with open(os.path.join(REPO, "tests", "golden", "vectors.txt")) as fh:
            for line in fh:
                p = line.split()
                if not p or p[0].startswith("#"):
                    continue
                g = {"megamillions": MM, "powerball": PB}[p[0]]
                w = [int(x) for x in p[1:6]]
                self.assertEqual(encode(g, w, int(p[6])), int(p[7]))
                self.assertEqual(decode(g, int(p[7])), (sorted(w), int(p[6])))


class TestRoundTrip(unittest.TestCase):
    def test_index_round_trip(self):
        for g in (MM, PB):
            for _ in range(100000):
                i = randbelow(g.total)
                w, b = decode(g, i)
                self.assertTrue(valid(g, w, b))
                self.assertEqual(w, sorted(w))
                self.assertEqual(encode(g, w, b), i)

    def test_ticket_round_trip(self):
        import random
        sr = random.SystemRandom()
        for g in (MM, PB):
            for _ in range(20000):
                w = sorted(sr.sample(range(1, g.white_max + 1), 5))
                b = sr.randint(1, g.bonus_max)
                self.assertEqual(decode(g, encode(g, w, b)), (w, b))


class TestRng(unittest.TestCase):
    def test_range_and_distribution(self):
        counts = [0] * 24
        for _ in range(240000):
            counts[randbelow(24)] += 1
        for c in counts:
            self.assertTrue(9500 <= c <= 10500, counts)
        self.assertEqual(randbelow(1), 0)


class TestValidation(unittest.TestCase):
    def test_rejects(self):
        for w, b, msg in [([1, 2, 3, 4], 1, "expected 5 white balls, got 4"),
                          ([1, 2, 3, 4, 71], 1, "white ball 71 out of range 1-70"),
                          ([0, 2, 3, 4, 5], 1, "white ball 0 out of range 1-70"),
                          ([1, 2, 2, 4, 5], 1, "duplicate white ball 2"),
                          ([1, 2, 3, 4, 5], None, "missing --bonus"),
                          ([1, 2, 3, 4, 5], 25, "Mega Ball 25 out of range 1-24")]:
            with self.assertRaises(CliError) as cm:
                validate_ticket(MM, w, b)
            self.assertEqual(str(cm.exception), msg)

    def test_cli_errors(self):
        cases = [
            (["frobnicate"], 2, "error: unknown command 'frobnicate'\n"),
            (["encode", "1", "2", "3", "4", "5", "--bonus", "1", "--wat"], 2, "error: unknown option '--wat'\n"),
            (["encode", "1", "2", "3", "4", "5", "--bonus"], 2, "error: option --bonus needs a value\n"),
            (["encode", "1", "2", "3", "4", "x", "--bonus", "1"], 2, "error: not an integer: 'x'\n"),
            (["encode", "-5"], 2, "error: unknown option '-5'\n"),
            (["encode", "+5", "--bonus", "1"], 2, "error: not an integer: '+5'\n"),
            (["decode", "0", "--game", "keno"], 2, "error: unknown game 'keno'\n"),
            (["decode"], 2, "error: expected exactly one index\n"),
            (["decode", "290472336"], 2, "error: index 290472336 out of range 0-290472335\n"),
            (["decode", "292201338", "--game", "powerball"], 2, "error: index 292201338 out of range 0-292201337\n"),
            (["pick", "x"], 2, "error: unexpected argument 'x'\n"),
            (["pick", "-n", "6"], 2, "error: plays must be 1-5\n"),
            (["pick", "-n", "0"], 2, "error: plays must be 1-5\n"),
            (["pick", "--mode", "lucky"], 2, "error: unknown mode 'lucky'\n"),
            (["pick", "--export", "a.txt"], 2, "error: export path must end in .csv or .json\n"),
            (["pick", "--mode", "hot", "--game", "powerball"], 2, "error: no draw history for Powerball\n"),
            (["stats", "--game", "powerball"], 2, "error: no draw history for Powerball\n"),
            (["stats", "--data", "/no/such/file.csv"], 1, "error: cannot read data file '/no/such/file.csv'\n"),
        ]
        for argv, rc, err in cases:
            got = run(argv)
            self.assertEqual((got[0], got[1], got[2]), (rc, "", err), argv)

    def test_option_forms(self):
        rc, out, _ = run(["encode", "7", "19", "33", "48", "62", "--bonus=11", "--game=megamillions"])
        self.assertEqual(rc, 0)
        self.assertIn("index: 147183154\n", out)
        rc, out, _ = run(["encode", "7", "19", "33", "48", "62", "--mb", "9", "--bonus", "11"])
        self.assertIn("MB 11", out)  # last wins
        rc, out, _ = run(["pick", "-h"])
        self.assertEqual(rc, 0)
        self.assertEqual(run([])[0], 2)

    def test_bad_data_files(self):
        with tempfile.TemporaryDirectory() as d:
            for name, text, msg in [
                ("h.csv", "x\n", "bad data file: header must be 'date,w1,w2,w3,w4,w5,mb'"),
                ("e.csv", "date,w1,w2,w3,w4,w5,mb\n\n", "bad data file: no draws"),
                ("l.csv", "date,w1,w2,w3,w4,w5,mb\n2025-04-08,1,2,3,4,5,25\n", "bad data file: line 2"),
                ("d.csv", "date,w1,w2,w3,w4,w5,mb\n2025-04-08,1,2,3,4,4,5\n", "bad data file: line 2"),
            ]:
                p = os.path.join(d, name)
                with open(p, "w") as fh:
                    fh.write(text)
                rc, out, err = run(["stats", "--data", p])
                self.assertEqual((rc, out, err), (1, "", "error: %s\n" % msg))


class TestPicks(unittest.TestCase):
    def test_pick_modes_valid_distinct(self):
        draws = load_draws(GOLDEN_DRAWS, MM)
        st = Stats(MM, draws)
        for mode in ("uniform", "hot", "cold", "mixed"):
            for _ in range(300):
                w, b, i = make_pick(MM, mode, st)
                self.assertTrue(valid(MM, w, b), (mode, w, b))
                self.assertEqual(encode(MM, w, b), i)
            rc, out, _ = run(["pick", "-n", "5", "--mode", mode, "--data", GOLDEN_DRAWS])
            self.assertEqual(rc, 0)
            plays = [l for l in out.splitlines() if l[:1] in "ABCDE" and l[1:2] == ":"]
            self.assertEqual(len(plays), 5)
            self.assertEqual(len({l.split("index ")[1] for l in plays}), 5)
            self.assertTrue(out.startswith("MEGA MILLIONS PICK  mode=%s  plays=5\n" % mode))

    def test_powerball_uniform(self):
        rc, out, _ = run(["pick", "--game", "powerball", "-n", "2"])
        self.assertEqual(rc, 0)
        self.assertTrue(out.startswith("POWERBALL PICK  mode=uniform  plays=2\n"))
        self.assertIn("1 in 292,201,338.", out)

    def test_guess_and_stats_golden(self):
        gdir = os.path.join(REPO, "tests", "golden")
        for cmd in ("guess", "stats"):
            rc, out, _ = run([cmd, "--data", GOLDEN_DRAWS])
            with open(os.path.join(gdir, cmd + ".txt")) as fh:
                self.assertEqual(out, fh.read())
        st = Stats(MM, load_draws(GOLDEN_DRAWS, MM))
        self.assertEqual([t[0] for t in guess_tickets(st)], ["HOT", "COLD", "BALANCED"])

    def test_fmt2(self):
        self.assertEqual(fmt2(1, 200, True), "+0.01")
        self.assertEqual(fmt2(-1, 1000, True), "+0.00")
        self.assertEqual(fmt2(-5, 1000, True), "-0.01")
        self.assertEqual(fmt2(5, 1000), "0.01")


class TestExport(unittest.TestCase):
    def test_csv_and_json(self):
        with tempfile.TemporaryDirectory() as d:
            c, j = os.path.join(d, "p.CSV"), os.path.join(d, "p.json")
            rc, out, _ = run(["pick", "-n", "3", "--export", c])
            self.assertEqual(rc, 0)
            self.assertTrue(out.endswith("exported 3 plays to %s\n" % c))
            with open(c) as fh:
                lines = fh.read().split("\n")
            self.assertEqual(lines[0], "play,mode,w1,w2,w3,w4,w5,bonus,index,game,generated_at")
            self.assertEqual(len(lines), 5)
            self.assertEqual(lines[4], "")
            row = lines[1].split(",")
            self.assertEqual(row[:2], ["A", "uniform"])
            self.assertEqual(row[9], "megamillions")
            self.assertRegex(row[10], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
            self.assertEqual(encode(MM, [int(x) for x in row[2:7]], int(row[7])), int(row[8]))
            self.assertEqual(len({l.split(",")[10] for l in lines[1:4]}), 1)

            run(["pick", "-n", "2", "--game", "powerball", "--export", j])
            with open(j) as fh:
                text = fh.read()
            self.assertTrue(text.startswith('[\n  {"play": "A", "mode": "uniform", "w1": '))
            self.assertTrue(text.endswith("},\n  " + text.split("\n")[2].strip() + "\n]\n"))
            data = json.loads(text)
            self.assertEqual([r["play"] for r in data], ["A", "B"])
            self.assertEqual(data[0]["game"], "powerball")
            self.assertEqual(list(data[0]), ["play", "mode", "w1", "w2", "w3", "w4", "w5",
                                             "bonus", "index", "game", "generated_at"])

    def test_write_failure(self):
        rc, out, err = run(["pick", "--export", "/no/such/dir/p.csv"])
        self.assertEqual(rc, 1)
        self.assertEqual(err, "error: cannot write '/no/such/dir/p.csv'\n")
        self.assertIn("NOTE:", out)
        self.assertNotIn("exported", out)


class TestDataDiscovery(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        os.makedirs(os.path.join(self.root, "data"))
        self.csv = os.path.join(self.root, "data", "draws.csv")
        with open(GOLDEN_DRAWS) as s, open(self.csv, "w") as d:
            d.write(s.read())
        self.deep = os.path.join(self.root, "a", "b")
        os.makedirs(self.deep)
        self.empty = os.path.join(self.root, "empty")
        os.makedirs(self.empty)

    def tearDown(self):
        self.tmp.cleanup()

    def test_explicit_wins(self):
        self.assertEqual(find_data("x.csv", cwd=self.deep, environ={"MEGA_INDEX_DATA": "y"}), "x.csv")

    def test_env(self):
        self.assertEqual(find_data(None, cwd=self.deep, environ={"MEGA_INDEX_DATA": "y.csv"}), "y.csv")
        # empty env var is ignored
        self.assertEqual(find_data(None, cwd=self.deep, environ={"MEGA_INDEX_DATA": ""}), self.csv)

    def test_walk_up_from_cwd(self):
        self.assertEqual(find_data(None, cwd=self.deep, script_dir="/", environ={}), self.csv)

    def test_walk_up_from_script_dir(self):
        self.assertEqual(find_data(None, cwd="/", script_dir=self.deep, environ={}), self.csv)

    def test_not_found(self):
        # a tempdir outside any dir holding data/draws.csv
        with tempfile.TemporaryDirectory(dir="/tmp") as d:
            if find_data_safe(d):
                self.skipTest("a data/draws.csv exists above /tmp")
            with self.assertRaises(CliError) as cm:
                find_data(None, cwd=d, script_dir=d, environ={})
            self.assertEqual((str(cm.exception), cm.exception.code),
                             ("data file not found (use --data or MEGA_INDEX_DATA)", 1))

    def test_cli_uses_discovery(self):
        rc, out, _ = run(["guess"], cwd=self.deep, script_dir="/", environ={})
        self.assertEqual(rc, 0)
        self.assertIn("draws=169", out)

    def test_real_subprocess_env_and_cwd(self):
        import subprocess
        env = dict(os.environ, MEGA_INDEX_DATA=self.csv)
        r = subprocess.run([sys.executable, SCRIPT, "guess"], cwd=self.empty, env=env,
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        env.pop("MEGA_INDEX_DATA")
        r = subprocess.run([sys.executable, SCRIPT, "guess"], cwd=self.deep, env=env,
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("GUESS  draws=169", r.stdout)

    def test_script_dir_fallback_subprocess(self):
        import subprocess
        env = {k: v for k, v in os.environ.items() if k != "MEGA_INDEX_DATA"}
        # cwd has no data; the script lives in the repo, which has data/draws.csv above it
        with tempfile.TemporaryDirectory(dir="/tmp") as d:
            if find_data_safe(d):
                self.skipTest("a data/draws.csv exists above /tmp")
            r = subprocess.run([sys.executable, SCRIPT, "stats"], cwd=d, env=env,
                               capture_output=True, text=True)
        if os.path.isfile(os.path.join(REPO, "data", "draws.csv")):
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertTrue(r.stdout.startswith("MEGA MILLIONS STATS\n"))


def find_data_safe(start):
    try:
        find_data(None, cwd=start, script_dir=start, environ={})
        return True
    except CliError:
        return False


if __name__ == "__main__":
    unittest.main()
