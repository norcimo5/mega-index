#include "mega_index/picks.hpp"

#include <algorithm>
#include <set>

#include "mega_index/rng.hpp"

namespace mega_index {

const char* mode_name(Mode m) {
    switch (m) {
        case Mode::Uniform: return "uniform";
        case Mode::Hot: return "hot";
        case Mode::Cold: return "cold";
        case Mode::Mixed: return "mixed";
    }
    return "uniform";
}

std::vector<int> weighted_take(std::map<int, i64> weights, int count) {
    std::vector<int> chosen;
    for (int c = 0; c < count; ++c) {
        i64 total = 0;
        for (const auto& kv : weights) total += kv.second;
        i64 r = static_cast<i64>(randbelow(static_cast<std::uint64_t>(total)));
        i64 acc = 0;
        for (auto it = weights.begin(); it != weights.end(); ++it) {  // std::map: ascending
            acc += it->second;
            if (r < acc) {
                chosen.push_back(it->first);
                weights.erase(it);
                break;
            }
        }
    }
    return chosen;
}

namespace {

std::map<int, i64> hot_weights(const std::vector<i64>& f, const std::vector<int>& nums) {
    std::map<int, i64> w;
    for (int n : nums) w[n] = f[n] + 1;
    return w;
}

std::map<int, i64> cold_weights(const std::vector<i64>& f, const std::vector<int>& nums) {
    i64 mx = 0;
    for (int n : nums) mx = std::max(mx, f[n]);
    std::map<int, i64> w;
    for (int n : nums) w[n] = mx - f[n] + 1;
    return w;
}

std::vector<int> range(int hi) {
    std::vector<int> v;
    for (int i = 1; i <= hi; ++i) v.push_back(i);
    return v;
}

}  // namespace

Pick make_pick(const Game& g, Mode mode, const Stats* st) {
    if (mode == Mode::Uniform) {
        u64 i = randbelow(g.total);
        Ticket t = decode(g, i);
        return {t.whites, t.bonus, i};
    }
    const std::vector<int> W = range(g.white_max), B = range(g.bonus_max);
    std::vector<int> whites;
    int bonus = 0;
    if (mode == Mode::Hot) {
        whites = weighted_take(hot_weights(st->wf, W), g.white_count);
        bonus = weighted_take(hot_weights(st->bf, B), 1)[0];
    } else if (mode == Mode::Cold) {
        whites = weighted_take(cold_weights(st->wf, W), g.white_count);
        bonus = weighted_take(cold_weights(st->bf, B), 1)[0];
    } else {
        whites = weighted_take(hot_weights(st->wf, W), 3);
        std::vector<int> rest;
        for (int n : W) {
            if (std::find(whites.begin(), whites.end(), n) == whites.end()) rest.push_back(n);
        }
        std::vector<int> more = weighted_take(cold_weights(st->wf, rest), g.white_count - 3);
        whites.insert(whites.end(), more.begin(), more.end());
        if (randbelow(2) == 0) {
            bonus = weighted_take(hot_weights(st->bf, B), 1)[0];
        } else {
            bonus = weighted_take(cold_weights(st->bf, B), 1)[0];
        }
    }
    std::sort(whites.begin(), whites.end());
    return {whites, bonus, encode(g, whites, bonus)};
}

std::vector<Play> make_slip(const Game& g, Mode mode, const Stats* st, int n) {
    std::vector<Play> rows;
    std::set<u64> seen;
    while (static_cast<int>(rows.size()) < n) {
        Pick p = make_pick(g, mode, st);
        if (!seen.insert(p.index).second) continue;
        rows.push_back({static_cast<char>('A' + rows.size()), p});
    }
    return rows;
}

}  // namespace mega_index
