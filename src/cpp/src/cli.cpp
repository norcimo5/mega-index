#include "mega_index/cli.hpp"

#include <algorithm>
#include <map>
#include <ostream>

#include "mega_index/codec.hpp"
#include "mega_index/error.hpp"
#include "mega_index/export.hpp"
#include "mega_index/picks.hpp"
#include "mega_index/stats.hpp"

namespace mega_index {

const char* const USAGE =
    "mega-index: lottery ticket <-> index encoder/decoder and picker\n"
    "\n"
    "usage:\n"
    "  mega-index encode <w1> <w2> <w3> <w4> <w5> --bonus N [--game G]   (--mb N also accepted)\n"
    "  mega-index decode <index> [--game G]\n"
    "  mega-index pick [-n 1..5] [--mode uniform|hot|cold|mixed] [--game G] "
    "[--export FILE.csv|FILE.json] [--data PATH]\n"
    "  mega-index stats [--data PATH] [--game G]\n"
    "  mega-index guess [--data PATH] [--game G]\n"
    "  mega-index --help\n"
    "\n"
    "games: megamillions (default; 5 of 1-70 + Mega Ball 1-24), powerball (5 of 1-69 + "
    "Powerball 1-26)\n"
    "data:  --data PATH, else $MEGA_INDEX_DATA, else data/draws.csv found walking up from cwd, "
    "then from the program dir\n";

namespace {

struct Parsed {
    std::vector<std::string> pos;
    std::map<std::string, std::string> opts;
    bool has(const char* k) const { return opts.count(k) != 0; }
    std::string get(const char* k, const char* def) const {
        auto it = opts.find(k);
        return it == opts.end() ? def : it->second;
    }
};

using OptTable = std::map<std::string, std::string>;

Parsed parse_args(const std::vector<std::string>& argv, std::size_t from, const OptTable& tbl) {
    Parsed p;
    for (std::size_t i = from; i < argv.size(); ++i) {
        const std::string& a = argv[i];
        if (a.size() > 1 && a[0] == '-') {
            std::size_t eq = a.find('=');
            std::string name = a.substr(0, eq);
            auto it = tbl.find(name);
            if (it == tbl.end()) throw CliError("unknown option '" + name + "'");
            std::string val;
            if (eq == std::string::npos) {
                if (i + 1 >= argv.size()) throw CliError("option " + name + " needs a value");
                val = argv[++i];
            } else {
                val = a.substr(eq + 1);
            }
            p.opts[it->second] = val;
        } else {
            p.pos.push_back(a);
        }
    }
    return p;
}

long long parse_int(const std::string& tok) {
    bool ok = !tok.empty() && tok.size() <= 18;
    for (char c : tok) ok = ok && c >= '0' && c <= '9';
    if (!ok) throw CliError("not an integer: '" + tok + "'");
    return std::stoll(tok);
}

const Game& get_game(const Parsed& p) {
    std::string id = p.get("game", "megamillions");
    const Game* g = find_game(id);
    if (!g) throw CliError("unknown game '" + id + "'");
    return *g;
}

void need_history(const Game& g) {
    if (!g.has_history) throw CliError(std::string("no draw history for ") + g.name);
}

std::string upper(std::string s) {
    for (char& c : s) {
        if (c >= 'a' && c <= 'z') c = static_cast<char>(c - 'a' + 'A');
    }
    return s;
}

void print_ticket(std::ostream& out, const Game& g, const std::vector<int>& w, int b, u64 idx) {
    out << "game: " << g.name << "\n";
    out << "ticket: " << fmt_ticket(g, w, b) << "\n";
    out << "index: " << idx << "\n";
}

void cmd_encode(const std::vector<std::string>& argv, std::ostream& out) {
    Parsed p = parse_args(argv, 1, {{"--bonus", "bonus"}, {"--mb", "bonus"}, {"--game", "game"}});
    const Game& g = get_game(p);
    std::vector<long long> whites;
    for (const auto& s : p.pos) whites.push_back(parse_int(s));
    long long bonus = p.has("bonus") ? parse_int(p.opts["bonus"]) : 0;
    validate_ticket(g, whites, bonus, p.has("bonus"));
    std::vector<int> w(whites.begin(), whites.end());
    int b = static_cast<int>(bonus);
    print_ticket(out, g, w, b, encode(g, w, b));
}

void cmd_decode(const std::vector<std::string>& argv, std::ostream& out) {
    Parsed p = parse_args(argv, 1, {{"--game", "game"}});
    const Game& g = get_game(p);
    if (p.pos.size() != 1) throw CliError("expected exactly one index");
    u64 i = static_cast<u64>(parse_int(p.pos[0]));
    if (i >= g.total) {
        throw CliError("index " + std::to_string(i) + " out of range 0-" +
                       std::to_string(g.total - 1));
    }
    Ticket t = decode(g, i);
    print_ticket(out, g, t.whites, t.bonus, i);
}

Stats load_stats(const Parsed& p, const Game& g, const DataEnv& env) {
    std::string path_store;
    const std::string* cli = nullptr;
    if (p.has("data")) {
        path_store = p.opts.at("data");
        cli = &path_store;
    }
    return Stats(g, load_draws(find_data(cli, env), g));
}

void cmd_pick(const std::vector<std::string>& argv, std::ostream& out, const DataEnv& env) {
    Parsed p = parse_args(argv, 1, {{"-n", "n"}, {"--plays", "n"}, {"--mode", "mode"},
                                    {"--game", "game"}, {"--export", "export"},
                                    {"--data", "data"}});
    if (!p.pos.empty()) throw CliError("unexpected argument '" + p.pos[0] + "'");
    const Game& g = get_game(p);
    long long n = parse_int(p.get("n", "1"));
    if (n < 1 || n > 5) throw CliError("plays must be 1-5");
    std::string ms = p.get("mode", "uniform");
    Mode mode;
    if (ms == "uniform") mode = Mode::Uniform;
    else if (ms == "hot") mode = Mode::Hot;
    else if (ms == "cold") mode = Mode::Cold;
    else if (ms == "mixed") mode = Mode::Mixed;
    else throw CliError("unknown mode '" + ms + "'");
    const bool exporting = p.has("export");
    std::string exp = p.get("export", "");
    if (exporting && !has_export_ext(exp)) {
        throw CliError("export path must end in .csv or .json");
    }
    if (mode == Mode::Uniform) {
        // no history needed
    } else {
        need_history(g);
    }
    std::vector<Play> plays;
    if (mode == Mode::Uniform) {
        plays = make_slip(g, mode, nullptr, static_cast<int>(n));
    } else {
        Stats st = load_stats(p, g, env);
        plays = make_slip(g, mode, &st, static_cast<int>(n));
    }
    out << upper(g.name) << " PICK  mode=" << ms << "  plays=" << n << "\n";
    for (const auto& pl : plays) {
        out << pl.label << ": " << fmt_ticket(g, pl.pick.whites, pl.pick.bonus) << "  index "
            << pl.pick.index << "\n";
    }
    out << notes(g);
    if (exporting) {
        write_export(exp, plays, g, mode_name(mode), utc_stamp());
        out << "exported " << n << " plays to " << exp << "\n";
    }
}

void cmd_stats_guess(const std::vector<std::string>& argv, std::ostream& out, const DataEnv& env,
                     bool guess) {
    Parsed p = parse_args(argv, 1, {{"--data", "data"}, {"--game", "game"}});
    if (!p.pos.empty()) throw CliError("unexpected argument '" + p.pos[0] + "'");
    const Game& g = get_game(p);
    need_history(g);
    Stats st = load_stats(p, g, env);
    out << (guess ? render_guess(st) : render_stats(st));
}

}  // namespace

int run(const std::vector<std::string>& args, std::ostream& out, std::ostream& err,
        const DataEnv& env) {
    if (std::find(args.begin(), args.end(), "--help") != args.end() ||
        std::find(args.begin(), args.end(), "-h") != args.end()) {
        out << USAGE;
        return 0;
    }
    if (args.empty()) {
        err << USAGE;
        return 2;
    }
    try {
        const std::string& cmd = args[0];
        if (cmd == "encode") cmd_encode(args, out);
        else if (cmd == "decode") cmd_decode(args, out);
        else if (cmd == "pick") cmd_pick(args, out, env);
        else if (cmd == "stats") cmd_stats_guess(args, out, env, false);
        else if (cmd == "guess") cmd_stats_guess(args, out, env, true);
        else throw CliError("unknown command '" + cmd + "'");
    } catch (const CliError& e) {
        out.flush();
        err << "error: " << e.what() << "\n";
        return e.code;
    } catch (const std::exception& e) {
        out.flush();
        err << "error: " << e.what() << "\n";
        return 1;
    }
    return 0;
}

}  // namespace mega_index
