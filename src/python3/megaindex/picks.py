"""Ticket pickers: uniform (CSPRNG over the whole index space), weighted modes, guess."""
from .core import decode, encode
from .rng import randbelow

PLAY_LABELS = "ABCDE"
MODES = ("uniform", "hot", "cold", "mixed")


def weighted_take(weights, k):
    """Draw k distinct numbers without replacement; weights: {num: int}."""
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


def make_pick(g, mode, st=None):
    """Return (whites, bonus, index). Weighted modes need a Stats object."""
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
    else:  # mixed: 3 hot, then 2 cold from the rest, then a coin for the bonus
        whites = weighted_take(hot_weights(st.wf, W), 3)
        rest = [n for n in W if n not in whites]
        whites += weighted_take(cold_weights(st.wf, rest), g.white_count - 3)
        weights = hot_weights if randbelow(2) == 0 else cold_weights
        bonus = weighted_take(weights(st.bf, B), 1)[0]
    whites = sorted(whites)
    return whites, bonus, encode(g, whites, bonus)


def make_slip(g, mode, n, st=None):
    """n distinct plays labelled A..E: [(label, whites, bonus, index)]."""
    rows, seen = [], set()
    while len(rows) < n:
        w, b, i = make_pick(g, mode, st)
        if i in seen:
            continue
        seen.add(i)
        rows.append((PLAY_LABELS[len(rows)], w, b, i))
    return rows


def guess_tickets(st):
    """Deterministic HOT / COLD / BALANCED tickets: [(label, whites, bonus, index)]."""
    g = st.g
    hot_w, cold_w, over_w = (st.rank(k, "w") for k in ("hot", "cold", "overdue"))
    hot_b, cold_b, over_b = (st.rank(k, "b") for k in ("hot", "cold", "overdue"))
    bal = hot_w[:3]
    for n in over_w:
        if len(bal) == g.white_count:
            break
        if n not in bal:
            bal.append(n)
    result = []
    for label, w, b in (("HOT", hot_w[:g.white_count], hot_b[0]),
                        ("COLD", cold_w[:g.white_count], cold_b[0]),
                        ("BALANCED", bal, over_b[0])):
        w = sorted(w)
        result.append((label, w, b, encode(g, w, b)))
    return result
