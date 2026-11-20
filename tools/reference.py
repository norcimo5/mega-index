#!/usr/bin/env python3
"""mega-index reference implementation (canonical oracle for SPEC.md).

Stdlib only. Every other version (python3, rust, cpp, web) must match the
stdout of this program byte-for-byte for encode/decode/stats/guess.
Run: python3 tools/reference.py --help
"""
import os
import re
import secrets
import sys
from datetime import datetime, timezone
from math import comb


class Game:
    def __init__(self, gid, name, white_count, white_max, bonus_max, bonus_name,
                 bonus_abbr, matrix_start, has_history):
        self.id = gid
        self.name = name
        self.white_count = white_count
        self.white_max = white_max
        self.bonus_count = 1
        self.bonus_max = bonus_max
        self.bonus_name = bonus_name
        self.bonus_abbr = bonus_abbr
        self.matrix_start = matrix_start
        self.has_history = has_history
        self.white_combos = comb(white_max, white_count)
        self.total = self.white_combos * bonus_max


MEGA_MILLIONS = Game("megamillions", "Mega Millions", 5, 70, 24, "Mega Ball", "MB", "2025-04-08", True)
POWERBALL = Game("powerball", "Powerball", 5, 69, 26, "Powerball", "PB", "2015-10-07", False)
GAMES = {"megamillions": MEGA_MILLIONS, "powerball": POWERBALL}
PLAY_LABELS = "ABCDE"
MODES = ("uniform", "hot", "cold", "mixed")
HEADER = "date,w1,w2,w3,w4,w5,mb"


class CliError(Exception):
    def __init__(self, msg, code=2):
        Exception.__init__(self, msg)
        self.code = code


# ---------------------------------------------------------------- core
def encode(g, whites, bonus):
    xs = sorted(w - 1 for w in whites)
    n = sum(comb(x, i) for i, x in enumerate(xs, start=1))
    return g.bonus_max * n + (bonus - 1)


def decode(g, index):
    n, r = divmod(index, g.bonus_max)
    balls, x = [], g.white_max - 1
    for i in range(g.white_count, 0, -1):
        while comb(x, i) > n:
            x -= 1
        n -= comb(x, i)
        balls.append(x + 1)
        x -= 1
    return sorted(balls), r + 1


def randbelow(n):
    return secrets.randbelow(n)


def group(n):
    return "{:,}".format(n)


def fmt_ticket(g, whites, bonus):
    return " ".join("%02d" % w for w in sorted(whites)) + " %s %02d" % (g.bonus_abbr, bonus)


