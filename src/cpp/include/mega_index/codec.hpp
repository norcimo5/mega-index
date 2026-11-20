#pragma once
#include <string>
#include <vector>

#include "mega_index/game.hpp"

namespace mega_index {

struct Ticket {
    std::vector<int> whites;  // ascending
    int bonus;
};

// Combinadic (colex) encode; whites may be in any order. No validation.
u64 encode(const Game& g, std::vector<int> whites, int bonus);
// Decode 0 <= index < g.total.
Ticket decode(const Game& g, u64 index);
// Throws CliError (exit 2) per SPEC section 8 order: count, range, duplicate, bonus range.
// has_bonus=false reports "missing --bonus" after the duplicate check.
void validate_ticket(const Game& g, const std::vector<long long>& whites, long long bonus,
                     bool has_bonus);
// "07 19 33 48 62 MB 11"
std::string fmt_ticket(const Game& g, const std::vector<int>& whites, int bonus);
// 290472336 -> "290,472,336"
std::string group(u64 n);

}  // namespace mega_index
