#pragma once
#include <string>
#include <vector>

#include "mega_index/game.hpp"

namespace mega_index {

struct Draw {
    std::string date;  // YYYY-MM-DD
    int whites[5];     // ascending
    int mb;
};

// Where to look for data/draws.csv (injectable for tests).
struct DataEnv {
    std::string env_data;  // value of MEGA_INDEX_DATA ("" = unset/empty)
    std::string cwd;
    std::string exe_dir;   // directory holding the executable ("" = skip)
    static DataEnv from_process();
};

// SPEC section 4 resolution order. cli_path may be nullptr. Throws CliError(1) if not found.
std::string find_data(const std::string* cli_path, const DataEnv& env);
// Parse + validate + stable-sort by date. Throws CliError(1).
std::vector<Draw> load_draws(const std::string& path, const Game& g);
// Same, from file contents (path used only for nothing; errors are bad-data errors).
std::vector<Draw> parse_draws(const std::string& text, const Game& g);

}  // namespace mega_index
