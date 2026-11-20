#include "mega_index/export.hpp"

#include <cstdio>
#include <ctime>

#include "mega_index/error.hpp"

namespace mega_index {

namespace {
bool ends_with_ci(const std::string& s, const char* ext) {
    std::string e(ext);
    if (s.size() < e.size()) return false;
    for (std::size_t i = 0; i < e.size(); ++i) {
        char c = s[s.size() - e.size() + i];
        if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
        if (c != e[i]) return false;
    }
    return true;
}
}  // namespace

std::string utc_stamp() {
    std::time_t t = std::time(nullptr);
    std::tm tm;
    gmtime_r(&t, &tm);
    char buf[32];
    std::strftime(buf, sizeof buf, "%Y-%m-%dT%H:%M:%SZ", &tm);
    return buf;
}

bool has_export_ext(const std::string& path) {
    return ends_with_ci(path, ".csv") || ends_with_ci(path, ".json");
}

std::string render_export(const std::string& path, const std::vector<Play>& plays, const Game& g,
                          const char* mode, const std::string& stamp) {
    static const char* keys[] = {"play", "mode", "w1", "w2", "w3", "w4", "w5",
                                 "bonus", "index", "game", "generated_at"};
    const bool csv = ends_with_ci(path, ".csv");
    if (!csv && !ends_with_ci(path, ".json")) {
        throw CliError("export path must end in .csv or .json");
    }
    std::string s;
    if (csv) {
        for (int i = 0; i < 11; ++i) s += std::string(i ? "," : "") + keys[i];
        s += "\n";
    } else {
        s = "[\n";
    }
    for (std::size_t p = 0; p < plays.size(); ++p) {
        const Pick& k = plays[p].pick;
        std::string vals[11];
        bool is_str[11] = {true, true, false, false, false, false, false, false, false, true, true};
        vals[0] = std::string(1, plays[p].label);
        vals[1] = mode;
        for (int i = 0; i < 5; ++i) vals[2 + i] = std::to_string(k.whites[i]);
        vals[7] = std::to_string(k.bonus);
        vals[8] = std::to_string(k.index);
        vals[9] = g.id;
        vals[10] = stamp;
        if (csv) {
            for (int i = 0; i < 11; ++i) s += (i ? "," : "") + vals[i];
            s += "\n";
        } else {
            s += "  {";
            for (int i = 0; i < 11; ++i) {
                s += std::string(i ? ", " : "") + "\"" + keys[i] + "\": " +
                     (is_str[i] ? "\"" + vals[i] + "\"" : vals[i]);
            }
            s += p + 1 < plays.size() ? "},\n" : "}\n";
        }
    }
    if (!csv) s += "]\n";
    return s;
}

void write_export(const std::string& path, const std::vector<Play>& plays, const Game& g,
                  const char* mode, const std::string& stamp) {
    std::string text = render_export(path, plays, g, mode, stamp);
    std::FILE* f = std::fopen(path.c_str(), "wb");
    bool ok = f != nullptr;
    if (f) {
        ok = std::fwrite(text.data(), 1, text.size(), f) == text.size();
        if (std::fclose(f) != 0) ok = false;
    }
    if (!ok) throw CliError("cannot write '" + path + "'", 1);
}

}  // namespace mega_index
