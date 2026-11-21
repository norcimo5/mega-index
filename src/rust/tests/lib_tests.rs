use mega_index::cli::run;
use mega_index::codec::{comb, decode, encode, validate_ticket};
use mega_index::data::{parse_draws, resolve_data_path};
use mega_index::export::{format_utc, render};
use mega_index::game::{group, MEGA_MILLIONS as MM, POWERBALL as PB};
use mega_index::picks::{cold_weights, hot_weights, make_pick, weighted_take, Mode, Ticket};
use mega_index::rng::{randbelow, randbelow_with};
use mega_index::stats::{fmt2, fmt2_signed, Stats};
use std::path::PathBuf;

fn args(s: &str) -> Vec<String> {
    s.split_whitespace().map(String::from).collect()
}

fn golden(name: &str) -> String {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/golden").join(name);
    std::fs::read_to_string(p).unwrap()
}

fn golden_stats() -> Stats {
    let draws = parse_draws(&golden("draws.csv"), &MM).unwrap();
    Stats::new(&MM, &draws)
}

#[test]
fn totals() {
    assert_eq!(MM.total(), 290_472_336);
    assert_eq!(PB.total(), 292_201_338);
    assert_eq!(comb(70, 5), 12_103_014);
    assert_eq!(comb(3, 5), 0);
    assert_eq!(group(290_472_336), "290,472,336");
}

#[test]
fn pdf_vectors() {
    let v: [([u64; 5], u64, u64); 4] = [
        ([7, 19, 33, 48, 62], 11, 147183154),
        ([8, 24, 37, 38, 66], 9, 200000000),
        ([1, 2, 3, 4, 5], 1, 0),
        ([66, 67, 68, 69, 70], 24, 290472335),
    ];
    for (w, b, i) in v {
        assert_eq!(encode(&MM, &w, b), i);
        assert_eq!(decode(&MM, i), (w.to_vec(), b));
    }
}

#[test]
fn endpoints() {
    assert_eq!(decode(&MM, 0), (vec![1, 2, 3, 4, 5], 1));
    assert_eq!(decode(&MM, MM.total() - 1), (vec![66, 67, 68, 69, 70], 24));
    assert_eq!(decode(&PB, 0), (vec![1, 2, 3, 4, 5], 1));
    assert_eq!(decode(&PB, 292_201_337), (vec![65, 66, 67, 68, 69], 26));
    assert_eq!(encode(&PB, &[65, 66, 67, 68, 69], 26), 292_201_337);
}

#[test]
fn golden_vectors() {
    for line in golden("vectors.txt").lines() {
        if line.starts_with('#') || line.trim().is_empty() {
            continue;
        }
        let f: Vec<u64> = line.split_whitespace().skip(1).map(|x| x.parse().unwrap()).collect();
        let g = if line.starts_with("powerball") { PB } else { MM };
        assert_eq!(encode(&g, &f[..5], f[5]), f[6], "{}", line);
        assert_eq!(decode(&g, f[6]), (f[..5].to_vec(), f[5]), "{}", line);
    }
}

fn check_valid(g: &mega_index::game::Game, w: &[u64], b: u64) {
    assert_eq!(w.len(), 5);
    assert!(w.windows(2).all(|p| p[0] < p[1]), "{:?}", w);
    assert!(w[0] >= 1 && *w.last().unwrap() <= g.white_max);
    assert!(b >= 1 && b <= g.bonus_max);
}

#[test]
fn random_round_trips() {
    for g in [MM, PB] {
        for _ in 0..100_000 {
            let i = randbelow(g.total());
            let (w, b) = decode(&g, i);
            check_valid(&g, &w, b);
            assert_eq!(encode(&g, &w, b), i);
        }
        // decode(encode(t)) == t on random tickets (shuffled input order)
        for _ in 0..20_000 {
            let (w, b) = decode(&g, randbelow(g.total()));
            let mut shuffled = w.clone();
            shuffled.reverse();
            shuffled.swap(0, 2);
            assert_eq!(decode(&g, encode(&g, &shuffled, b)), (w, b));
        }
    }
}

