//! Combinadic (colex) encode/decode with u64.

use crate::game::Game;
use crate::{CliError, Result};

/// Exact C(n, k); 0 when n < k.
pub fn comb(n: u64, k: u64) -> u64 {
    if n < k {
        return 0;
    }
    let k = k.min(n - k);
    let mut r: u64 = 1;
    for i in 0..k {
        r = r * (n - i) / (i + 1);
    }
    r
}

/// Validate a ticket in the SPEC order: count, ranges, duplicates, bonus range.
/// `bonus` None means "missing --bonus".
pub fn validate_ticket(g: &Game, whites: &[u64], bonus: Option<u64>) -> Result<()> {
    if whites.len() != g.white_count {
        return Err(CliError::usage(format!(
            "expected {} white balls, got {}",
            g.white_count,
            whites.len()
        )));
    }
    for &w in whites {
        if w < 1 || w > g.white_max {
            return Err(CliError::usage(format!("white ball {} out of range 1-{}", w, g.white_max)));
        }
    }
    for (i, &w) in whites.iter().enumerate() {
        if whites[..i].contains(&w) {
            return Err(CliError::usage(format!("duplicate white ball {}", w)));
        }
    }
    let b = match bonus {
        None => return Err(CliError::usage("missing --bonus")),
        Some(b) => b,
    };
    if b < 1 || b > g.bonus_max {
        return Err(CliError::usage(format!(
            "{} {} out of range 1-{}",
            g.bonus_name, b, g.bonus_max
        )));
    }
    Ok(())
}

/// Encode a (valid) ticket. Whites may be in any order.
pub fn encode(g: &Game, whites: &[u64], bonus: u64) -> u64 {
    let mut xs: Vec<u64> = whites.iter().map(|w| w - 1).collect();
    xs.sort_unstable();
    let n: u64 = xs.iter().enumerate().map(|(i, &x)| comb(x, i as u64 + 1)).sum();
    g.bonus_max * n + (bonus - 1)
}

/// Decode an index in 0..total. Returns (whites ascending, bonus).
pub fn decode(g: &Game, index: u64) -> (Vec<u64>, u64) {
    let mut n = index / g.bonus_max;
    let b = index % g.bonus_max + 1;
    let mut balls = Vec::with_capacity(g.white_count);
    let mut x = g.white_max - 1;
    for i in (1..=g.white_count as u64).rev() {
        while comb(x, i) > n {
            x -= 1;
        }
        n -= comb(x, i);
        balls.push(x + 1);
        x = x.saturating_sub(1);
    }
    balls.sort_unstable();
    (balls, b)
}
