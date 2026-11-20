"""Combinadic (colex) ticket <-> index encoding, validation and formatting."""
from math import comb

from .errors import CliError


def encode(g, whites, bonus):
    """Return the index of a ticket: ``bonus_max * N + (bonus - 1)`` where N is the
    combinadic rank of the sorted whites."""
    xs = sorted(w - 1 for w in whites)
    n = sum(comb(x, i) for i, x in enumerate(xs, start=1))
    return g.bonus_max * n + (bonus - 1)


def decode(g, index):
    """Return ``(whites ascending, bonus)`` for 0 <= index < g.total."""
    n, r = divmod(index, g.bonus_max)
    balls, x = [], g.white_max - 1
    for i in range(g.white_count, 0, -1):
        while comb(x, i) > n:
            x -= 1
        n -= comb(x, i)
        balls.append(x + 1)
        x -= 1
    return sorted(balls), r + 1


def validate_ticket(g, whites, bonus):
    """Raise CliError for the first problem, in spec order: count, range,
    duplicates, missing bonus, bonus range."""
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


def fmt_ticket(g, whites, bonus):
    """``07 19 33 48 62 MB 11``"""
    return " ".join("%02d" % w for w in sorted(whites)) + " %s %02d" % (g.bonus_abbr, bonus)


def group(n):
    """Thousands separators, e.g. 290,472,336."""
    return "{:,}".format(n)


def fmt2(num, den, signed=False):
    """num/den to 2 decimals, half away from zero, integer math only.
    Signed form always carries a sign ("+0.00" for zero)."""
    a = abs(num)
    q = (200 * a + den) // (2 * den)
    s = "%d.%02d" % (q // 100, q % 100)
    if not signed:
        return s
    return ("-" if num < 0 and q != 0 else "+") + s


def notes(g):
    """The two honest NOTE lines printed after picks and guesses."""
    return ["NOTE: Fair picks do not improve your odds. Every ticket is 1 in %s." % group(g.total),
            "NOTE: Hot/cold is for fun and cannot predict draws; uniform is the default mode."]