#[test]
fn validation_errors() {
    let e = |w: &[u64], b: Option<u64>| validate_ticket(&MM, w, b).unwrap_err();
    assert_eq!(e(&[1, 2, 3, 4], Some(1)).msg, "expected 5 white balls, got 4");
    assert_eq!(e(&[1, 2, 3, 4, 71], Some(1)).msg, "white ball 71 out of range 1-70");
    assert_eq!(e(&[0, 2, 3, 4, 5], Some(1)).msg, "white ball 0 out of range 1-70");
    assert_eq!(e(&[1, 2, 2, 4, 5], Some(1)).msg, "duplicate white ball 2");
    assert_eq!(e(&[1, 2, 3, 4, 5], None).msg, "missing --bonus");
    assert_eq!(e(&[1, 2, 3, 4, 5], Some(25)).msg, "Mega Ball 25 out of range 1-24");
    assert_eq!(validate_ticket(&PB, &[1, 2, 3, 4, 5], Some(27)).unwrap_err().msg, "Powerball 27 out of range 1-26");
}

#[test]
fn cli_errors_and_exit_codes() {
    let r = run(&args("decode 290472336"));
    assert_eq!((r.code, r.stderr.as_str(), r.stdout.as_str()), (2, "error: index 290472336 out of range 0-290472335\n", ""));
    let r = run(&args("decode 292201338 --game powerball"));
    assert_eq!(r.stderr, "error: index 292201338 out of range 0-292201337\n");
    assert_eq!(run(&args("decode")).stderr, "error: expected exactly one index\n");
    assert_eq!(run(&args("decode 1 2")).code, 2);
    assert_eq!(run(&args("decode -5")).stderr, "error: unknown option '-5'\n");
    assert_eq!(run(&args("decode +5")).stderr, "error: not an integer: '+5'\n");
    assert_eq!(run(&args("decode 1234567890123456789")).stderr, "error: not an integer: '1234567890123456789'\n");
    assert_eq!(run(&args("frobnicate")).stderr, "error: unknown command 'frobnicate'\n");
    assert_eq!(run(&args("encode 1 2 3 4 5 --bonus")).stderr, "error: option --bonus needs a value\n");
    assert_eq!(run(&args("encode 1 2 3 4 5 --wat")).stderr, "error: unknown option '--wat'\n");
    assert_eq!(run(&args("pick -n 6")).stderr, "error: plays must be 1-5\n");
    assert_eq!(run(&args("pick x")).stderr, "error: unexpected argument 'x'\n");
    assert_eq!(run(&args("pick --mode lucky")).stderr, "error: unknown mode 'lucky'\n");
    assert_eq!(run(&args("pick --export a.txt")).stderr, "error: export path must end in .csv or .json\n");
    let r = run(&args("stats --data /no/such/file.csv"));
    assert_eq!((r.code, r.stderr.as_str()), (1, "error: cannot read data file '/no/such/file.csv'\n"));
    assert_eq!(run(&[]).code, 2);
    assert_eq!(run(&args("encode -h")).code, 0);
    // --opt=value and --mb alias, unsorted whites
    let r = run(&args("encode 62 48 33 19 7 --mb=11"));
    assert_eq!(r.stdout, "game: Mega Millions\nticket: 07 19 33 48 62 MB 11\nindex: 147183154\n");
}

#[test]
fn bad_data_files() {
    let h = "date,w1,w2,w3,w4,w5,mb\n";
    assert_eq!(parse_draws("nope\n", &MM).unwrap_err().msg, "bad data file: header must be 'date,w1,w2,w3,w4,w5,mb'");
    assert_eq!(parse_draws(h, &MM).unwrap_err().msg, "bad data file: no draws");
    let bad = format!("{}\n2025-04-08,1,2,3,4,5,25\n", h);
    assert_eq!(parse_draws(&bad, &MM).unwrap_err().msg, "bad data file: line 3");
    let bad = format!("{}2025-04-08,1,2,3,4,4,5\n", h);
    assert_eq!(parse_draws(&bad, &MM).unwrap_err().code, 1);
    let ok = format!("{}2025-04-10,5,4,3,2,1,2\n\n2025-04-08,1,2,3,4,5,1\n", h);
    let d = parse_draws(&ok, &MM).unwrap();
    assert_eq!(d[0].date, "2025-04-08");
    assert_eq!(d[1].whites, vec![1, 2, 3, 4, 5]);
}

