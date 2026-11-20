#pragma once
#include <cstdint>
#include <string>
#include <vector>

#include "mega_index/codec.hpp"
#include "mega_index/data.hpp"
#include "mega_index/game.hpp"

namespace mega_index {

using i64 = std::int64_t;

// num/den to 2 decimals, half away from zero, integer math only (den > 0).
// signed_: prefix "+"/"-" ("+0.00" for zero).
std::string fmt2(i64 num, i64 den, bool signed_);

enum class Rank { Hot, Cold, Overdue };

struct Stats {
    const Game* game;
    std::vector<Draw> draws;
    i64 D;
    // Indexed by ball number (index 0 unused).
    std::vector<i64> wf, bf, wgap, bgap;

    Stats(const Game& g, std::vector<Draw> d);
    // Full ranking of 1..max for whites (pool_white) or bonus balls.
    std::vector<int> rank(Rank kind, bool pool_white) const;
    std::string chi_white() const;
    std::string chi_bonus() const;
};

struct GuessTicket {
    const char* label;
    std::vector<int> whites;
    int bonus;
    u64 index;
};
std::vector<GuessTicket> guess_tickets(const Stats& st);

// Full `stats` command output (all lines, each ending in \n).
std::string render_stats(const Stats& st);
std::string render_guess(const Stats& st);
// The two NOTE lines (each ending in \n).
std::string notes(const Game& g);

}  // namespace mega_index
