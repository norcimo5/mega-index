"""Command-line interface (contract: SPEC.md section 8)."""
import os
import re
import sys

from .core import decode, encode, fmt2, fmt_ticket, notes, validate_ticket
from .errors import CliError
from .export import check_export_path, export, utc_stamp
from .game import DEFAULT_GAME, GAMES
from .picks import MODES, PLAY_LABELS, guess_tickets, make_slip
from .stats import Stats, find_data, load_draws, need_history

_INT_RE = re.compile(r"^[0-9]{1,18}$")

USAGE = """mega-index: lottery ticket <-> index encoder/decoder and picker

usage:
  mega-index encode <w1> <w2> <w3> <w4> <w5> --bonus N [--game G]   (--mb N also accepted)
  mega-index decode <index> [--game G]
  mega-index pick [-n 1..5] [--mode uniform|hot|cold|mixed] [--game G] [--export FILE.csv|FILE.json] [--data PATH]
  mega-index stats [--data PATH] [--game G]
  mega-index guess [--data PATH] [--game G]
  mega-index --help

games: megamillions (default; 5 of 1-70 + Mega Ball 1-24), powerball (5 of 1-69 + Powerball 1-26)
data:  --data PATH, else $MEGA_INDEX_DATA, else data/draws.csv found walking up from cwd, then from the program dir
"""


class Context:
    """Process-level inputs, injectable for tests."""

    def __init__(self, script_dir=None, cwd=None, environ=None, stdout=None):
        self.script_dir = script_dir
        self.cwd = cwd
        self.environ = environ
        self.stdout = stdout

    def out(self, s=""):
        (self.stdout or sys.stdout).write(s + "\n")

    def data_path(self, opts):
        return find_data(opts.get("data"), self.cwd, self.script_dir, self.environ)


def parse_int(tok):
    if not _INT_RE.match(tok):
        raise CliError("not an integer: '%s'" % tok)
    return int(tok)


def parse_args(argv, opts_with_value):
    """-> (positionals, {canonical option: value}). Accepts --opt v and --opt=v."""
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
    gid = opts.get("game", DEFAULT_GAME.id)
    if gid not in GAMES:
        raise CliError("unknown game '%s'" % gid)
    return GAMES[gid]


def load_stats(ctx, argv):
    pos, opts = parse_args(argv, {"--data": "data", "--game": "game"})
    if pos:
        raise CliError("unexpected argument '%s'" % pos[0])
    g = get_game(opts)
    need_history(g)
    return Stats(g, load_draws(ctx.data_path(opts), g))


def cmd_encode(ctx, argv):
    pos, opts = parse_args(argv, {"--bonus": "bonus", "--mb": "bonus", "--game": "game"})
    g = get_game(opts)
    whites = [parse_int(p) for p in pos]
    bonus = parse_int(opts["bonus"]) if "bonus" in opts else None
    validate_ticket(g, whites, bonus)
    ctx.out("game: %s" % g.name)
    ctx.out("ticket: %s" % fmt_ticket(g, whites, bonus))
    ctx.out("index: %d" % encode(g, whites, bonus))


def cmd_decode(ctx, argv):
    pos, opts = parse_args(argv, {"--game": "game"})
    g = get_game(opts)
    if len(pos) != 1:
        raise CliError("expected exactly one index")
    i = parse_int(pos[0])
    if i >= g.total:
        raise CliError("index %d out of range 0-%d" % (i, g.total - 1))
    whites, bonus = decode(g, i)
    ctx.out("game: %s" % g.name)
    ctx.out("ticket: %s" % fmt_ticket(g, whites, bonus))
    ctx.out("index: %d" % i)


def cmd_pick(ctx, argv):
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
    path = opts.get("export")
    if path is not None:
        check_export_path(path)
    st = None
    if mode != "uniform":
        need_history(g)
        st = Stats(g, load_draws(ctx.data_path(opts), g))
    rows = make_slip(g, mode, n, st)
    ctx.out("%s PICK  mode=%s  plays=%d" % (g.name.upper(), mode, n))
    for label, w, b, i in rows:
        ctx.out("%s: %s  index %d" % (label, fmt_ticket(g, w, b), i))
    for line in notes(g):
        ctx.out(line)
    if path is not None:
        export(path, rows, g, mode, utc_stamp())
        ctx.out("exported %d plays to %s" % (n, path))


def _table(f, gap, nums, D, k, K):
    lines = ["No  Freq     Dev   Gap"]
    for n in nums:
        lines.append("%02d  %4d  %6s  %4d" % (n, f[n], fmt2(f[n] * K - D * k, K, True), gap[n]))
    return lines


def _chi(f, nums, D, k, K):
    num = sum((f[n] * K - D * k) ** 2 for n in nums)
    return fmt2(num, K * D * k)


def cmd_stats(ctx, argv):
    st = load_stats(ctx, argv)
    g, D = st.g, st.D
    k, K, B = g.white_count, g.white_max, g.bonus_max
    out = ctx.out
    out("%s STATS" % g.name.upper())
    out("draws: %d" % D)
    out("range: %s..%s" % (st.draws[0][0], st.draws[-1][0]))
    out("expected white freq: %s" % fmt2(D * k, K))
    out("expected %s freq: %s" % (g.bonus_abbr, fmt2(D, B)))
    out("")
    out("WHITE BALLS")
    for line in _table(st.wf, st.wgap, st.whites(), D, k, K):
        out(line)
    out("")
    out(g.bonus_name.upper())
    for line in _table(st.bf, st.bgap, st.bonuses(), D, 1, B):
        out(line)
    out("")
    for pool, label, top in (("w", "WHITES", 10), ("b", g.bonus_abbr, 5)):
        f = st.wf if pool == "w" else st.bf
        gap = st.wgap if pool == "w" else st.bgap
        for kind, vals in (("hot", f), ("cold", f), ("overdue", gap)):
            out("%s %s: %s" % (kind.upper(), label,
                               " ".join("%02d:%d" % (n, vals[n]) for n in st.rank(kind, pool)[:top])))
    out("chi-square white: %s (df %d)" % (_chi(st.wf, st.whites(), D, k, K), K - 1))
    out("chi-square %s: %s (df %d)" % (g.bonus_abbr, _chi(st.bf, st.bonuses(), D, 1, B), B - 1))


def cmd_guess(ctx, argv):
    st = load_stats(ctx, argv)
    g = st.g
    ctx.out("%s GUESS  draws=%d  %s..%s" % (g.name.upper(), st.D, st.draws[0][0], st.draws[-1][0]))
    for letter, (label, w, b, i) in zip(PLAY_LABELS, guess_tickets(st)):
        ctx.out("%s: %s  index %d  (%s)" % (letter, fmt_ticket(g, w, b), i, label))
    for line in notes(g):
        ctx.out(line)


COMMANDS = {"encode": cmd_encode, "decode": cmd_decode, "pick": cmd_pick,
            "stats": cmd_stats, "guess": cmd_guess}


def main(argv, script_dir=None, cwd=None, environ=None, stdout=None):
    """Run the CLI; returns the exit status."""
    out = stdout or sys.stdout
    if "--help" in argv or "-h" in argv:
        out.write(USAGE)
        return 0
    if not argv:
        sys.stderr.write(USAGE)
        return 2
    ctx = Context(script_dir, cwd, environ, stdout)
    cmd = COMMANDS.get(argv[0])
    try:
        if cmd is None:
            raise CliError("unknown command '%s'" % argv[0])
        cmd(ctx, argv[1:])
    except CliError as e:
        out.flush()
        sys.stderr.write("error: %s\n" % e)
        return e.code
    return 0
