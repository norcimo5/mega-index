#pragma once
#include <map>
#include <string>
#include <vector>

#include "mega_index/codec.hpp"
#include "mega_index/stats.hpp"

namespace mega_index {

enum class Mode { Uniform, Hot, Cold, Mixed };
const char* mode_name(Mode m);

// weights: ball -> positive weight. Draw `count` distinct balls without replacement,
// re-weighting after each draw. Uses randbelow().
std::vector<int> weighted_take(std::map<int, i64> weights, int count);

struct Pick {
    std::vector<int> whites;  // ascending
    int bonus;
    u64 index;
};

// st may be nullptr for Uniform.
Pick make_pick(const Game& g, Mode mode, const Stats* st);

struct Play {
    char label;
    Pick pick;
};
// n distinct tickets (a repeat index is redrawn).
std::vector<Play> make_slip(const Game& g, Mode mode, const Stats* st, int n);

}  // namespace mega_index
