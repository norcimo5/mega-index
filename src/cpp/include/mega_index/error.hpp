#pragma once
#include <stdexcept>
#include <string>

namespace mega_index {

// Error carrying the CLI exit code (2 = usage/validation, 1 = data/IO).
struct CliError : std::runtime_error {
    int code;
    explicit CliError(const std::string& msg, int c = 2) : std::runtime_error(msg), code(c) {}
};

}  // namespace mega_index
