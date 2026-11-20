# INDEX//PROTOCOL: Main Ideas

*Summary of `Lotto-Index-Protocol-Guide-Light.pdf` (Field Manual Rev 1.0, 2026-11-18).*

## Goal

Give every lotto ticket (5 white balls from 1–70, plus a Mega Ball from 1–24) its own whole-number **index**. No two tickets share an index and no index goes unused, so the pairing is a **bijection**.

- **Encode** (rank): ticket → index
- **Decode** (unrank): index → ticket
- Payoff: pick a uniform random index, decode it, and you get a perfectly fair random ticket with no rejection sampling.

## The ticket space

| Quantity | Value |
|---|---|
| White-ball combinations C(70,5) | 12,103,014 |
| Mega Ball choices | 24 |
| Total tickets 24·C(70,5) | 290,472,336 |
| Index range | 0 … 290,472,335 |

C(n,k) = n! / (k!(n−k)!), and C(n,k) = 0 when n < k. That zero rule matters for the formulas below.

## Why plain base-70 fails

If you treat the sorted balls (shifted to 0–69) as base-70 digits, you get 70⁵ = 1,680,700,000 slots, but only 12.1M of them are real tickets. That leaves **99.28% of the range as gaps**, so a random value usually lands on nothing and has to be thrown away and redrawn. The fix is "bent" place values: binomial coefficients.

## Combinatorial number system (combinadics)

**Theorem:** for fixed k, every N with 0 ≤ N < C(n,k) has exactly one representation

```
N = C(x1,1) + C(x2,2) + … + C(xk,k),   0 ≤ x1 < x2 < … < xk ≤ n−1
```

This lists k-subsets in **colex order** (sorted by the largest element first, then the next largest, and so on).

- **Why it works:** C(xk,k) counts every set whose largest element is below xk, and all of those come earlier in the list. That makes it the start of the block. The lower terms then rank the remaining elements inside that block in the same way.
- **No overflow (Pascal's rule):** C(x+1,i) − C(x,i) = C(x,i−1), which is one more than the most the lower positions can add up to. It's the same reason 999 < 1000 in base 10.
- **Key difference from a radix:** radix place values bⁱ depend only on the position. Combinadic place values C(x,i) depend on both the position and the digit, and that is what removes the gaps.
- **Warm-up:** 2 from 1–5 packs into 0–9, with triangular-number row starts 0, 1, 3, 6. 3 from 6 packs into 0–19.
- **Block sizes:** the block whose largest ball is c holds C(c−1,4) sets. They sum to C(70,5) by the hockey-stick identity. The largest ball does most of the work: C(69,5) = 11,238,513, while C(69,1) = 69.

## Encoding

1. Sort the balls ascending and shift each down by one: xᵢ = cᵢ − 1.
2. Compute N = Σ C(xᵢ, i) for i = 1..5, so the i-th smallest ball chooses i.
3. Add the Mega Ball as a mixed-radix digit: **I = 24·N + (m − 1)**.

**Example:** 7·19·33·48·62 MB 11 gives N = 6 + 153 + 4,960 + 178,365 + 5,949,147 = 6,132,631. Then I = 24·6,132,631 + 10 = **147,183,154**.

**Endpoints:** 1-2-3-4-5 MB 1 encodes to 0. 66-67-68-69-70 MB 24 encodes to 290,472,335.

## Decoding (greedy)

1. Split off the Mega Ball: m = (I mod 24) + 1 and N = ⌊I / 24⌋.
2. For i = 5 down to 1, find the largest x with C(x,i) ≤ N. Subtract C(x,i) from N, record ball x+1, then start the next search at x−1.
3. The choice at each step is forced, so there are no ties and no guesses. N reaches 0 at the end.

**Example:** 200,000,000 decodes to 8·24·37·38·66 MB 9.

## Random tickets

- Use `secrets.randbelow(290472336)` (cryptographic randomness), then decode the result.
- This gives a uniform ticket with no bias and no human patterns like birthdays crowding 1–31. An index is a compact, exact way to store a ticket.
- **Honest note:** this does not improve your odds. Every ticket is still 1 in 290,472,336.

## Common mistakes

- Not sorting the balls before encoding.
- Not shifting to 0-based values (x = c − 1).
- Restarting every decode search at 69. Each search has to start just below the previous x.
- Off-by-one errors with `random.randint`. `randbelow(n)` already returns 0..n−1.

## Reference implementation (from the manual)

```python
from math import comb
import secrets

K, TOP, MEGA = 5, 70, 24
SIZE = comb(TOP, K) * MEGA          # 290,472,336

def encode(balls, mega):
    xs = sorted(b - 1 for b in balls)
    n = sum(comb(x, i) for i, x in enumerate(xs, start=1))
    return MEGA * n + (mega - 1)

def decode(index):
    n, r = divmod(index, MEGA)
    mega = r + 1
    balls, x = [], TOP - 1
    for i in range(K, 0, -1):
        while comb(x, i) > n:
            x -= 1
        n -= comb(x, i)
        balls.append(x + 1)
        x -= 1
    return sorted(balls), mega

def random_ticket():
    return decode(secrets.randbelow(SIZE))
```

The manual says this code was checked on 300k random tickets, 300k random indexes, and both endpoints.
