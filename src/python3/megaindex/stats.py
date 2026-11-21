"""Draw-history loading, frequency/gap statistics and rankings (integer math only)."""
import os
import re
import sys

from .core import validate_ticket
from .errors import CliError
from .game import MEGA_MILLIONS

HEADER = "date,w1,w2,w3,w4,w5,mb"
_DATE_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")   # ASCII digits only, whole field
_NUM_RE = re.compile(r"[+-]?[0-9]+")
_EOL_RE = re.compile(r"\r\n|\r|\n")                    # the only line separators
_WS = " \t\r\v\f"                                       # the only whitespace around fields
_BOM = b"\xef\xbb\xbf"


def _walk_up(start, data_file):
    d = start
    while True:
        p = os.path.join(d, "data", data_file)
        if os.path.isfile(p):
            return p
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent


def find_data(data_opt=None, cwd=None, script_dir=None, environ=None, g=MEGA_MILLIONS):
    """Resolve the game's data path: --data, the game's env var (MEGA_INDEX_DATA or
    POWER_INDEX_DATA), walk up from cwd, walk up from the script directory, else error (exit 1)."""
    environ = os.environ if environ is None else environ
    if data_opt is not None:
        return data_opt
    env = environ.get(g.data_env, "")
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
        p = _walk_up(start, g.data_file) if start else None
        if p:
            return p
    raise CliError("data file not found (use --data or %s)" % g.data_env, 1)


def load_draws(path, g):
    """Parse and validate a draws file; returns [(date, whites, mb)] sorted by date."""
    try:
        with open(path, "rb") as fh:
            raw = fh.read()
    except OSError:
        raise CliError("cannot read data file '%s'" % path, 1)
    if raw.startswith(_BOM):
        raw = raw[3:]
    # latin-1: one char per byte, so any non-ASCII byte is just "not a digit / not whitespace".
    lines = _EOL_RE.split(raw.decode("latin-1"))
    if lines[0].strip(_WS) != HEADER:
        raise CliError("bad data file: header must be '%s'" % HEADER, 1)
    draws = []
    for ln, line in enumerate(lines[1:], start=2):
        line = line.strip(_WS)
        if not line:
            continue
        f = [x.strip(_WS) for x in line.split(",")]
        try:
            if len(f) != 7 or not _DATE_RE.fullmatch(f[0]) or not all(_NUM_RE.fullmatch(x) for x in f[1:]):
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
