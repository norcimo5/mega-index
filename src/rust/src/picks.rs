//! Pick modes (uniform/hot/cold/mixed), slips, and deterministic guess.

use crate::codec::{decode, encode};
use crate::game::Game;
use crate::stats::{Pool, Rank, Stats};
use crate::Result;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    Uniform,
    Hot,
    Cold,
    Mixed,
}

impl Mode {
    pub fn parse(s: &str) -> Option<Mode> {
        match s {
            "uniform" => Some(Mode::Uniform),
            "hot" => Some(Mode::Hot),
            "cold" => Some(Mode::Cold),
            "mixed" => Some(Mode::Mixed),
            _ => None,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            Mode::Uniform => "uniform",
            Mode::Hot => "hot",
            Mode::Cold => "cold",
            Mode::Mixed => "mixed",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Ticket {
    pub whites: Vec<u64>,
    pub bonus: u64,
    pub index: u64,
}

pub const PLAY_LABELS: &str = "ABCDE";

/// Weighted draw without replacement. `pool` is (number, weight) ascending by number.
pub fn weighted_take(pool: &[(u64, u64)], count: usize, rng: &mut dyn FnMut(u64) -> u64) -> Vec<u64> {
    let mut remaining: Vec<(u64, u64)> = pool.to_vec();
    let mut chosen = Vec::with_capacity(count);
    for _ in 0..count {
        let total: u64 = remaining.iter().map(|&(_, w)| w).sum();
        let r = rng(total);
        let mut acc = 0;
        let mut at = remaining.len() - 1;
        for (i, &(_, w)) in remaining.iter().enumerate() {
            acc += w;
            if r < acc {
                at = i;
                break;
            }
        }
        chosen.push(remaining.remove(at).0);
    }
    chosen
}

pub fn hot_weights(f: &[i64], nums: &[u64]) -> Vec<(u64, u64)> {
    nums.iter().map(|&n| (n, (f[n as usize] + 1) as u64)).collect()
}

pub fn cold_weights(f: &[i64], nums: &[u64]) -> Vec<(u64, u64)> {
    let mx = nums.iter().map(|&n| f[n as usize]).max().unwrap_or(0);
    nums.iter().map(|&n| (n, (mx - f[n as usize] + 1) as u64)).collect()
}

pub fn make_pick(g: &Game, mode: Mode, st: Option<&Stats>, rng: &mut dyn FnMut(u64) -> u64) -> Ticket {
    if mode == Mode::Uniform {
        let i = rng(g.total());
        let (w, b) = decode(g, i);
        return Ticket { whites: w, bonus: b, index: i };
    }
    let st = st.expect("weighted modes need draw statistics");
    let wn: Vec<u64> = (1..=g.white_max).collect();
    let bn: Vec<u64> = (1..=g.bonus_max).collect();
    let (mut whites, bonus);
    match mode {
        Mode::Hot => {
            whites = weighted_take(&hot_weights(&st.wf, &wn), g.white_count, rng);
            bonus = weighted_take(&hot_weights(&st.bf, &bn), 1, rng)[0];
        }
        Mode::Cold => {
            whites = weighted_take(&cold_weights(&st.wf, &wn), g.white_count, rng);
            bonus = weighted_take(&cold_weights(&st.bf, &bn), 1, rng)[0];
        }
        _ => {
            whites = weighted_take(&hot_weights(&st.wf, &wn), 3, rng);
            let rest: Vec<u64> = wn.iter().copied().filter(|n| !whites.contains(n)).collect();
            whites.extend(weighted_take(&cold_weights(&st.wf, &rest), g.white_count - 3, rng));
            bonus = if rng(2) == 0 {
                weighted_take(&hot_weights(&st.bf, &bn), 1, rng)[0]
            } else {
                weighted_take(&cold_weights(&st.bf, &bn), 1, rng)[0]
            };
        }
    }
    whites.sort_unstable();
    let index = encode(g, &whites, bonus);
    Ticket { whites, bonus, index }
}

/// A slip of `n` distinct tickets (a repeat index is discarded and redrawn).
pub fn make_slip(
    g: &Game,
    mode: Mode,
    st: Option<&Stats>,
    n: usize,
    rng: &mut dyn FnMut(u64) -> u64,
) -> Result<Vec<Ticket>> {
    let mut rows: Vec<Ticket> = Vec::new();
    while rows.len() < n {
        let t = make_pick(g, mode, st, rng);
        if rows.iter().any(|r| r.index == t.index) {
            continue;
        }
        rows.push(t);
    }
    Ok(rows)
}

/// Deterministic guess tickets: (label, ticket) for HOT, COLD, BALANCED.
pub fn guess_tickets(st: &Stats) -> Vec<(&'static str, Ticket)> {
    let g = &st.game;
    let hot_w = st.rank(Rank::Hot, Pool::White);
    let cold_w = st.rank(Rank::Cold, Pool::White);
    let over_w = st.rank(Rank::Overdue, Pool::White);
    let hot_b = st.rank(Rank::Hot, Pool::Bonus);
    let cold_b = st.rank(Rank::Cold, Pool::Bonus);
    let over_b = st.rank(Rank::Overdue, Pool::Bonus);
    let mut bal: Vec<u64> = hot_w[..3].to_vec();
    for &n in &over_w {
        if bal.len() == g.white_count {
            break;
        }
        if !bal.contains(&n) {
            bal.push(n);
        }
    }
    let specs: [(&'static str, Vec<u64>, u64); 3] = [
        ("HOT", hot_w[..5].to_vec(), hot_b[0]),
        ("COLD", cold_w[..5].to_vec(), cold_b[0]),
        ("BALANCED", bal, over_b[0]),
    ];
    specs
        .into_iter()
        .map(|(label, mut w, b)| {
            w.sort_unstable();
            let index = encode(g, &w, b);
            (label, Ticket { whites: w, bonus: b, index })
        })
        .collect()
}