#[test]
fn data_file_parsing_is_ascii_only() {
    let h = "date,w1,w2,w3,w4,w5,mb";
    let row = "2025-04-08,1,2,3,4,5,6";
    let msg = |t: &str| parse_draws(t, &MM).unwrap_err().msg;
    // a leading UTF-8 BOM is accepted (and only at the start of the file)
    assert_eq!(parse_draws(&format!("\u{feff}{}\n{}\n", h, row), &MM).unwrap().len(), 1);
    assert_eq!(msg(&format!("{}\n\u{feff}{}\n", h, row)), "bad data file: line 2");
    // bare CR, CRLF and mixed separators; ASCII whitespace around fields
    assert_eq!(parse_draws(&format!("{}\r{}\r", h, row), &MM).unwrap().len(), 1);
    assert_eq!(parse_draws(&format!("{}\r\n{}\r\n", h, row), &MM).unwrap().len(), 1);
    assert_eq!(parse_draws(&format!("{}\r{}\r\r{}\n2025-04-09,1,2,3,4,5,7", h, row, row), &MM).unwrap().len(), 3);
    assert_eq!(msg(&format!("{}\r\r2025-04-08,1,2\r,3,4,5,6\r", h)), "bad data file: line 3");
    assert_eq!(parse_draws(&format!("{}\n \t2025-04-08 , +1,2 ,3,\x0b4,5\x0c,6 \n", h), &MM).unwrap().len(), 1);
    // NBSP, other Unicode whitespace, NEL, U+2028 and \x1c-\x1f are not whitespace or separators
    for bad in ["\u{a0}2025-04-08,1,2,3,4,5,6", "2025-04-08,1,2,3,4,5,\u{a0}6", "2025-04-08,1,2,3,4,5,6\u{85}",
                "2025-04-08,1,2,3,4,5,6\u{2028}", "2025-04-08,1,2,3,4,5,6\x1f", "\x1c2025-04-08,1,2,3,4,5,6",
                "2025-04-08,1,2,3,4,5,6\u{3000}"] {
        assert_eq!(msg(&format!("{}\n{}\n", h, bad)), "bad data file: line 2", "{:?}", bad);
    }
    // header with NBSP is a header error
    assert_eq!(msg(&format!("{}\u{a0}\n{}\n", h, row)), "bad data file: header must be 'date,w1,w2,w3,w4,w5,mb'");
    // Unicode digits (Arabic-Indic, fullwidth) and underscores are not numbers or dates
    for bad in ["2025-04-08,1,2,3,4,5,\u{666}", "2025-04-08,1,2,3,4,5,\u{ff16}", "2025-04-08,1_0,2,3,4,5,6",
                "2025-04-08,1,2,3,4,5,6_", "\u{666}025-04-08,1,2,3,4,5,6", "2025-04-08,1,2,3,4,5,+-6"] {
        assert_eq!(msg(&format!("{}\n{}\n", h, bad)), "bad data file: line 2", "{:?}", bad);
    }
    // invalid UTF-8 bytes are just a bad line (via load_draws's lossy decode)
    assert_eq!(msg(&format!("{}\n{}\n{}\n", h, row, String::from_utf8_lossy(b"\xff"))), "bad data file: line 3");
}

#[test]
fn randbelow_range_and_distribution() {
    for n in [1u64, 2, 3, 24, 70, 290_472_336, 4_000_000_000, 1 << 32] {
        for _ in 0..1000 {
            assert!(randbelow(n) < n);
        }
    }
    let mut buckets = [0u32; 24];
    for _ in 0..240_000 {
        buckets[randbelow(24) as usize] += 1;
    }
    for b in buckets {
        assert!((9500..=10500).contains(&b), "{:?}", buckets);
    }
}

#[test]
fn randbelow_rejects_biased_tail() {
    // n=3: limit = 2^32 - 1; u = 2^32-1 must be rejected.
    let mut seq = vec![u32::MAX, 7].into_iter();
    assert_eq!(randbelow_with(3, || seq.next().unwrap()), 7 % 3);
}

