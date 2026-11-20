//! Game configuration presets.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Game {
    pub id: &'static str,
    pub name: &'static str,
    pub white_count: usize,
    pub white_max: u64,
    pub bonus_count: usize,
    pub bonus_max: u64,
    pub bonus_name: &'static str,
    pub bonus_abbr: &'static str,
    pub matrix_start: &'static str,
    pub has_history: bool,
}

pub const MEGA_MILLIONS: Game = Game {
    id: "megamillions",
    name: "Mega Millions",
    white_count: 5,
    white_max: 70,
    bonus_count: 1,
    bonus_max: 24,
    bonus_name: "Mega Ball",
    bonus_abbr: "MB",
    matrix_start: "2025-04-08",
    has_history: true,
};

pub const POWERBALL: Game = Game {
    id: "powerball",
    name: "Powerball",
    white_count: 5,
    white_max: 69,
    bonus_count: 1,
    bonus_max: 26,
    bonus_name: "Powerball",
    bonus_abbr: "PB",
    matrix_start: "2015-10-07",
    has_history: false,
};

pub const GAMES: [Game; 2] = [MEGA_MILLIONS, POWERBALL];

impl Game {
    pub fn by_id(id: &str) -> Option<Game> {
        GAMES.iter().copied().find(|g| g.id == id)
    }
    /// C(white_max, white_count)
    pub fn white_combos(&self) -> u64 {
        crate::codec::comb(self.white_max, self.white_count as u64)
    }
    pub fn total(&self) -> u64 {
        self.white_combos() * self.bonus_max
    }
}

/// Group digits with commas: 290472336 -> "290,472,336".
pub fn group(n: u64) -> String {
    let s = n.to_string();
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    out
}

/// `07 19 33 48 62 MB 11`
pub fn fmt_ticket(g: &Game, whites: &[u64], bonus: u64) -> String {
    let mut w = whites.to_vec();
    w.sort_unstable();
    let ws: Vec<String> = w.iter().map(|x| format!("{:02}", x)).collect();
    format!("{} {} {:02}", ws.join(" "), g.bonus_abbr, bonus)
}

pub fn notes(g: &Game) -> [String; 2] {
    [
        format!("NOTE: Fair picks do not improve your odds. Every ticket is 1 in {}.", group(g.total())),
        "NOTE: Hot/cold is for fun and cannot predict draws; uniform is the default mode.".to_string(),
    ]
}
