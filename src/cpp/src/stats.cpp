#include "mega_index/stats.hpp"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstdlib>

namespace mega_index {

std::string fmt2(i64 num, i64 den, bool signed_) {
    i64 a = num < 0 ? -num : num;
    i64 q = (200 * a + den) / (2 * den);
    char buf[48];
    std::snprintf(buf, sizeof buf, "%lld.%02lld", static_cast<long long>(q / 100),
                  static_cast<long long>(q % 100));
    if (!signed_) return buf;
    return std::string(num < 0 && q != 0 ? "-" : "+") + buf;
}

Stats::Stats(const Game& g, std::vector<Draw> d)
    : game(&g), draws(std::move(d)), D(static_cast<i64>(draws.size())),
      wf(g.white_max + 1, 0), bf(g.bonus_max + 1, 0), wgap(g.white_max + 1, D),
      bgap(g.bonus_max + 1, D) {
    for (std::size_t j = 0; j < draws.size(); ++j) {
        i64 age = D - 1 - static_cast<i64>(j);
        for (int w : draws[j].whites) {
            wf[w] += 1;
            wgap[w] = age;
        }
        bf[draws[j].mb] += 1;
        bgap[draws[j].mb] = age;
    }
}

std::vector<int> Stats::rank(Rank kind, bool pool_white) const {
    const std::vector<i64>& f = pool_white ? wf : bf;
    const std::vector<i64>& gap = pool_white ? wgap : bgap;
    std::vector<int> nums;
    for (int n = 1; n < static_cast<int>(f.size()); ++n) nums.push_back(n);
    std::sort(nums.begin(), nums.end(), [&](int a, int b) {
        switch (kind) {
            case Rank::Hot:
                if (f[a] != f[b]) return f[a] > f[b];
                if (gap[a] != gap[b]) return gap[a] < gap[b];
                break;
            case Rank::Cold:
                if (f[a] != f[b]) return f[a] < f[b];
                if (gap[a] != gap[b]) return gap[a] > gap[b];
                break;
            case Rank::Overdue:
                if (gap[a] != gap[b]) return gap[a] > gap[b];
                if (f[a] != f[b]) return f[a] < f[b];
                break;
        }
        return a < b;
    });
    return nums;
}

static std::string chi(const std::vector<i64>& f, i64 D, i64 k, i64 K) {
    i64 num = 0;
    for (i64 n = 1; n <= K; ++n) {
        i64 t = f[n] * K - D * k;
        num += t * t;
    }
    return fmt2(num, K * D * k, false);
}

std::string Stats::chi_white() const {
    return chi(wf, D, game->white_count, game->white_max);
}
std::string Stats::chi_bonus() const { return chi(bf, D, 1, game->bonus_max); }

std::string notes(const Game& g) {
    return "NOTE: Fair picks do not improve your odds. Every ticket is 1 in " + group(g.total) +
           ".\nNOTE: Hot/cold is for fun and cannot predict draws; uniform is the default "
           "mode.\n";
}

static std::string upper(std::string s) {
    for (char& c : s) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
    return s;
}

static void table(std::string& o, const std::vector<i64>& f, const std::vector<i64>& gap, i64 D,
                  i64 k, i64 K) {
    o += "No  Freq     Dev   Gap\n";
    char buf[96];
    for (i64 n = 1; n <= K; ++n) {
        std::snprintf(buf, sizeof buf, "%02d  %4lld  %6s  %4lld\n", static_cast<int>(n),
                      static_cast<long long>(f[n]), fmt2(f[n] * K - D * k, K, true).c_str(),
                      static_cast<long long>(gap[n]));
        o += buf;
    }
}

static std::string top_line(const char* kind, const std::string& label, const std::vector<int>& r,
                            std::size_t top, const std::vector<i64>& val) {
    std::string s = std::string(kind) + " " + label + ":";
    char buf[48];
    for (std::size_t i = 0; i < top && i < r.size(); ++i) {
        std::snprintf(buf, sizeof buf, " %02d:%lld", r[i], static_cast<long long>(val[r[i]]));
        s += buf;
    }
    return s + "\n";
}

std::string render_stats(const Stats& st) {
    const Game& g = *st.game;
    const i64 D = st.D, k = g.white_count, K = g.white_max, B = g.bonus_max;
    std::string o;
    o += upper(g.name) + " STATS\n";
    o += "draws: " + std::to_string(D) + "\n";
    o += "range: " + st.draws.front().date + ".." + st.draws.back().date + "\n";
    o += "expected white freq: " + fmt2(D * k, K, false) + "\n";
    o += std::string("expected ") + g.bonus_abbr + " freq: " + fmt2(D, B, false) + "\n";
    o += "\nWHITE BALLS\n";
    table(o, st.wf, st.wgap, D, k, K);
    o += "\n" + upper(g.bonus_name) + "\n";
    table(o, st.bf, st.bgap, D, 1, B);
    o += "\n";
    o += top_line("HOT", "WHITES", st.rank(Rank::Hot, true), 10, st.wf);
    o += top_line("COLD", "WHITES", st.rank(Rank::Cold, true), 10, st.wf);
    o += top_line("OVERDUE", "WHITES", st.rank(Rank::Overdue, true), 10, st.wgap);
    o += top_line("HOT", g.bonus_abbr, st.rank(Rank::Hot, false), 5, st.bf);
    o += top_line("COLD", g.bonus_abbr, st.rank(Rank::Cold, false), 5, st.bf);
    o += top_line("OVERDUE", g.bonus_abbr, st.rank(Rank::Overdue, false), 5, st.bgap);
    o += "chi-square white: " + st.chi_white() + " (df " + std::to_string(K - 1) + ")\n";
    o += std::string("chi-square ") + g.bonus_abbr + ": " + st.chi_bonus() + " (df " +
         std::to_string(B - 1) + ")\n";
    return o;
}

std::vector<GuessTicket> guess_tickets(const Stats& st) {
    const Game& g = *st.game;
    auto hot_w = st.rank(Rank::Hot, true), cold_w = st.rank(Rank::Cold, true),
         over_w = st.rank(Rank::Overdue, true);
    auto hot_b = st.rank(Rank::Hot, false), cold_b = st.rank(Rank::Cold, false),
         over_b = st.rank(Rank::Overdue, false);
    const std::size_t k = static_cast<std::size_t>(g.white_count);
    std::vector<int> bal(hot_w.begin(), hot_w.begin() + 3);
    for (int n : over_w) {
        if (bal.size() == k) break;
        if (std::find(bal.begin(), bal.end(), n) == bal.end()) bal.push_back(n);
    }
    std::vector<GuessTicket> out;
    auto add = [&](const char* label, std::vector<int> w, int b) {
        std::sort(w.begin(), w.end());
        u64 idx = encode(g, w, b);
        out.push_back({label, w, b, idx});
    };
    add("HOT", std::vector<int>(hot_w.begin(), hot_w.begin() + k), hot_b[0]);
    add("COLD", std::vector<int>(cold_w.begin(), cold_w.begin() + k), cold_b[0]);
    add("BALANCED", bal, over_b[0]);
    return out;
}

std::string render_guess(const Stats& st) {
    const Game& g = *st.game;
    std::string o = upper(g.name) + " GUESS  draws=" + std::to_string(st.D) + "  " +
                    st.draws.front().date + ".." + st.draws.back().date + "\n";
    const char* letters = "ABC";
    int i = 0;
    for (const auto& t : guess_tickets(st)) {
        o += std::string(1, letters[i++]) + ": " + fmt_ticket(g, t.whites, t.bonus) + "  index " +
             std::to_string(t.index) + "  (" + t.label + ")\n";
    }
    return o + notes(g);
}

}  // namespace mega_index