#[test]
fn fmt2_cases() {
    assert_eq!(fmt2(1, 8), "0.13"); // 0.125 rounds away
    assert_eq!(fmt2_signed(-1, 8), "-0.13");
    assert_eq!(fmt2_signed(-1, 1000), "+0.00");
    assert_eq!(fmt2_signed(0, 7), "+0.00");
    assert_eq!(fmt2(2, 3), "0.67");
}

#[test]
fn weighted_picks_valid_and_distinct() {
    let st = golden_stats();
    let mut rng = |n: u64| randbelow(n);
    for mode in [Mode::Hot, Mode::Cold, Mode::Mixed] {
        for _ in 0..2000 {
            let t: Ticket = make_pick(&MM, mode, Some(&st), &mut rng);
            check_valid(&MM, &t.whites, t.bonus);
            assert_eq!(encode(&MM, &t.whites, t.bonus), t.index);
        }
    }
    let wn: Vec<u64> = (1..=70).collect();
    let taken = weighted_take(&hot_weights(&st.wf, &wn), 5, &mut rng);
    let mut s = taken.clone();
    s.sort_unstable();
    s.dedup();
    assert_eq!(s.len(), 5);
    // cold weights are all >= 1
    assert!(cold_weights(&st.wf, &wn).iter().all(|&(_, w)| w >= 1));
    // deterministic rng: r=0 always takes the first remaining number
    let mut zero = |_n: u64| 0;
    assert_eq!(weighted_take(&hot_weights(&st.wf, &wn), 3, &mut zero), vec![1, 2, 3]);
}

#[test]
fn powerball_weighted_picks() {
    let draws = parse_draws(&golden("powerball-draws.csv"), &PB).unwrap();
    assert_eq!(draws.len(), 1435);
    let st = Stats::new(&PB, &draws);
    let mut rng = |n: u64| randbelow(n);
    for mode in [Mode::Hot, Mode::Cold, Mode::Mixed] {
        for _ in 0..2000 {
            let t: Ticket = make_pick(&PB, mode, Some(&st), &mut rng);
            check_valid(&PB, &t.whites, t.bonus);
            assert_eq!(encode(&PB, &t.whites, t.bonus), t.index);
        }
    }
    // mixed over a 69-ball pool: rng=0 takes 1,2,3 hot then the first 2 remaining cold numbers
    let mut zero = |_n: u64| 0;
    let t = make_pick(&PB, Mode::Hot, Some(&st), &mut zero);
    assert_eq!((t.whites, t.bonus), (vec![1, 2, 3, 4, 5], 1));
    let r = run(&args("pick -n 3 --mode mixed --game powerball --data ../../tests/golden/powerball-draws.csv"));
    assert_eq!(r.code, 0);
    assert!(r.stdout.starts_with("POWERBALL PICK  mode=mixed  plays=3\n"));
    assert!(r.stdout.lines().nth(1).unwrap().contains(" PB "));
}

#[test]
fn powerball_stats_and_guess() {
    let draws = parse_draws(&golden("powerball-draws.csv"), &PB).unwrap();
    assert_eq!(Stats::new(&PB, &draws).report(), golden("pb_stats.txt"));
    let r = run(&args("guess --game powerball --data ../../tests/golden/powerball-draws.csv"));
    assert_eq!((r.code, r.stdout.as_str()), (0, golden("pb_guess.txt").as_str()));
    let r = run(&args("stats --game powerball --data ../../tests/golden/powerball-draws.csv"));
    assert_eq!(r.stdout, golden("pb_stats.txt"));
    // a Mega Millions file is wrong data for Powerball (first white 70), and vice versa
    let r = run(&args("stats --game powerball --data ../../tests/golden/draws.csv"));
    assert_eq!(r.code, 1);
    assert!(r.stderr.starts_with("error: bad data file: line "));
    let r = run(&args("stats --data ../../tests/golden/powerball-draws.csv"));
    assert_eq!(r.code, 1);
}

#[test]
fn golden_stats_and_guess() {
    let st = golden_stats();
    assert_eq!(st.report(), golden("stats.txt"));
    let r = run(&args("guess --data ../../tests/golden/draws.csv"));
    assert_eq!(r.stdout, golden("guess.txt"));
}

