#pragma once
#include <string>

#include "mega_index/picks.hpp"

namespace mega_index {

// Current UTC time as YYYY-MM-DDTHH:MM:SSZ.
std::string utc_stamp();
// CSV or JSON text chosen by (case-insensitive) extension of path; throws CliError(2) otherwise.
std::string render_export(const std::string& path, const std::vector<Play>& plays, const Game& g,
                          const char* mode, const std::string& stamp);
bool has_export_ext(const std::string& path);
// Writes the file; throws CliError(1) "cannot write '<path>'" on failure.
void write_export(const std::string& path, const std::vector<Play>& plays, const Game& g,
                  const char* mode, const std::string& stamp);

}  // namespace mega_index
