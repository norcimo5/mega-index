//! Draw history loading and data path discovery.

use crate::game::Game;
use crate::{CliError, Result};
use std::path::{Path, PathBuf};

pub const HEADER: &str = "date,w1,w2,w3,w4,w5,mb";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Draw {
    pub date: String,
    pub whites: Vec<u64>,
    pub bonus: u64,
}

/// Split like Python's str.splitlines (the common separators).
fn split_lines(s: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut start = 0;
    let b = s.as_bytes();
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'\n' | 0x0b | 0x0c | 0x1c | 0x1d | 0x1e => {
                out.push(&s[start..i]);
                i += 1;
                start = i;
            }
            b'\r' => {
                out.push(&s[start..i]);
                i += 1;
                if i < b.len() && b[i] == b'\n' {
                    i += 1;
                }
                start = i;
            }
            _ => i += 1,
        }
    }
    if start < b.len() {
        out.push(&s[start..]);
    }
    out
}

fn parse_field(s: &str) -> Option<u64> {
    let t = s.trim();
    let t = t.strip_prefix('+').unwrap_or(t);
    if t.is_empty() || !t.bytes().all(|c| c.is_ascii_digit()) {
        return None;
    }
    t.parse().ok()
}

fn date_ok(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10
        && b.iter().enumerate().all(|(i, &c)| if i == 4 || i == 7 { c == b'-' } else { c.is_ascii_digit() })
}

/// Parse CSV text per the SPEC loader rules.
pub fn parse_draws(text: &str, g: &Game) -> Result<Vec<Draw>> {
    let lines = split_lines(text);
    if lines.is_empty() || lines[0].trim() != HEADER {
        return Err(CliError::runtime(format!("bad data file: header must be '{}'", HEADER)));
    }
    let mut draws = Vec::new();
    for (idx, raw) in lines.iter().enumerate().skip(1) {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        let bad = || CliError::runtime(format!("bad data file: line {}", idx + 1));
        let f: Vec<&str> = line.split(',').collect();
        if f.len() != 7 || !date_ok(f[0]) {
            return Err(bad());
        }
        let mut whites = Vec::new();
        for x in &f[1..6] {
            whites.push(parse_field(x).ok_or_else(bad)?);
        }
        whites.sort_unstable();
        let mb = parse_field(f[6]).ok_or_else(bad)?;
        crate::codec::validate_ticket(g, &whites, Some(mb)).map_err(|_| bad())?;
        draws.push(Draw { date: f[0].to_string(), whites, bonus: mb });
    }
    if draws.is_empty() {
        return Err(CliError::runtime("bad data file: no draws"));
    }
    draws.sort_by(|a, b| a.date.cmp(&b.date)); // stable
    Ok(draws)
}

pub fn load_draws(path: &str, g: &Game) -> Result<Vec<Draw>> {
    let bytes = std::fs::read(crate::osarg::path(path))
        .map_err(|_| CliError::runtime(format!("cannot read data file '{}'", path)))?;
    parse_draws(&String::from_utf8_lossy(&bytes), g)
}

/// Walk up from `start` looking for `<dir>/data/draws.csv`.
pub fn walk_up(start: &Path) -> Option<PathBuf> {
    let mut d: &Path = start;
    loop {
        let p = d.join("data").join("draws.csv");
        if p.is_file() {
            return Some(p);
        }
        match d.parent() {
            Some(parent) if parent != d => d = parent,
            _ => return None,
        }
    }
}

/// Data path resolution (testable): --data, env, cwd walk, executable-dir walk.
pub fn resolve_data_path(
    opt: Option<&str>,
    env: Option<&str>,
    cwd: Option<&Path>,
    exe_dir: Option<&Path>,
) -> Result<String> {
    if let Some(p) = opt {
        return Ok(p.to_string());
    }
    if let Some(e) = env {
        if !e.is_empty() {
            return Ok(e.to_string());
        }
    }
    for start in [cwd, exe_dir].into_iter().flatten() {
        if let Some(p) = walk_up(start) {
            return Ok(crate::osarg::decode(p.as_os_str()));
        }
    }
    Err(CliError::runtime("data file not found (use --data or MEGA_INDEX_DATA)"))
}

/// Resolve using the real process environment.
pub fn find_data(opt: Option<&str>) -> Result<String> {
    let env = std::env::var_os("MEGA_INDEX_DATA").map(|v| crate::osarg::decode(&v));
    let cwd = std::env::current_dir().ok();
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| std::fs::canonicalize(&p).ok().or(Some(p)))
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    resolve_data_path(opt, env.as_deref(), cwd.as_deref(), exe_dir.as_deref())
}