#[test]
fn slip_and_export_format() {
    let r = run(&args("pick -n 5 --game powerball"));
    assert_eq!(r.code, 0);
    assert!(r.stdout.starts_with("POWERBALL PICK  mode=uniform  plays=5\n"));
    assert!(r.stdout.contains("NOTE: Fair picks do not improve your odds. Every ticket is 1 in 292,201,338.\n"));
    let rows = vec![
        Ticket { whites: vec![3, 21, 43, 49, 57], bonus: 14, index: 96625645 },
        Ticket { whites: vec![1, 2, 3, 4, 5], bonus: 1, index: 0 },
    ];
    let stamp = "2026-11-20T22:36:10Z";
    let csv = render("x.CSV", &rows, &MM, "uniform", stamp).unwrap();
    assert_eq!(
        csv,
        "play,mode,w1,w2,w3,w4,w5,bonus,index,game,generated_at\n\
         A,uniform,3,21,43,49,57,14,96625645,megamillions,2026-11-20T22:36:10Z\n\
         B,uniform,1,2,3,4,5,1,0,megamillions,2026-11-20T22:36:10Z\n"
    );
    let json = render("x.json", &rows, &MM, "hot", stamp).unwrap();
    assert_eq!(
        json,
        "[\n  {\"play\": \"A\", \"mode\": \"hot\", \"w1\": 3, \"w2\": 21, \"w3\": 43, \"w4\": 49, \"w5\": 57, \"bonus\": 14, \"index\": 96625645, \"game\": \"megamillions\", \"generated_at\": \"2026-11-20T22:36:10Z\"},\n  {\"play\": \"B\", \"mode\": \"hot\", \"w1\": 1, \"w2\": 2, \"w3\": 3, \"w4\": 4, \"w5\": 5, \"bonus\": 1, \"index\": 0, \"game\": \"megamillions\", \"generated_at\": \"2026-11-20T22:36:10Z\"}\n]\n"
    );
    assert!(render("x.txt", &rows, &MM, "hot", stamp).is_none());
    assert_eq!(format_utc(0), "1970-01-01T00:00:00Z");
    assert_eq!(format_utc(1795214170), "2026-11-20T22:36:10Z");
    assert_eq!(format_utc(951_782_400), "2000-02-29T00:00:00Z");
}

