//! CSV / JSON export of a slip.

use crate::game::Game;
use crate::picks::{Ticket, PLAY_LABELS};

const KEYS: [&str; 11] =
    ["play", "mode", "w1", "w2", "w3", "w4", "w5", "bonus", "index", "game", "generated_at"];

/// Current UTC time as `YYYY-MM-DDTHH:MM:SSZ`.
pub fn utc_now_stamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    format_utc(secs)
}

pub fn format_utc(secs: i64) -> String {
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    // civil from days (Howard Hinnant)
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y,
        m,
        d,
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

pub fn is_csv(path: &str) -> bool {
    path.to_ascii_lowercase().ends_with(".csv")
}
pub fn is_json(path: &str) -> bool {
    path.to_ascii_lowercase().ends_with(".json")
}

/// Render the export text for `path`'s extension; None if the extension is unsupported.
pub fn render(path: &str, rows: &[Ticket], g: &Game, mode: &str, stamp: &str) -> Option<String> {
    let recs: Vec<(String, Vec<String>)> = rows
        .iter()
        .enumerate()
        .map(|(i, t)| {
            let label = PLAY_LABELS[i..i + 1].to_string();
            let mut nums: Vec<String> = t.whites.iter().map(|w| w.to_string()).collect();
            nums.push(t.bonus.to_string());
            nums.push(t.index.to_string());
            (label, nums)
        })
        .collect();
    if is_csv(path) {
        let mut s = KEYS.join(",");
        s.push('\n');
        for (label, nums) in &recs {
            s.push_str(&format!("{},{},{},{},{}\n", label, mode, nums.join(","), g.id, stamp));
        }
        Some(s)
    } else if is_json(path) {
        let mut objs = Vec::new();
        for (label, nums) in &recs {
            let mut parts = vec![format!("\"play\": \"{}\"", label), format!("\"mode\": \"{}\"", mode)];
            for (k, v) in KEYS[2..9].iter().zip(nums) {
                parts.push(format!("\"{}\": {}", k, v));
            }
            parts.push(format!("\"game\": \"{}\"", g.id));
            parts.push(format!("\"generated_at\": \"{}\"", stamp));
            objs.push(format!("  {{{}}}", parts.join(", ")));
        }
        Some(format!("[\n{}\n]\n", objs.join(",\n")))
    } else {
        None
    }
}