def fmt2(num, den, signed):
    """num/den rounded to 2 decimals, half away from zero, integer math only."""
    a = abs(num)
    q = (200 * a + den) // (2 * den)
    s = "%d.%02d" % (q // 100, q % 100)
    if not signed:
        return s
    return ("-" if num < 0 and q != 0 else "+") + s


def notes(g):
    return ["NOTE: Fair picks do not improve your odds. Every ticket is 1 in %s." % group(g.total),
            "NOTE: Hot/cold is for fun and cannot predict draws; uniform is the default mode."]


# ---------------------------------------------------------------- parsing
INT_RE = re.compile(r"^[0-9]{1,18}$")


def parse_int(tok):
    if not INT_RE.match(tok):
        raise CliError("not an integer: '%s'" % tok)
    return int(tok)


def parse_args(argv, opts_with_value):
    """Returns (positionals, options dict). Options: --opt value or --opt=value."""
    pos, opts, i = [], {}, 0
    while i < len(argv):
        a = argv[i]
        if a.startswith("-") and len(a) > 1:
            name, eq, val = a.partition("=")
            canon = opts_with_value.get(name)
            if canon is None:
                raise CliError("unknown option '%s'" % name)
            if not eq:
                if i + 1 >= len(argv):
                    raise CliError("option %s needs a value" % name)
                i += 1
                val = argv[i]
            opts[canon] = val
        else:
            pos.append(a)
        i += 1
    return pos, opts


def get_game(opts):
    gid = opts.get("game", "megamillions")
    if gid not in GAMES:
        raise CliError("unknown game '%s'" % gid)
    return GAMES[gid]


def validate_ticket(g, whites, bonus):
    if len(whites) != g.white_count:
        raise CliError("expected %d white balls, got %d" % (g.white_count, len(whites)))
    for w in whites:
        if not 1 <= w <= g.white_max:
            raise CliError("white ball %d out of range 1-%d" % (w, g.white_max))
    seen = set()
    for w in whites:
        if w in seen:
            raise CliError("duplicate white ball %d" % w)
        seen.add(w)
    if bonus is None:
        raise CliError("missing --bonus")
    if not 1 <= bonus <= g.bonus_max:
        raise CliError("%s %d out of range 1-%d" % (g.bonus_name, bonus, g.bonus_max))


# ---------------------------------------------------------------- data
def find_data(opts):
    if "data" in opts:
        return opts["data"]
    env = os.environ.get("MEGA_INDEX_DATA", "")
    if env:
        return env
    for start in (os.getcwd(), os.path.dirname(os.path.abspath(sys.argv[0]))):
        d = start
        while True:
            p = os.path.join(d, "data", "draws.csv")
            if os.path.isfile(p):
                return p
            parent = os.path.dirname(d)
            if parent == d:
                break
            d = parent
    raise CliError("data file not found (use --data or MEGA_INDEX_DATA)", 1)


def load_draws(path, g):
    try:
        with open(path) as fh:
            lines = fh.read().splitlines()
    except OSError:
        raise CliError("cannot read data file '%s'" % path, 1)
    if not lines or lines[0].strip() != HEADER:
        raise CliError("bad data file: header must be '%s'" % HEADER, 1)
    draws = []
    for ln, line in enumerate(lines[1:], start=2):
        line = line.strip()
        if not line:
            continue
        f = line.split(",")
        try:
            if len(f) != 7 or not re.match(r"^\d{4}-\d{2}-\d{2}$", f[0]):
                raise ValueError
            whites = sorted(int(x) for x in f[1:6])
            mb = int(f[6])
            validate_ticket(g, whites, mb)
        except (ValueError, CliError):
            raise CliError("bad data file: line %d" % ln, 1)
        draws.append((f[0], whites, mb))
    if not draws:
        raise CliError("bad data file: no draws", 1)
    draws.sort(key=lambda d: d[0])
    return draws


class Stats:
    def __init__(self, g, draws):
        self.g, self.draws, self.D = g, draws, len(draws)
        self.wf = [0] * (g.white_max + 1)
        self.bf = [0] * (g.bonus_max + 1)
        self.wgap = [self.D] * (g.white_max + 1)
        self.bgap = [self.D] * (g.bonus_max + 1)
        for idx, (_, whites, mb) in enumerate(draws):
            age = self.D - 1 - idx
            for w in whites:
                self.wf[w] += 1
                self.wgap[w] = age
            self.bf[mb] += 1
            self.bgap[mb] = age

    @staticmethod
    def hot(f, gap, nums):
        return sorted(nums, key=lambda n: (-f[n], gap[n], n))

    @staticmethod
    def cold(f, gap, nums):
        return sorted(nums, key=lambda n: (f[n], -gap[n], n))

    @staticmethod
    def overdue(f, gap, nums):
        return sorted(nums, key=lambda n: (-gap[n], f[n], n))

    def whites(self):
        return range(1, self.g.white_max + 1)

    def bonuses(self):
        return range(1, self.g.bonus_max + 1)

    def rank(self, kind, pool):
        if pool == "w":
            return getattr(self, kind)(self.wf, self.wgap, self.whites())
        return getattr(self, kind)(self.bf, self.bgap, self.bonuses())


def need_history(g):
    if not g.has_history:
        raise CliError("no draw history for %s" % g.name)


# ---------------------------------------------------------------- commands
def cmd_encode(argv):
    pos, opts = parse_args(argv, {"--bonus": "bonus", "--mb": "bonus", "--game": "game"})
    g = get_game(opts)
    whites = [parse_int(p) for p in pos]
    bonus = parse_int(opts["bonus"]) if "bonus" in opts else None
    validate_ticket(g, whites, bonus)
    out("game: %s" % g.name)
    out("ticket: %s" % fmt_ticket(g, whites, bonus))
    out("index: %d" % encode(g, whites, bonus))


def cmd_decode(argv):
    pos, opts = parse_args(argv, {"--game": "game"})
    g = get_game(opts)
    if len(pos) != 1:
        raise CliError("expected exactly one index")
    i = parse_int(pos[0])
    if i >= g.total:
        raise CliError("index %d out of range 0-%d" % (i, g.total - 1))
    whites, bonus = decode(g, i)
    out("game: %s" % g.name)
    out("ticket: %s" % fmt_ticket(g, whites, bonus))
    out("index: %d" % i)


def weighted_take(weights, k):
    """weights: dict num->int weight. Draw k distinct nums without replacement."""
    remaining = dict(weights)
    chosen = []
    for _ in range(k):
        nums = sorted(remaining)
        total = sum(remaining[n] for n in nums)
        r = randbelow(total)
        acc = 0
        for n in nums:
            acc += remaining[n]
            if r < acc:
                chosen.append(n)
                del remaining[n]
                break
    return chosen


def hot_weights(f, nums):
    return {n: f[n] + 1 for n in nums}


def cold_weights(f, nums):
    mx = max(f[n] for n in nums)
    return {n: mx - f[n] + 1 for n in nums}


def make_pick(g, mode, st):
    if mode == "uniform":
        i = randbelow(g.total)
        w, b = decode(g, i)
        return w, b, i
    W, B = list(st.whites()), list(st.bonuses())
    if mode == "hot":
        whites = weighted_take(hot_weights(st.wf, W), g.white_count)
        bonus = weighted_take(hot_weights(st.bf, B), 1)[0]
    elif mode == "cold":
        whites = weighted_take(cold_weights(st.wf, W), g.white_count)
        bonus = weighted_take(cold_weights(st.bf, B), 1)[0]
    else:  # mixed: 3 hot-weighted, then 2 cold-weighted from the remaining numbers
        whites = weighted_take(hot_weights(st.wf, W), 3)
        rest = [n for n in W if n not in whites]
        whites += weighted_take(cold_weights(st.wf, rest), g.white_count - 3)
        if randbelow(2) == 0:
            bonus = weighted_take(hot_weights(st.bf, B), 1)[0]
        else:
            bonus = weighted_take(cold_weights(st.bf, B), 1)[0]
    whites = sorted(whites)
    return whites, bonus, encode(g, whites, bonus)


def export(path, rows, g, mode, stamp):
    keys = ["play", "mode", "w1", "w2", "w3", "w4", "w5", "bonus", "index", "game", "generated_at"]
    recs = []
    for label, w, b, i in rows:
        recs.append([label, mode] + list(w) + [b, i, g.id, stamp])
    if path.lower().endswith(".csv"):
        text = ",".join(keys) + "\n" + "".join(",".join(str(v) for v in r) + "\n" for r in recs)
    elif path.lower().endswith(".json"):
        objs = []
        for r in recs:
            parts = []
            for k, v in zip(keys, r):
                parts.append('"%s": %s' % (k, ('"%s"' % v) if isinstance(v, str) else str(v)))
            objs.append("  {" + ", ".join(parts) + "}")
        text = "[\n" + ",\n".join(objs) + "\n]\n"
    else:
        raise CliError("export path must end in .csv or .json")
    try:
        with open(path, "w", newline="\n") as fh:
            fh.write(text)
    except OSError:
        raise CliError("cannot write '%s'" % path, 1)


def cmd_pick(argv):
    pos, opts = parse_args(argv, {"-n": "n", "--plays": "n", "--mode": "mode", "--game": "game",
                                  "--export": "export", "--data": "data"})
    if pos:
        raise CliError("unexpected argument '%s'" % pos[0])
    g = get_game(opts)
    n = parse_int(opts.get("n", "1"))
    if not 1 <= n <= 5:
        raise CliError("plays must be 1-5")
    mode = opts.get("mode", "uniform")
    if mode not in MODES:
        raise CliError("unknown mode '%s'" % mode)
    exp = opts.get("export")
    if exp is not None and not exp.lower().endswith((".csv", ".json")):
        raise CliError("export path must end in .csv or .json")
    st = None
    if mode != "uniform":
        need_history(g)
        st = Stats(g, load_draws(find_data(opts), g))
    rows, seen = [], set()
    while len(rows) < n:
        w, b, i = make_pick(g, mode, st)
        if i in seen:
            continue
        seen.add(i)
        rows.append((PLAY_LABELS[len(rows)], w, b, i))
    out("%s PICK  mode=%s  plays=%d" % (g.name.upper(), mode, n))
    for label, w, b, i in rows:
        out("%s: %s  index %d" % (label, fmt_ticket(g, w, b), i))
    for line in notes(g):
        out(line)
    if exp is not None:
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        export(exp, rows, g, mode, stamp)
        out("exported %d plays to %s" % (n, exp))


def load_stats(argv):
    pos, opts = parse_args(argv, {"--data": "data", "--game": "game"})
    if pos:
        raise CliError("unexpected argument '%s'" % pos[0])
    g = get_game(opts)
    need_history(g)
    return Stats(g, load_draws(find_data(opts), g))


def table(f, gap, nums, D, k, K):
    lines = ["No  Freq     Dev   Gap"]
    for n in nums:
        lines.append("%02d  %4d  %6s  %4d" % (n, f[n], fmt2(f[n] * K - D * k, K, True), gap[n]))
    return lines


def chi(f, nums, D, k, K):
    num = sum((f[n] * K - D * k) ** 2 for n in nums)
    return fmt2(num, K * D * k, False)


def cmd_stats(argv):
    st = load_stats(argv)
    g, D = st.g, st.D
    k, K, B = g.white_count, g.white_max, g.bonus_max
    out("%s STATS" % g.name.upper())
    out("draws: %d" % D)
    out("range: %s..%s" % (st.draws[0][0], st.draws[-1][0]))
    out("expected white freq: %s" % fmt2(D * k, K, False))
    out("expected %s freq: %s" % (g.bonus_abbr, fmt2(D, B, False)))
    out("")
    out("WHITE BALLS")
    for line in table(st.wf, st.wgap, st.whites(), D, k, K):
        out(line)
    out("")
    out(g.bonus_name.upper())
    for line in table(st.bf, st.bgap, st.bonuses(), D, 1, B):
        out(line)
    out("")
    for pool, label, top in (("w", "WHITES", 10), ("b", g.bonus_abbr, 5)):
        f = st.wf if pool == "w" else st.bf
        gap = st.wgap if pool == "w" else st.bgap
        out("HOT %s: %s" % (label, " ".join("%02d:%d" % (n, f[n]) for n in st.rank("hot", pool)[:top])))
        out("COLD %s: %s" % (label, " ".join("%02d:%d" % (n, f[n]) for n in st.rank("cold", pool)[:top])))
        out("OVERDUE %s: %s" % (label, " ".join("%02d:%d" % (n, gap[n]) for n in st.rank("overdue", pool)[:top])))
    out("chi-square white: %s (df %d)" % (chi(st.wf, st.whites(), D, k, K), K - 1))
    out("chi-square %s: %s (df %d)" % (g.bonus_abbr, chi(st.bf, st.bonuses(), D, 1, B), B - 1))


def guess_tickets(st):
    g = st.g
    hot_w, cold_w, over_w = st.rank("hot", "w"), st.rank("cold", "w"), st.rank("overdue", "w")
    hot_b, cold_b, over_b = st.rank("hot", "b"), st.rank("cold", "b"), st.rank("overdue", "b")
    bal = hot_w[:3]
    for n in over_w:
        if len(bal) == g.white_count:
            break
        if n not in bal:
            bal.append(n)
    out_t = []
    for label, w, b in (("HOT", hot_w[:5], hot_b[0]), ("COLD", cold_w[:5], cold_b[0]),
                        ("BALANCED", bal, over_b[0])):
        w = sorted(w)
        out_t.append((label, w, b, encode(g, w, b)))
    return out_t


def cmd_guess(argv):
    st = load_stats(argv)
    g = st.g
    out("%s GUESS  draws=%d  %s..%s" % (g.name.upper(), st.D, st.draws[0][0], st.draws[-1][0]))
    for letter, (label, w, b, i) in zip(PLAY_LABELS, guess_tickets(st)):
        out("%s: %s  index %d  (%s)" % (letter, fmt_ticket(g, w, b), i, label))
    for line in notes(g):
        out(line)


USAGE = """mega-index: lottery ticket <-> index encoder/decoder and picker

usage:
  mega-index encode <w1> <w2> <w3> <w4> <w5> --bonus N [--game G]   (--mb N also accepted)
  mega-index decode <index> [--game G]
  mega-index pick [-n 1..5] [--mode uniform|hot|cold|mixed] [--game G] [--export FILE.csv|FILE.json] [--data PATH]
  mega-index stats [--data PATH]
  mega-index guess [--data PATH]
  mega-index --help

games: megamillions (default; 5 of 1-70 + Mega Ball 1-24), powerball (5 of 1-69 + Powerball 1-26)
data:  --data PATH, else $MEGA_INDEX_DATA, else data/draws.csv found walking up from cwd, then from the program dir
"""

COMMANDS = {"encode": cmd_encode, "decode": cmd_decode, "pick": cmd_pick,
            "stats": cmd_stats, "guess": cmd_guess}


def out(s):
    sys.stdout.write(s + "\n")


def main(argv):
    if "--help" in argv or "-h" in argv:
        sys.stdout.write(USAGE)
        return 0
    if not argv:
        sys.stderr.write(USAGE)
        return 2
    cmd = COMMANDS.get(argv[0])
    try:
        if cmd is None:
            raise CliError("unknown command '%s'" % argv[0])
        cmd(argv[1:])
    except CliError as e:
        sys.stdout.flush()
        sys.stderr.write("error: %s\n" % e)
        return e.code
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