#[test]
fn export_writes_file_and_failure_keeps_stdout() {
    let dir = std::env::temp_dir().join(format!("mega-index-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let p = dir.join("p.csv");
    let r = run(&["pick".into(), "-n".into(), "2".into(), "--export".into(), p.to_string_lossy().into_owned()]);
    assert_eq!(r.code, 0);
    assert!(r.stdout.ends_with(&format!("exported 2 plays to {}\n", p.display())));
    assert_eq!(std::fs::read_to_string(&p).unwrap().lines().count(), 3);
    let bad = dir.join("no-such-dir").join("p.json");
    let r = run(&["pick".into(), "--export".into(), bad.to_string_lossy().into_owned()]);
    assert_eq!(r.code, 1);
    assert_eq!(r.stderr, format!("error: cannot write '{}'\n", bad.display()));
    assert!(r.stdout.contains("NOTE:") && !r.stdout.contains("exported"));
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn data_path_discovery() {
    let root = std::env::temp_dir().join(format!("mega-index-disc-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    let proj = root.join("proj");
    let deep_cwd = root.join("elsewhere/a/b");
    let exe_dir = proj.join("src/rust/target/release");
    std::fs::create_dir_all(proj.join("data")).unwrap();
    std::fs::create_dir_all(&deep_cwd).unwrap();
    std::fs::create_dir_all(&exe_dir).unwrap();
    let csv = proj.join("data/draws.csv");
    std::fs::write(&csv, "x").unwrap();
    let csv_s = csv.to_string_lossy().into_owned();
    let other = root.join("elsewhere/data");
    // 1. --data wins over env
    assert_eq!(resolve_data_path(&MM, Some("A"), Some("B"), Some(&deep_cwd), None).unwrap(), "A");
    // 2. env wins over walks; empty env ignored
    assert_eq!(resolve_data_path(&MM, None, Some("B"), Some(&proj), None).unwrap(), "B");
    // 3. walk up from cwd
    std::fs::create_dir_all(&other).unwrap();
    assert!(resolve_data_path(&MM, None, Some(""), Some(&deep_cwd), None).is_err());
    let sub = proj.join("src/rust");
    assert_eq!(resolve_data_path(&MM, None, None, Some(&sub), None).unwrap(), csv_s);
    // 4. walk up from executable dir when cwd finds nothing
    assert_eq!(resolve_data_path(&MM, None, None, Some(&deep_cwd), Some(&exe_dir)).unwrap(), csv_s);
    // 5. not found
    let e = resolve_data_path(&MM, None, None, Some(&deep_cwd), None).unwrap_err();
    assert_eq!((e.code, e.msg.as_str()), (1, "data file not found (use --data or MEGA_INDEX_DATA)"));
    // Powerball: own file name and own env var, never MEGA_INDEX_DATA
    let pcsv = proj.join("data/powerball-draws.csv");
    std::fs::write(&pcsv, "x").unwrap();
    let pcsv_s = pcsv.to_string_lossy().into_owned();
    assert_eq!(resolve_data_path(&PB, None, None, Some(&sub), None).unwrap(), pcsv_s);
    assert_eq!(resolve_data_path(&PB, None, None, Some(&deep_cwd), Some(&exe_dir)).unwrap(), pcsv_s);
    assert_eq!(resolve_data_path(&PB, None, Some("P"), Some(&sub), None).unwrap(), "P");
    std::fs::remove_file(&pcsv).unwrap();
    let e = resolve_data_path(&PB, None, None, Some(&sub), None).unwrap_err();
    assert_eq!((e.code, e.msg.as_str()), (1, "data file not found (use --data or POWER_INDEX_DATA)"));
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn power_index_data_env_is_per_game() {
    // spawn the real binary so env handling is exercised end to end
    let bin = env!("CARGO_BIN_EXE_mega-index");
    let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/golden/powerball-draws.csv");
    let run_bin = |argv: &[&str], var: &str| {
        std::process::Command::new(bin)
            .args(argv)
            .env_remove("MEGA_INDEX_DATA")
            .env_remove("POWER_INDEX_DATA")
            .env(var, &fixture)
            .current_dir(std::env::temp_dir())
            .output()
            .unwrap()
    };
    let o = run_bin(&["stats", "--game", "powerball"], "POWER_INDEX_DATA");
    assert_eq!(o.status.code(), Some(0));
    assert_eq!(String::from_utf8(o.stdout).unwrap(), golden("pb_stats.txt"));
    // the other game's variable is ignored: a bogus path there is never read
    // (the walk from the exe dir may still find the repo's own data file)
    let bogus = |argv: &[&str], var: &str| {
        let o = std::process::Command::new(bin)
            .args(argv)
            .env_remove("MEGA_INDEX_DATA")
            .env_remove("POWER_INDEX_DATA")
            .env(var, "/no/such/file.csv")
            .current_dir(std::env::temp_dir())
            .output()
            .unwrap();
        String::from_utf8(o.stderr).unwrap()
    };
    assert!(!bogus(&["stats", "--game", "powerball"], "MEGA_INDEX_DATA").contains("/no/such"));
    assert!(!bogus(&["stats"], "POWER_INDEX_DATA").contains("/no/such"));
    assert!(bogus(&["stats", "--game", "powerball"], "POWER_INDEX_DATA").contains("cannot read data file '/no/such/file.csv'"));
    assert!(bogus(&["stats"], "MEGA_INDEX_DATA").contains("cannot read data file '/no/such/file.csv'"));
}

#[cfg(unix)]
#[test]
fn osarg_round_trips_non_utf8_bytes() {
    use std::os::unix::ffi::OsStrExt;
    let raw: &[u8] = b"caf\xe9-\xff\xc3\xa9.csv";
    let s = mega_index::osarg::decode(std::ffi::OsStr::from_bytes(raw));
    assert!(s.ends_with(".csv") && s.contains('\u{e9}'));
    assert_eq!(mega_index::osarg::encode(&s), raw);
    assert_eq!(mega_index::osarg::path(&s).as_os_str().as_bytes(), raw);
    assert_eq!(mega_index::osarg::encode("plain \u{fc}"), "plain \u{fc}".as_bytes());
}
