//! Hand-rolled argument parsing and commands. Output is collected in strings so it can be tested.

use crate::codec::{decode, encode, validate_ticket};
use crate::data::{find_data, load_draws};
use crate::export;
use crate::game::{fmt_ticket, notes, Game};
use crate::picks::{guess_tickets, make_slip, Mode, PLAY_LABELS};
use crate::rng::randbelow;
use crate::stats::Stats;
use crate::{CliError, Result};

pub const USAGE: &str = "mega-index: lottery ticket <-> index encoder/decoder and picker

usage:
  mega-index encode <w1> <w2> <w3> <w4> <w5> --bonus N [--game G]   (--mb N also accepted)
  mega-index decode <index> [--game G]
  mega-index pick [-n 1..5] [--mode uniform|hot|cold|mixed] [--game G] [--export FILE.csv|FILE.json] [--data PATH]
  mega-index stats [--data PATH] [--game G]
  mega-index guess [--data PATH] [--game G]
  mega-index --help

games: megamillions (default; 5 of 1-70 + Mega Ball 1-24), powerball (5 of 1-69 + Powerball 1-26)
data:  --data PATH, else $MEGA_INDEX_DATA (megamillions) / $POWER_INDEX_DATA (powerball), else
       data/draws.csv (data/powerball-draws.csv) found walking up from cwd, then from the program dir
";

pub struct Outcome {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
}

/// Run the CLI on argv (without the program name).
pub fn run(argv: &[String]) -> Outcome {
    if argv.iter().any(|a| a == "--help" || a == "-h") {
        return Outcome { stdout: USAGE.to_string(), stderr: String::new(), code: 0 };
    }
    if argv.is_empty() {
        return Outcome { stdout: String::new(), stderr: USAGE.to_string(), code: 2 };
    }
    let mut out = String::new();
    let rest = &argv[1..];
    let r = match argv[0].as_str() {
        "encode" => cmd_encode(rest, &mut out),
        "decode" => cmd_decode(rest, &mut out),
        "pick" => cmd_pick(rest, &mut out),
        "stats" => cmd_stats(rest, &mut out),
        "guess" => cmd_guess(rest, &mut out),
        other => Err(CliError::usage(format!("unknown command '{}'", other))),
    };
    match r {
        Ok(()) => Outcome { stdout: out, stderr: String::new(), code: 0 },
        Err(e) => Outcome { stdout: out, stderr: format!("error: {}\n", e.msg), code: e.code },
    }
}

type Opts = Vec<(&'static str, String)>;

fn get<'a>(opts: &'a Opts, k: &str) -> Option<&'a str> {
    opts.iter().rev().find(|(n, _)| *n == k).map(|(_, v)| v.as_str())
}

