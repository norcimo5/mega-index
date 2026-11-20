#pragma once
#include <cstdint>
#include <string>

namespace mega_index {

using u64 = std::uint64_t;

// Exact C(n, k) in 64-bit; 0 when n < k. Intended for k <= ~10, n <= ~100.
u64 binom(int n, int k);

struct Game {
    const char* id;
    const char* name;
    int white_count;
    int white_max;
    int bonus_count;
    int bonus_max;
    const char* bonus_name;
    const char* bonus_abbr;
    const char* matrix_start;
    bool has_history;
    u64 white_combos;  // C(white_max, white_count)
    u64 total;         // white_combos * bonus_max

    Game(const char* id_, const char* name_, int wc, int wm, int bm, const char* bn,
         const char* ba, const char* ms, bool hist);
};

const Game& mega_millions();
const Game& powerball();
// Returns nullptr for an unknown id.
const Game* find_game(const std::string& id);

}  // namespace mega_index
