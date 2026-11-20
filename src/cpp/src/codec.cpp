#include "mega_index/codec.hpp"

#include <algorithm>
#include <cstdio>
#include <set>

#include "mega_index/error.hpp"

namespace mega_index {

u64 encode(const Game& g, std::vector<int> whites, int bonus) {
    std::sort(whites.begin(), whites.end());
    u64 n = 0;
    for (std::size_t i = 0; i < whites.size(); ++i) {
        n += binom(whites[i] - 1, static_cast<int>(i) + 1);
    }
    return static_cast<u64>(g.bonus_max) * n + static_cast<u64>(bonus - 1);
}

Ticket decode(const Game& g, u64 index) {
    u64 n = index / static_cast<u64>(g.bonus_max);
    int bonus = static_cast<int>(index % static_cast<u64>(g.bonus_max)) + 1;
    Ticket t;
    int x = g.white_max - 1;
    for (int i = g.white_count; i >= 1; --i) {
        while (x > 0 && binom(x, i) > n) --x;
        n -= binom(x, i);
        t.whites.push_back(x + 1);
        --x;
    }
    std::sort(t.whites.begin(), t.whites.end());
    t.bonus = bonus;
    return t;
}

void validate_ticket(const Game& g, const std::vector<long long>& whites, long long bonus,
                     bool has_bonus) {
    if (static_cast<int>(whites.size()) != g.white_count) {
        throw CliError("expected " + std::to_string(g.white_count) + " white balls, got " +
                       std::to_string(whites.size()));
    }
    for (long long w : whites) {
        if (w < 1 || w > g.white_max) {
            throw CliError("white ball " + std::to_string(w) + " out of range 1-" +
                           std::to_string(g.white_max));
        }
    }
    std::set<long long> seen;
    for (long long w : whites) {
        if (!seen.insert(w).second) {
            throw CliError("duplicate white ball " + std::to_string(w));
        }
    }
    if (!has_bonus) throw CliError("missing --bonus");
    if (bonus < 1 || bonus > g.bonus_max) {
        throw CliError(std::string(g.bonus_name) + " " + std::to_string(bonus) +
                       " out of range 1-" + std::to_string(g.bonus_max));
    }
}

std::string fmt_ticket(const Game& g, const std::vector<int>& whites, int bonus) {
    std::vector<int> w(whites);
    std::sort(w.begin(), w.end());
    std::string s;
    char buf[16];
    for (int v : w) {
        std::snprintf(buf, sizeof buf, "%02d ", v);
        s += buf;
    }
    std::snprintf(buf, sizeof buf, "%02d", bonus);
    return s + g.bonus_abbr + " " + buf;
}

std::string group(u64 n) {
    std::string d = std::to_string(n), r;
    int c = 0;
    for (auto it = d.rbegin(); it != d.rend(); ++it, ++c) {
        if (c && c % 3 == 0) r.insert(r.begin(), ',');
        r.insert(r.begin(), *it);
    }
    return r;
}

}  // namespace mega_index