/// `spec` maps option name -> canonical key.
fn parse_args(argv: &[String], spec: &[(&str, &'static str)]) -> Result<(Vec<String>, Opts)> {
    let mut pos = Vec::new();
    let mut opts: Opts = Vec::new();
    let mut i = 0;
    while i < argv.len() {
        let a = &argv[i];
        if a.starts_with('-') && a.chars().count() > 1 {
            let (name, val) = match a.find('=') {
                Some(p) => (&a[..p], Some(a[p + 1..].to_string())),
                None => (a.as_str(), None),
            };
            let canon = spec
                .iter()
                .find(|(n, _)| *n == name)
                .map(|(_, c)| *c)
                .ok_or_else(|| CliError::usage(format!("unknown option '{}'", name)))?;
            let v = match val {
                Some(v) => v,
                None => {
                    if i + 1 >= argv.len() {
                        return Err(CliError::usage(format!("option {} needs a value", name)));
                    }
                    i += 1;
                    argv[i].clone()
                }
            };
            opts.push((canon, v));
        } else {
            pos.push(a.clone());
        }
        i += 1;
    }
    Ok((pos, opts))
}

/// `^[0-9]{1,18}$`
pub fn parse_int(tok: &str) -> Result<u64> {
    if tok.is_empty() || tok.len() > 18 || !tok.bytes().all(|c| c.is_ascii_digit()) {
        return Err(CliError::usage(format!("not an integer: '{}'", tok)));
    }
    Ok(tok.parse().unwrap())
}

fn get_game(opts: &Opts) -> Result<Game> {
    let id = get(opts, "game").unwrap_or("megamillions");
    Game::by_id(id).ok_or_else(|| CliError::usage(format!("unknown game '{}'", id)))
}

fn ticket_lines(out: &mut String, g: &Game, whites: &[u64], bonus: u64, index: u64) {
    out.push_str(&format!("game: {}\nticket: {}\nindex: {}\n", g.name, fmt_ticket(g, whites, bonus), index));
}

fn cmd_encode(argv: &[String], out: &mut String) -> Result<()> {
    let (pos, opts) = parse_args(argv, &[("--bonus", "bonus"), ("--mb", "bonus"), ("--game", "game")])?;
    let g = get_game(&opts)?;
    let whites = pos.iter().map(|p| parse_int(p)).collect::<Result<Vec<u64>>>()?;
    let bonus = match get(&opts, "bonus") {
        Some(b) => Some(parse_int(b)?),
        None => None,
    };
    validate_ticket(&g, &whites, bonus)?;
    let b = bonus.unwrap();
    ticket_lines(out, &g, &whites, b, encode(&g, &whites, b));
    Ok(())
}

fn cmd_decode(argv: &[String], out: &mut String) -> Result<()> {
    let (pos, opts) = parse_args(argv, &[("--game", "game")])?;
    let g = get_game(&opts)?;
    if pos.len() != 1 {
        return Err(CliError::usage("expected exactly one index"));
    }
    let i = parse_int(&pos[0])?;
    if i >= g.total() {
        return Err(CliError::usage(format!("index {} out of range 0-{}", i, g.total() - 1)));
    }
    let (w, b) = decode(&g, i);
    ticket_lines(out, &g, &w, b, i);
    Ok(())
}

fn cmd_pick(argv: &[String], out: &mut String) -> Result<()> {
    let (pos, opts) = parse_args(
        argv,
        &[
            ("-n", "n"),
            ("--plays", "n"),
            ("--mode", "mode"),
            ("--game", "game"),
            ("--export", "export"),
            ("--data", "data"),
        ],
    )?;
    if let Some(p) = pos.first() {
        return Err(CliError::usage(format!("unexpected argument '{}'", p)));
    }
    let g = get_game(&opts)?;
    let n = parse_int(get(&opts, "n").unwrap_or("1"))?;
    if !(1..=5).contains(&n) {
        return Err(CliError::usage("plays must be 1-5"));
    }
    let n = n as usize;
    let mode_s = get(&opts, "mode").unwrap_or("uniform");
    let mode = Mode::parse(mode_s).ok_or_else(|| CliError::usage(format!("unknown mode '{}'", mode_s)))?;
    let exp = get(&opts, "export");
    if let Some(e) = exp {
        if !export::is_csv(e) && !export::is_json(e) {
            return Err(CliError::usage("export path must end in .csv or .json"));
        }
    }
    let st = if mode != Mode::Uniform {
        let path = find_data(&g, get(&opts, "data"))?;
        Some(Stats::new(&g, &load_draws(&path, &g)?))
    } else {
        None
    };
    let mut rng = |m: u64| randbelow(m);
    let rows = make_slip(&g, mode, st.as_ref(), n, &mut rng)?;
    out.push_str(&format!("{} PICK  mode={}  plays={}\n", g.name.to_uppercase(), mode.as_str(), n));
    for (i, t) in rows.iter().enumerate() {
        out.push_str(&format!(
            "{}: {}  index {}\n",
            &PLAY_LABELS[i..i + 1],
            fmt_ticket(&g, &t.whites, t.bonus),
            t.index
        ));
    }
    for line in notes(&g) {
        out.push_str(&line);
        out.push('\n');
    }
    if let Some(path) = exp {
        let text = export::render(path, &rows, &g, mode.as_str(), &export::utc_now_stamp()).unwrap();
        std::fs::write(crate::osarg::path(path), text).map_err(|_| CliError::runtime(format!("cannot write '{}'", path)))?;
        out.push_str(&format!("exported {} plays to {}\n", n, path));
    }
    Ok(())
}

fn load_stats(argv: &[String]) -> Result<Stats> {
    let (pos, opts) = parse_args(argv, &[("--data", "data"), ("--game", "game")])?;
    if let Some(p) = pos.first() {
        return Err(CliError::usage(format!("unexpected argument '{}'", p)));
    }
    let g = get_game(&opts)?;
    let path = find_data(&g, get(&opts, "data"))?;
    Ok(Stats::new(&g, &load_draws(&path, &g)?))
}

fn cmd_stats(argv: &[String], out: &mut String) -> Result<()> {
    out.push_str(&load_stats(argv)?.report());
    Ok(())
}

fn cmd_guess(argv: &[String], out: &mut String) -> Result<()> {
    let st = load_stats(argv)?;
    let g = st.game;
    out.push_str(&format!(
        "{} GUESS  draws={}  {}..{}\n",
        g.name.to_uppercase(),
        st.d,
        st.first_date,
        st.last_date
    ));
    for (i, (label, t)) in guess_tickets(&st).iter().enumerate() {
        out.push_str(&format!(
            "{}: {}  index {}  ({})\n",
            &PLAY_LABELS[i..i + 1],
            fmt_ticket(&g, &t.whites, t.bonus),
            t.index,
            label
        ));
    }
    for line in notes(&g) {
        out.push_str(&line);
        out.push('\n');
    }
    Ok(())
}
