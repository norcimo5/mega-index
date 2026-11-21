#include "mega_index/data.hpp"

#include <sys/stat.h>
#include <unistd.h>

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstdlib>

#include "mega_index/error.hpp"

namespace mega_index {

namespace {

const char* const HEADER = "date,w1,w2,w3,w4,w5,mb";

// The only whitespace allowed around fields: ASCII space, \t, \r, \v, \f (not isspace(), which
// is locale-dependent and also accepts \n).
bool is_ws(char c) { return c == ' ' || c == '\t' || c == '\r' || c == '\v' || c == '\f'; }

std::string strip(const std::string& s) {
    std::size_t a = 0, b = s.size();
    while (a < b && is_ws(s[a])) ++a;
    while (b > a && is_ws(s[b - 1])) --b;
    return s.substr(a, b - a);
}

bool is_file(const std::string& p) {
    struct stat st;
    return ::stat(p.c_str(), &st) == 0 && S_ISREG(st.st_mode);
}

std::string dirname_of(const std::string& p) {
    std::size_t i = p.find_last_of('/');
    if (i == std::string::npos) return ".";
    if (i == 0) return "/";
    return p.substr(0, i);
}

// [+-]? then ASCII digits, after trimming ASCII whitespace.
bool parse_int_field(const std::string& raw, long long& out) {
    std::string s = strip(raw);
    std::size_t i = 0;
    bool neg = false;
    if (i < s.size() && (s[i] == '+' || s[i] == '-')) neg = s[i++] == '-';
    if (i >= s.size()) return false;
    long long v = 0;
    for (; i < s.size(); ++i) {
        if (s[i] < '0' || s[i] > '9') return false;
        // Any digit count is accepted (leading zeros); saturate instead of overflowing.
        if (v < 1000000000LL) v = v * 10 + (s[i] - '0');
    }
    out = neg ? -v : v;
    return true;
}

bool is_date(const std::string& s) {
    if (s.size() != 10) return false;
    for (std::size_t i = 0; i < 10; ++i) {
        if (i == 4 || i == 7) {
            if (s[i] != '-') return false;
        } else if (s[i] < '0' || s[i] > '9') {
            return false;
        }
    }
    return true;
}

bool walk_up(std::string d, const std::string& file, std::string& found) {
    if (d.empty()) return false;
    for (;;) {
        std::string p = (d == "/" ? "" : d) + "/data/" + file;
        if (is_file(p)) {
            found = p;
            return true;
        }
        if (d == "/" || d == "." || d.empty()) return false;
        std::string parent = dirname_of(d);
        if (parent == d) return false;
        d = parent;
    }
}

std::string exe_directory() {
    char buf[4096];
    ssize_t n = ::readlink("/proc/self/exe", buf, sizeof buf - 1);
    if (n <= 0) return "";
    buf[n] = '\0';
    return dirname_of(std::string(buf));
}

}  // namespace

DataEnv DataEnv::from_process() {
    DataEnv e;
    const char* v = std::getenv("MEGA_INDEX_DATA");
    if (v) e.env_data = v;
    v = std::getenv("POWER_INDEX_DATA");
    if (v) e.env_data_pb = v;
    char buf[4096];
    if (::getcwd(buf, sizeof buf)) e.cwd = buf;
    e.exe_dir = exe_directory();
    return e;
}

std::string find_data(const std::string* cli_path, const DataEnv& env, const Game& g) {
    if (cli_path) return *cli_path;
    const bool pb = std::string(g.id) == "powerball";
    const std::string& ev = pb ? env.env_data_pb : env.env_data;
    if (!ev.empty()) return ev;
    std::string found;
    if (walk_up(env.cwd, g.data_file, found)) return found;
    if (walk_up(env.exe_dir, g.data_file, found)) return found;
    throw CliError(std::string("data file not found (use --data or ") + g.data_env + ")", 1);
}

std::vector<Draw> parse_draws(const std::string& text, const Game& g) {
    // Strip a leading UTF-8 BOM (Excel). Lines end at \n, \r\n or a bare \r, and nothing else.
    std::size_t start = text.compare(0, 3, "\xef\xbb\xbf") == 0 ? 3 : 0;
    std::vector<std::string> lines;
    for (std::size_t i = start; i < text.size();) {
        const char c = text[i];
        if (c == '\n' || c == '\r') {
            lines.push_back(text.substr(start, i - start));
            ++i;
            if (c == '\r' && i < text.size() && text[i] == '\n') ++i;
            start = i;
        } else {
            ++i;
        }
    }
    lines.push_back(text.substr(start));
    if (strip(lines[0]) != HEADER) {
        throw CliError(std::string("bad data file: header must be '") + HEADER + "'", 1);
    }
    std::vector<Draw> draws;
    for (std::size_t li = 1; li < lines.size(); ++li) {
        std::string line = strip(lines[li]);
        if (line.empty()) continue;
        auto bad = [&]() { return CliError("bad data file: line " + std::to_string(li + 1), 1); };
        std::vector<std::string> f;
        std::size_t s = 0;
        for (;;) {
            std::size_t c = line.find(',', s);
            if (c == std::string::npos) {
                f.push_back(line.substr(s));
                break;
            }
            f.push_back(line.substr(s, c - s));
            s = c + 1;
        }
        for (auto& x : f) x = strip(x);
        if (f.size() != 7 || !is_date(f[0])) throw bad();
        long long v[6];
        for (int i = 0; i < 6; ++i) {
            if (!parse_int_field(f[i + 1], v[i])) throw bad();
        }
        std::vector<long long> w(v, v + 5);
        std::sort(w.begin(), w.end());
        for (long long x : w) {
            if (x < 1 || x > g.white_max) throw bad();
        }
        for (int i = 1; i < 5; ++i) {
            if (w[i] == w[i - 1]) throw bad();
        }
        if (v[5] < 1 || v[5] > g.bonus_max) throw bad();
        Draw d;
        d.date = f[0];
        for (int i = 0; i < 5; ++i) d.whites[i] = static_cast<int>(w[i]);
        d.mb = static_cast<int>(v[5]);
        draws.push_back(d);
    }
    if (draws.empty()) throw CliError("bad data file: no draws", 1);
    std::stable_sort(draws.begin(), draws.end(),
                     [](const Draw& a, const Draw& b) { return a.date < b.date; });
    return draws;
}

std::vector<Draw> load_draws(const std::string& path, const Game& g) {
    std::FILE* f = std::fopen(path.c_str(), "rb");
    if (!f) throw CliError("cannot read data file '" + path + "'", 1);
    std::string text;
    char buf[8192];
    std::size_t n;
    while ((n = std::fread(buf, 1, sizeof buf, f)) > 0) text.append(buf, n);
    bool err = std::ferror(f) != 0;
    std::fclose(f);
    if (err) throw CliError("cannot read data file '" + path + "'", 1);
    return parse_draws(text, g);
}

}  // namespace mega_index
