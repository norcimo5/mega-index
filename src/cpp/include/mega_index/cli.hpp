#pragma once
#include <iosfwd>
#include <string>
#include <vector>

#include "mega_index/data.hpp"

namespace mega_index {

extern const char* const USAGE;

// Runs the CLI. args excludes the program name. Returns the process exit code.
// stdout text goes to `out`, "error: ..." (or usage on no args) goes to `err`.
int run(const std::vector<std::string>& args, std::ostream& out, std::ostream& err,
        const DataEnv& env);

}  // namespace mega_index
