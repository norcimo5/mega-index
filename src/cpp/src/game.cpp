#include "mega_index/game.hpp"

namespace mega_index {

u64 binom(int n, int k) {
    if (k < 0 || n < k) return 0;
    if (k > n - k) k = n - k;
    u64 r = 1;
    for (int i = 0; i < k; ++i) {
        // r * (n - i) is divisible by (i + 1) at every step.
        r = r * static_cast<u64>(n - i) / static_cast<u64>(i + 1);
    }
    return r;
}

Game::Game(const char* id_, const char* name_, int wc, int wm, int bm, const char* bn,
           const char* ba, const char* ms, const char* df, const char* de)
    : id(id_), name(name_), white_count(wc), white_max(wm), bonus_count(1), bonus_max(bm),
      bonus_name(bn), bonus_abbr(ba), matrix_start(ms), data_file(df), data_env(de),
      white_combos(binom(wm, wc)), total(binom(wm, wc) * static_cast<u64>(bm)) {}

const Game& mega_millions() {
    static const Game g("megamillions", "Mega Millions", 5, 70, 24, "Mega Ball", "MB",
                        "2025-04-08", "draws.csv", "MEGA_INDEX_DATA");
    return g;
}

const Game& powerball() {
    static const Game g("powerball", "Powerball", 5, 69, 26, "Powerball", "PB", "2015-10-07",
                        "powerball-draws.csv", "POWER_INDEX_DATA");
    return g;
}

const Game* find_game(const std::string& id) {
    if (id == "megamillions") return &mega_millions();
    if (id == "powerball") return &powerball();
    return nullptr;
}

}  // namespace mega_index
