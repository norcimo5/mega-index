"""Draw-history loading, frequency/gap statistics and rankings (integer math only)."""
import os
import re
import sys

from .core import validate_ticket
from .errors import CliError

HEADER = "date,w1,w2,w3,w4,w5,mb"
DATA_ENV = "MEGA_INDEX_DATA"
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _walk_up(start):
    d = start
    while True:
        p = os.path.join(d, "data", "draws.csv")
        if os.path.isfile(p):
            return p
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent


def find_data(data_opt=None, cwd=None, script_dir=None, environ=None):
    """Resolve the draws.csv path: --data, $MEGA_INDEX_DATA, walk up from cwd,
    walk up from the script directory, else error (exit 1)."""
    environ = os.environ if environ is None else environ
    if data_opt is not None:
        return data_opt
    env = environ.get(DATA_ENV, "")
    if env:
        return env
    try:
        if cwd is None:
            cwd = os.getcwd()
    except OSError:          # the working directory was deleted: skip that walk
        cwd = None
    try:
        if script_dir is None:
            script_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
    except OSError:
        script_dir = None
    for start in (cwd, script_dir):
        p = _walk_up(start) if start else None
        if p:
            return p
    raise CliError("data file not found (use --data or MEGA_INDEX_DATA)", 1)


def load_draws(path, g):
    """Parse and validate a draws file; returns [(date, whites, mb)] sorted by date."""
    try:
        # Undecodable bytes become U+FFFD and then fail as a bad header/line
        # instead of escaping as a UnicodeDecodeError traceback.
        with open(path, encoding="utf-8", errors="replace") as fh:
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
            if len(f) != 7 or not _DATE_RE.match(f[0]):
                raise ValueError
            whites = sorted(int(x) for x in f[1:6])
            mb = int(f[6])
            validate_ticket(g, whites, mb)
        except (ValueError, CliError):
            raise CliError("bad data file: line %d" % ln, 1)
        draws.append((f[0], whites, mb))
    if not draws:
        raise CliError("bad data file: no draws", 1)
    draws.sort(key=lambda d: d[0])   # stable
    return draws


def need_history(g):
    if not g.has_history:
        raise CliError("no draw history for %s" % g.name)


class Stats:
    """Frequencies and gaps ("last seen") for whites and bonus balls.
    gap 0 = in the latest draw; never drawn = D."""

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

    def whites(self):
        return range(1, self.g.white_max + 1)

    def bonuses(self):
        return range(1, self.g.bonus_max + 1)

    def rank(self, kind, pool):
        """kind: hot | cold | overdue; pool: 'w' (whites) or 'b' (bonus)."""
        f, gap, nums = ((self.wf, self.wgap, self.whites()) if pool == "w"
                        else (self.bf, self.bgap, self.bonuses()))
        if kind == "hot":
            key = lambda n: (-f[n], gap[n], n)
        elif kind == "cold":
            key = lambda n: (f[n], -gap[n], n)
        elif kind == "overdue":
            key = lambda n: (-gap[n], f[n], n)
        else:
            raise ValueError(kind)
        return sorted(nums, key=key)
