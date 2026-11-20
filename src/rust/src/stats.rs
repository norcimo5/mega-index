//! Draw statistics, rankings, integer formatting. Integer math only.

use crate::data::Draw;
use crate::game::Game;

/// num/den to two decimals, half away from zero. Unsigned variant.
pub fn fmt2(num: i64, den: i64) -> String {
    let a = num.abs();
    let q = (200 * a + den) / (2 * den);
    format!("{}.{:02}", q / 100, q % 100)
}

/// Signed variant: "-" if num<0 and q!=0, else "+".
pub fn fmt2_signed(num: i64, den: i64) -> String {
    let a = num.abs();
    let q = (200 * a + den) / (2 * den);
    let sign = if num < 0 && q != 0 { "-" } else { "+" };
    format!("{}{}.{:02}", sign, q / 100, q % 100)
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Rank {
    Hot,
    Cold,
    Overdue,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Pool {
    White,
    Bonus,
}

pub struct Stats {
    pub game: Game,
    pub d: i64,
    pub first_date: String,
    pub last_date: String,
    /// indexed by number (index 0 unused)
    pub wf: Vec<i64>,
    pub bf: Vec<i64>,
    pub wgap: Vec<i64>,
    pub bgap: Vec<i64>,
}

impl Stats {
    pub fn new(g: &Game, draws: &[Draw]) -> Stats {
        let d = draws.len() as i64;
        let mut wf = vec![0i64; g.white_max as usize + 1];
        let mut bf = vec![0i64; g.bonus_max as usize + 1];
        let mut wgap = vec![d; g.white_max as usize + 1];
        let mut bgap = vec![d; g.bonus_max as usize + 1];
        for (idx, dr) in draws.iter().enumerate() {
            let age = d - 1 - idx as i64;
            for &w in &dr.whites {
                wf[w as usize] += 1;
                wgap[w as usize] = age;
            }
            bf[dr.bonus as usize] += 1;
            bgap[dr.bonus as usize] = age;
        }
        Stats {
            game: *g,
            d,
            first_date: draws[0].date.clone(),
            last_date: draws[draws.len() - 1].date.clone(),
            wf,
            bf,
            wgap,
            bgap,
        }
    }

    pub fn freq(&self, pool: Pool) -> &[i64] {
        match pool {
            Pool::White => &self.wf,
            Pool::Bonus => &self.bf,
        }
    }
    pub fn gap(&self, pool: Pool) -> &[i64] {
        match pool {
            Pool::White => &self.wgap,
            Pool::Bonus => &self.bgap,
        }
    }
    pub fn max_num(&self, pool: Pool) -> u64 {
        match pool {
            Pool::White => self.game.white_max,
            Pool::Bonus => self.game.bonus_max,
        }
    }

    /// Full ranking over all numbers in the pool.
    pub fn rank(&self, kind: Rank, pool: Pool) -> Vec<u64> {
        let f = self.freq(pool);
        let gap = self.gap(pool);
        let mut nums: Vec<u64> = (1..=self.max_num(pool)).collect();
        nums.sort_by(|&a, &b| {
            let (a_, b_) = (a as usize, b as usize);
            match kind {
                Rank::Hot => f[b_].cmp(&f[a_]).then(gap[a_].cmp(&gap[b_])).then(a.cmp(&b)),
                Rank::Cold => f[a_].cmp(&f[b_]).then(gap[b_].cmp(&gap[a_])).then(a.cmp(&b)),
                Rank::Overdue => gap[b_].cmp(&gap[a_]).then(f[a_].cmp(&f[b_])).then(a.cmp(&b)),
            }
        });
        nums
    }

    /// chi-square as fmt2 text: sum (f*K - D*k)^2 / (K*D*k)
    pub fn chi(&self, pool: Pool) -> String {
        let (k, kk) = self.kk(pool);
        let f = self.freq(pool);
        let num: i64 = (1..=kk).map(|n| {
            let t = f[n as usize] * kk - self.d * k;
            t * t
        }).sum();
        fmt2(num, kk * self.d * k)
    }

    /// (picks per draw, pool size)
    fn kk(&self, pool: Pool) -> (i64, i64) {
        match pool {
            Pool::White => (self.game.white_count as i64, self.game.white_max as i64),
            Pool::Bonus => (1, self.game.bonus_max as i64),
        }
    }

    fn table(&self, pool: Pool) -> Vec<String> {
        let (k, kk) = self.kk(pool);
        let mut lines = vec!["No  Freq     Dev   Gap".to_string()];
        for n in 1..=kk as usize {
            let f = self.freq(pool)[n];
            lines.push(format!(
                "{:02}  {:>4}  {:>6}  {:>4}",
                n,
                f,
                fmt2_signed(f * kk - self.d * k, kk),
                self.gap(pool)[n]
            ));
        }
        lines
    }

    /// The full `stats` command output.
    pub fn report(&self) -> String {
        let g = &self.game;
        let (k, kk) = self.kk(Pool::White);
        let bb = g.bonus_max as i64;
        let mut o: Vec<String> = Vec::new();
        o.push(format!("{} STATS", g.name.to_uppercase()));
        o.push(format!("draws: {}", self.d));
        o.push(format!("range: {}..{}", self.first_date, self.last_date));
        o.push(format!("expected white freq: {}", fmt2(self.d * k, kk)));
        o.push(format!("expected {} freq: {}", g.bonus_abbr, fmt2(self.d, bb)));
        o.push(String::new());
        o.push("WHITE BALLS".to_string());
        o.extend(self.table(Pool::White));
        o.push(String::new());
        o.push(g.bonus_name.to_uppercase());
        o.extend(self.table(Pool::Bonus));
        o.push(String::new());
        for (pool, label, top) in [(Pool::White, "WHITES", 10usize), (Pool::Bonus, g.bonus_abbr, 5)] {
            let f = self.freq(pool);
            let gap = self.gap(pool);
            let join = |r: Rank, v: &[i64]| -> String {
                self.rank(r, pool)
                    .iter()
                    .take(top)
                    .map(|&n| format!("{:02}:{}", n, v[n as usize]))
                    .collect::<Vec<_>>()
                    .join(" ")
            };
            o.push(format!("HOT {}: {}", label, join(Rank::Hot, f)));
            o.push(format!("COLD {}: {}", label, join(Rank::Cold, f)));
            o.push(format!("OVERDUE {}: {}", label, join(Rank::Overdue, gap)));
        }
        o.push(format!("chi-square white: {} (df {})", self.chi(Pool::White), kk - 1));
        o.push(format!("chi-square {}: {} (df {})", g.bonus_abbr, self.chi(Pool::Bonus), bb - 1));
        let mut s = o.join("\n");
        s.push('\n');
        s
    }
}
