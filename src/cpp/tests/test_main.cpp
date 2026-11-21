// Self-contained test executable (no third-party framework).
// Usage: mega-index-tests [path/to/mega-index]   (binary path enables subprocess tests)
#include <sys/stat.h>
#include <unistd.h>

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <set>
#include <sstream>
#include <string>
#include <vector>

#include "mega_index/cli.hpp"
#include "mega_index/codec.hpp"
#include "mega_index/data.hpp"
#include "mega_index/error.hpp"
#include "mega_index/export.hpp"
#include "mega_index/picks.hpp"
#include "mega_index/rng.hpp"
#include "mega_index/stats.hpp"

using namespace mega_index;

static int g_checks = 0, g_fails = 0;
#define CHECK(cond)                                                            \
    do {                                                                       \
        ++g_checks;                                                            \
        if (!(cond)) {                                                         \
            ++g_fails;                                                         \
            std::fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); \
        }                                                                      \
    } while (0)

static std::string g_bin;

struct Result {
    int rc;
    std::string out, err;
};

static Result run_cli(const std::vector<std::string>& args, const DataEnv& env) {
    std::ostringstream o, e;
    int rc = run(args, o, e, env);
    return {rc, o.str(), e.str()};
}
static DataEnv empty_env() { return DataEnv{"", "/nonexistent-cwd", "", ""}; }
static Result cli(const std::vector<std::string>& a) { return run_cli(a, empty_env()); }

static std::string mkdtemp_dir() {
    const char* t = std::getenv("TMPDIR");
    std::string tpl = std::string(t && *t ? t : "/tmp") + "/mega-index-test-XXXXXX";
    std::vector<char> b(tpl.begin(), tpl.end());
    b.push_back('\0');
    if (!mkdtemp(b.data())) {
        std::perror("mkdtemp");
        std::exit(2);
    }
    return b.data();
}
static void mkdirs(const std::string& p) {
    std::string cur;
    for (std::size_t i = 0; i <= p.size(); ++i) {
        if (i == p.size() || p[i] == '/') {
            if (!cur.empty()) ::mkdir(cur.c_str(), 0755);
        }
        if (i < p.size()) cur += p[i];
    }
}
static void write_file(const std::string& p, const std::string& s) {
    std::ofstream f(p, std::ios::binary);
    f << s;
}
static std::string slurp(const std::string& p) {
    std::ifstream f(p, std::ios::binary);
    std::stringstream ss;
    ss << f.rdbuf();
    return ss.str();
}
static std::string shell_out(const std::string& cmd, int* rc = nullptr) {
    std::string out;
    FILE* f = popen(cmd.c_str(), "r");
    char buf[4096];
    std::size_t n;
    while (f && (n = fread(buf, 1, sizeof buf, f)) > 0) out.append(buf, n);
    int st = f ? pclose(f) : -1;
    if (rc) *rc = st;
    return out;
}

static const char* SMALL_CSV =
    "date,w1,w2,w3,w4,w5,mb\n"
    "2025-04-08,10,16,50,60,61,17\n"
    "2025-04-11,1,2,3,4,5,1\n"
    "2025-04-15,5,20,30,40,70,24\n";

static void test_vectors() {
    const Game& mm = mega_millions();
    CHECK(mm.total == 290472336ULL);
    CHECK(mm.white_combos == 12103014ULL);
    CHECK(powerball().total == 292201338ULL);
    CHECK(powerball().white_combos == 11238513ULL);
    struct V { int w[5]; int b; u64 idx; } vs[] = {
        {{7, 19, 33, 48, 62}, 11, 147183154ULL},
        {{8, 24, 37, 38, 66}, 9, 200000000ULL},
        {{1, 2, 3, 4, 5}, 1, 0ULL},
        {{66, 67, 68, 69, 70}, 24, 290472335ULL},
    };
    for (const auto& v : vs) {
        std::vector<int> w(v.w, v.w + 5);
        CHECK(encode(mm, w, v.b) == v.idx);
        Ticket t = decode(mm, v.idx);
        CHECK(t.whites == w && t.bonus == v.b);
    }
    // unsorted input encodes the same
    CHECK(encode(mm, {62, 48, 33, 19, 7}, 11) == 147183154ULL);
    // endpoints
    Ticket t0 = decode(mm, 0), tm = decode(mm, mm.total - 1);
    CHECK(fmt_ticket(mm, t0.whites, t0.bonus) == "01 02 03 04 05 MB 01");
    CHECK(fmt_ticket(mm, tm.whites, tm.bonus) == "66 67 68 69 70 MB 24");
    const Game& pb = powerball();
    Ticket p0 = decode(pb, 0), pm = decode(pb, 292201337ULL);
    CHECK(fmt_ticket(pb, p0.whites, p0.bonus) == "01 02 03 04 05 PB 01");
    CHECK(fmt_ticket(pb, pm.whites, pm.bonus) == "65 66 67 68 69 PB 26");
    CHECK(encode(pb, {65, 66, 67, 68, 69}, 26) == 292201337ULL);
    CHECK(group(290472336ULL) == "290,472,336");
    CHECK(group(5) == "5");
}

static bool valid_ticket(const Game& g, const Ticket& t) {
    if (static_cast<int>(t.whites.size()) != g.white_count) return false;
    if (!std::is_sorted(t.whites.begin(), t.whites.end())) return false;
    for (std::size_t i = 0; i < t.whites.size(); ++i) {
        if (t.whites[i] < 1 || t.whites[i] > g.white_max) return false;
        if (i && t.whites[i] == t.whites[i - 1]) return false;
    }
    return t.bonus >= 1 && t.bonus <= g.bonus_max;
}

static void test_roundtrip() {
    for (const Game* g : {&mega_millions(), &powerball()}) {
        int bad = 0;
        for (int i = 0; i < 150000; ++i) {
            u64 idx = randbelow(g->total);
            Ticket t = decode(*g, idx);
            if (!valid_ticket(*g, t) || encode(*g, t.whites, t.bonus) != idx) ++bad;
        }
        CHECK(bad == 0);
        // decode(encode(t)) == t on random tickets (via random picks of distinct whites)
        bad = 0;
        for (int i = 0; i < 20000; ++i) {
            std::set<int> s;
            while (static_cast<int>(s.size()) < g->white_count) {
                s.insert(1 + static_cast<int>(randbelow(static_cast<u64>(g->white_max))));
            }
            std::vector<int> w(s.begin(), s.end());
            int b = 1 + static_cast<int>(randbelow(static_cast<u64>(g->bonus_max)));
            u64 idx = encode(*g, w, b);
            Ticket t = decode(*g, idx);
            if (idx >= g->total || t.whites != w || t.bonus != b) ++bad;
        }
        CHECK(bad == 0);
    }
}

static void test_randbelow() {
    int counts[24] = {0};
    for (int i = 0; i < 240000; ++i) {
        std::uint32_t r = randbelow(24);
        CHECK(r < 24);
        if (r < 24) counts[r]++;
    }
    for (int c : counts) CHECK(c >= 9500 && c <= 10500);
    CHECK(randbelow(1) == 0);
    bool in_range = true;
    for (int i = 0; i < 1000; ++i) in_range = in_range && randbelow(290472336ULL) < 290472336ULL;
    CHECK(in_range);
    unsigned char b[64] = {0}, c[64] = {0};
    fill_random(b, 64);
    fill_random(c, 64);
    CHECK(!std::equal(b, b + 64, c));
}

static void test_errors() {
    auto err = [](std::vector<std::string> a, int code, const std::string& msg) {
        Result r = cli(a);
        CHECK(r.rc == code);
        CHECK(r.out.empty());
        CHECK(r.err == "error: " + msg + "\n");
    };
    err({"frobnicate"}, 2, "unknown command 'frobnicate'");
    err({"encode", "1", "2", "3", "4", "--bonus", "1"}, 2, "expected 5 white balls, got 4");
    err({"encode", "1", "2", "3", "4", "71", "--bonus", "1"}, 2, "white ball 71 out of range 1-70");
    err({"encode", "0", "2", "3", "4", "5", "--bonus", "1"}, 2, "white ball 0 out of range 1-70");
    err({"encode", "1", "2", "2", "4", "5", "--bonus", "1"}, 2, "duplicate white ball 2");
    err({"encode", "1", "2", "3", "4", "5"}, 2, "missing --bonus");
    err({"encode", "1", "2", "3", "4", "5", "--bonus", "25"}, 2, "Mega Ball 25 out of range 1-24");
    err({"encode", "1", "2", "3", "4", "5", "--bonus", "27", "--game", "powerball"}, 2,
        "Powerball 27 out of range 1-26");
    err({"encode", "70", "2", "3", "4", "5", "--bonus", "1", "--game", "powerball"}, 2,
        "white ball 70 out of range 1-69");
    err({"encode", "1", "2", "3", "4", "x", "--bonus", "1"}, 2, "not an integer: 'x'");
    err({"encode", "1", "2", "3", "4", "5", "--bonus", "-1"}, 2, "not an integer: '-1'");
    err({"encode", "1", "2", "3", "4", "5", "--bonus", "1", "--wat"}, 2, "unknown option '--wat'");
    err({"encode", "1", "--bonus"}, 2, "option --bonus needs a value");
    err({"encode", "-5"}, 2, "unknown option '-5'");
    err({"encode", "+5", "2", "3", "4", "5", "--bonus", "1"}, 2, "not an integer: '+5'");
    err({"decode", "290472336"}, 2, "index 290472336 out of range 0-290472335");
    err({"decode", "292201338", "--game", "powerball"}, 2, "index 292201338 out of range 0-292201337");
    err({"decode"}, 2, "expected exactly one index");
    err({"decode", "1", "2"}, 2, "expected exactly one index");
    err({"decode", "1", "--game", "keno"}, 2, "unknown game 'keno'");
    err({"pick", "-n", "6"}, 2, "plays must be 1-5");
    err({"pick", "-n", "0"}, 2, "plays must be 1-5");
    err({"pick", "--mode", "lucky"}, 2, "unknown mode 'lucky'");
    err({"pick", "--export", "picks.txt"}, 2, "export path must end in .csv or .json");
    err({"pick", "--mode", "hot", "--game", "powerball"}, 1,
        "data file not found (use --data or POWER_INDEX_DATA)");
    err({"pick", "extra"}, 2, "unexpected argument 'extra'");
    err({"stats", "--game", "powerball"}, 1, "data file not found (use --data or POWER_INDEX_DATA)");
    err({"stats", "x"}, 2, "unexpected argument 'x'");
    err({"stats", "--data", "/nonexistent/none.csv"}, 1, "cannot read data file '/nonexistent/none.csv'");
    err({"stats"}, 1, "data file not found (use --data or MEGA_INDEX_DATA)");

    // --opt=value form, --mb alias, repeated option keeps last
    Result r = cli({"encode", "7", "19", "33", "48", "62", "--mb=11", "--game=megamillions"});
    CHECK(r.rc == 0);
    CHECK(r.out == "game: Mega Millions\nticket: 07 19 33 48 62 MB 11\nindex: 147183154\n");
    r = cli({"--bonus", "3", "encode", "1", "2", "3", "4", "5", "--bonus", "1"});
    CHECK(r.rc == 2);  // first token is not a command
    r = cli({"decode", "--game", "keno", "--game", "powerball", "0"});
    CHECK(r.rc == 0 && r.out.find("Powerball") != std::string::npos);
    // help anywhere, no args
    r = cli({"stats", "--help"});
    CHECK(r.rc == 0 && !r.out.empty() && r.err.empty());
    r = cli({"x", "-h"});
    CHECK(r.rc == 0);
    r = cli({});
    CHECK(r.rc == 2 && r.out.empty() && !r.err.empty());
}

static void test_data_loader() {
    const Game& g = mega_millions();
    auto bad = [&](const std::string& text, const std::string& msg) {
        try {
            parse_draws(text, g);
            CHECK(false);
        } catch (const CliError& e) {
            CHECK(e.code == 1);
            CHECK(std::string(e.what()) == msg);
        }
    };
    bad("", "bad data file: header must be 'date,w1,w2,w3,w4,w5,mb'");
    bad("wrong\n", "bad data file: header must be 'date,w1,w2,w3,w4,w5,mb'");
    bad("date,w1,w2,w3,w4,w5,mb\n", "bad data file: no draws");
    bad("date,w1,w2,w3,w4,w5,mb\n\n2025-01-01,1,2,3,4,5\n", "bad data file: line 3");
    bad("date,w1,w2,w3,w4,w5,mb\n2025-01-01,1,2,3,4,4,1\n", "bad data file: line 2");
    bad("date,w1,w2,w3,w4,w5,mb\n2025-01-01,1,2,3,4,71,1\n", "bad data file: line 2");
    bad("date,w1,w2,w3,w4,w5,mb\n2025-01-01,1,2,3,4,5,25\n", "bad data file: line 2");
    bad("date,w1,w2,w3,w4,w5,mb\n25-01-01,1,2,3,4,5,1\n", "bad data file: line 2");
    std::vector<Draw> d = parse_draws(
        "  date,w1,w2,w3,w4,w5,mb \r\n\r\n2025-02-01,5,4,3,2,1,2\r\n2025-01-01,9,8,7,6,10,3\r\n", g);
    CHECK(d.size() == 2 && d[0].date == "2025-01-01" && d[1].date == "2025-02-01");
    CHECK(d[0].whites[0] == 6 && d[0].whites[4] == 10 && d[1].whites[0] == 1);
    // stable sort for equal dates
    d = parse_draws("date,w1,w2,w3,w4,w5,mb\n2025-01-01,1,2,3,4,5,1\n2025-01-01,6,7,8,9,10,2\n", g);
    CHECK(d[0].mb == 1 && d[1].mb == 2);
    // bare CR (classic Mac) and mixed line endings split like the oracle's universal newlines
    d = parse_draws("date,w1,w2,w3,w4,w5,mb\r2025-01-01,1,2,3,4,5,1\r2025-01-02,6,7,8,9,10,2\r", g);
    CHECK(d.size() == 2 && d[1].mb == 2);
    d = parse_draws("date,w1,w2,w3,w4,w5,mb\r\n2025-01-01,1,2,3,4,5,1\n2025-01-02,6,7,8,9,10,2\r"
                    "2025-01-03,1,2,3,4,5,3\n2025-01-04,1,2,3,4,5,4", g);
    CHECK(d.size() == 4 && d[3].mb == 4);
    bad("date,w1,w2,w3,w4,w5,mb\r\r2025-01-01,1,2\r,3,4,5,1\r", "bad data file: line 3");
    // ASCII-only parsing: BOM accepted at the start only; NBSP, Unicode digits, underscores,
    // NEL, U+2028 and \x1c-\x1f are never whitespace, digits or separators; \v \f are whitespace.
    const std::string H = "date,w1,w2,w3,w4,w5,mb\n";
    d = parse_draws("\xef\xbb\xbf" + H + "2025-01-01,1,2,3,4,5,6\n", g);
    CHECK(d.size() == 1);
    bad(H + "\xef\xbb\xbf" "2025-01-01,1,2,3,4,5,6\n", "bad data file: line 2");
    d = parse_draws(H + " \t2025-01-01 , +1,2 ,3,\v4,5\f,6 \n", g);
    CHECK(d.size() == 1 && d[0].mb == 6);
    for (const char* b : {"\xc2\xa0" "2025-01-01,1,2,3,4,5,6", "2025-01-01,1,2,3,4,5,\xc2\xa0" "6",
                          "2025-01-01,1,2,3,4,5,6\xc2\x85", "2025-01-01,1,2,3,4,5,6\xe2\x80\xa8",
                          "2025-01-01,1,2,3,4,5,6\x1f", "\x1c" "2025-01-01,1,2,3,4,5,6",
                          "2025-01-01,1,2,3,4,5,\xd9\xa6", "2025-01-01,1,2,3,4,5,\xef\xbc\x96",
                          "2025-01-01,1_0,2,3,4,5,6", "2025-01-01,1,2,3,4,5,6_",
                          "\xd9\xa6" "025-01-01,1,2,3,4,5,6", "2025-01-01,1,2,3,4,5,+-6"}) {
        bad(H + b + "\n", "bad data file: line 2");
    }
    bad("date,w1,w2,w3,w4,w5,mb\xc2\xa0\n2025-01-01,1,2,3,4,5,6\n",
        "bad data file: header must be 'date,w1,w2,w3,w4,w5,mb'");
    // leading zeros of any length are still the same number; huge values are just out of range
    d = parse_draws("date,w1,w2,w3,w4,w5,mb\n2025-01-01,0000000000000000000000001,2,3,4,5,+6\n", g);
    CHECK(d.size() == 1 && d[0].whites[0] == 1 && d[0].mb == 6);
    bad("date,w1,w2,w3,w4,w5,mb\n2025-01-01,1,2,3,4,99999999999999999999999,6\n",
        "bad data file: line 2");
}

static void test_stats_math() {
    CHECK(fmt2(0, 5, true) == "+0.00");
    CHECK(fmt2(0, 5, false) == "0.00");
    CHECK(fmt2(1, 200, false) == "0.01");   // 0.005 rounds away from zero
    CHECK(fmt2(-1, 200, true) == "-0.01");
    CHECK(fmt2(-1, 1000, true) == "+0.00");  // rounds to zero -> no minus
    CHECK(fmt2(-407, 100, true) == "-4.07");
    CHECK(fmt2(1207, 100, false) == "12.07");
    Stats st(mega_millions(), parse_draws(SMALL_CSV, mega_millions()));
    CHECK(st.D == 3);
    CHECK(st.wgap[70] == 0 && st.wgap[10] == 2 && st.wgap[2] == 1 && st.wgap[69] == 3);
    CHECK(st.bgap[24] == 0 && st.bgap[1] == 1 && st.bgap[5] == 3);
    CHECK(st.wf[5] == 2);
    std::vector<int> hot = st.rank(Rank::Hot, true);
    CHECK(hot[0] == 5 && hot.size() == 70);
    std::vector<int> over = st.rank(Rank::Overdue, true);
    CHECK(over[0] == 6);  // never drawn (gap 3), f 0, lowest number
}

static void test_golden_like(const std::string& root) {
    std::string csv = root + "/tests/golden/draws.csv";
    if (access(csv.c_str(), R_OK) != 0) return;  // not inside the repo checkout
    Result r = run_cli({"guess", "--data", csv}, empty_env());
    CHECK(r.rc == 0);
    CHECK(r.out == slurp(root + "/tests/golden/guess.txt"));
    r = run_cli({"stats", "--data", csv}, empty_env());
    CHECK(r.rc == 0);
    CHECK(r.out == slurp(root + "/tests/golden/stats.txt"));

    // Powerball: 64-bit chi-square/fmt2 path, byte-identical to the oracle's golden files.
    std::string pcsv = root + "/tests/golden/powerball-draws.csv";
    if (access(pcsv.c_str(), R_OK) != 0) return;
    r = run_cli({"stats", "--game", "powerball", "--data", pcsv}, empty_env());
    CHECK(r.rc == 0);
    CHECK(r.out == slurp(root + "/tests/golden/pb_stats.txt"));
    r = run_cli({"guess", "--game", "powerball", "--data", pcsv}, empty_env());
    CHECK(r.rc == 0);
    CHECK(r.out == slurp(root + "/tests/golden/pb_guess.txt"));
    CHECK(r.out.find("POWERBALL GUESS  draws=1435  2015-10-07..2026-11-18\n") == 0);
    CHECK(r.out.find("1 in 292,201,338") != std::string::npos);
    // fmt2 beyond 2^32 (200 * num overflows 32 bits)
    CHECK(fmt2(100000000000LL, 3, false) == "33333333333.33");
    // wrong-game data files are rejected
    r = run_cli({"stats", "--game", "powerball", "--data", csv}, empty_env());
    CHECK(r.rc == 1 && r.err.rfind("error: bad data file: line ", 0) == 0);
    r = run_cli({"guess", "--data", pcsv}, empty_env());
    CHECK(r.rc == 1 && r.err.rfind("error: bad data file: line ", 0) == 0);
    // weighted picks for powerball from the real history
    for (const char* m : {"hot", "cold", "mixed"}) {
        r = run_cli({"pick", "-n", "5", "--mode", m, "--game", "powerball", "--data", pcsv},
                    empty_env());
        CHECK(r.rc == 0);
        CHECK(r.out.rfind(std::string("POWERBALL PICK  mode=") + m + "  plays=5\n", 0) == 0);
        CHECK(r.out.find(" PB ") != std::string::npos);
        CHECK(r.out.find("1 in 292,201,338") != std::string::npos);
    }
}

static void test_picks_and_export() {
    const Game& g = mega_millions();
    Stats st(g, parse_draws(SMALL_CSV, g));
    for (Mode m : {Mode::Uniform, Mode::Hot, Mode::Cold, Mode::Mixed}) {
        for (int round = 0; round < 300; ++round) {
            auto slip = make_slip(g, m, &st, 5);
            std::set<u64> idx;
            bool ok = slip.size() == 5;
            for (const auto& pl : slip) {
                Ticket t{pl.pick.whites, pl.pick.bonus};
                ok = ok && valid_ticket(g, t) && encode(g, t.whites, t.bonus) == pl.pick.index;
                idx.insert(pl.pick.index);
            }
            CHECK(ok);
            CHECK(idx.size() == 5);
            CHECK(slip[0].label == 'A' && slip[4].label == 'E');
        }
    }
    // weighted_take: distinct, no zero-weight draws
    std::map<int, i64> w{{1, 1}, {2, 0 + 1}, {3, 5}};
    for (int i = 0; i < 200; ++i) {
        auto v = weighted_take(w, 3);
        std::set<int> s(v.begin(), v.end());
        CHECK(v.size() == 3 && s.size() == 3);
    }
    // heavy weight dominates first draw
    int heavy = 0;
    for (int i = 0; i < 2000; ++i) heavy += weighted_take({{1, 1}, {2, 99}}, 1)[0] == 2;
    CHECK(heavy > 1900);

    // export formats
    std::vector<Play> plays = {{'A', {{3, 21, 43, 49, 57}, 14, 96625645ULL}},
                               {'B', {{1, 2, 3, 4, 5}, 1, 0ULL}}};
    std::string csv = render_export("x.CSV", plays, g, "hot", "2026-11-20T22:36:10Z");
    CHECK(csv ==
          "play,mode,w1,w2,w3,w4,w5,bonus,index,game,generated_at\n"
          "A,hot,3,21,43,49,57,14,96625645,megamillions,2026-11-20T22:36:10Z\n"
          "B,hot,1,2,3,4,5,1,0,megamillions,2026-11-20T22:36:10Z\n");
    std::string js = render_export("x.json", plays, g, "hot", "2026-11-20T22:36:10Z");
    CHECK(js ==
          "[\n"
          "  {\"play\": \"A\", \"mode\": \"hot\", \"w1\": 3, \"w2\": 21, \"w3\": 43, \"w4\": 49, "
          "\"w5\": 57, \"bonus\": 14, \"index\": 96625645, \"game\": \"megamillions\", "
          "\"generated_at\": \"2026-11-20T22:36:10Z\"},\n"
          "  {\"play\": \"B\", \"mode\": \"hot\", \"w1\": 1, \"w2\": 2, \"w3\": 3, \"w4\": 4, "
          "\"w5\": 5, \"bonus\": 1, \"index\": 0, \"game\": \"megamillions\", "
          "\"generated_at\": \"2026-11-20T22:36:10Z\"}\n"
          "]\n");
    std::string stamp = utc_stamp();
    CHECK(stamp.size() == 20 && stamp[10] == 'T' && stamp[19] == 'Z');

    // via CLI: export to file, output line, unwritable path
    std::string tmp = mkdtemp_dir();
    Result r = cli({"pick", "-n", "3", "--export", tmp + "/p.json"});
    CHECK(r.rc == 0);
    CHECK(r.out.find("exported 3 plays to " + tmp + "/p.json\n") != std::string::npos);
    std::string body = slurp(tmp + "/p.json");
    CHECK(body.rfind("[\n  {\"play\": \"A\", \"mode\": \"uniform\"", 0) == 0);
    CHECK(body.size() > 4 && body.substr(body.size() - 4) == "}\n]\n");
    r = cli({"pick", "--export", tmp + "/no-such-dir/p.csv"});
    CHECK(r.rc == 1);
    CHECK(r.err == "error: cannot write '" + tmp + "/no-such-dir/p.csv'\n");
    CHECK(r.out.find("PICK  mode=uniform  plays=1") != std::string::npos);
    CHECK(r.out.find("exported") == std::string::npos);
    r = cli({"pick", "-n", "2", "--game", "powerball"});
    CHECK(r.rc == 0 && r.out.rfind("POWERBALL PICK  mode=uniform  plays=2\n", 0) == 0);
    CHECK(r.out.find("1 in 292,201,338.") != std::string::npos);
    CHECK(r.out.find(" PB ") != std::string::npos);
    // weighted CLI pick with data
    write_file(tmp + "/d.csv", SMALL_CSV);
    r = cli({"pick", "--mode", "mixed", "-n", "5", "--data", tmp + "/d.csv"});
    CHECK(r.rc == 0 && r.out.rfind("MEGA MILLIONS PICK  mode=mixed  plays=5\n", 0) == 0);
    std::remove((tmp + "/p.json").c_str());
}

static void test_data_discovery() {
    std::string tmp = mkdtemp_dir();
    mkdirs(tmp + "/proj/data");
    mkdirs(tmp + "/proj/a/b/c");
    mkdirs(tmp + "/proj/bin");
    mkdirs(tmp + "/elsewhere");
    mkdirs(tmp + "/other");
    write_file(tmp + "/proj/data/draws.csv", SMALL_CSV);
    write_file(tmp + "/cli.csv", SMALL_CSV);
    write_file(tmp + "/env.csv", SMALL_CSV);

    // find_data precedence
    std::string cli_path = "explicit.csv";
    DataEnv e{tmp + "/env.csv", tmp + "/proj/a/b/c", tmp + "/other", ""};
    CHECK(find_data(&cli_path, e, mega_millions()) == "explicit.csv");
    CHECK(find_data(nullptr, e, mega_millions()) == tmp + "/env.csv");
    e.env_data = "";
    CHECK(find_data(nullptr, e, mega_millions()) == tmp + "/proj/data/draws.csv");  // walk up from cwd
    e.cwd = tmp + "/elsewhere";
    e.exe_dir = tmp + "/proj/bin";
    CHECK(find_data(nullptr, e, mega_millions()) == tmp + "/proj/data/draws.csv");  // walk up from exe dir
    e.exe_dir = tmp + "/other";
    bool threw = false;
    try {
        find_data(nullptr, e, mega_millions());
    } catch (const CliError& ce) {
        threw = ce.code == 1 && std::string(ce.what()) ==
                                    "data file not found (use --data or MEGA_INDEX_DATA)";
    }
    // Only a failure if a stray /tmp/data/draws.csv or /data/draws.csv exists on this machine.
    CHECK(threw || access("/data/draws.csv", F_OK) == 0 || access("/tmp/data/draws.csv", F_OK) == 0);
    CHECK(DataEnv::from_process().exe_dir.size() > 0);  // /proc/self/exe resolves

    // through run()
    e = DataEnv{"", tmp + "/proj/a", tmp + "/other", ""};
    Result r = run_cli({"guess"}, e);
    CHECK(r.rc == 0 && r.out.rfind("MEGA MILLIONS GUESS  draws=3  2025-04-08..2025-04-15\n", 0) == 0);

    if (g_bin.empty()) return;
    // real binary: env var, cwd walk, exe-dir walk (via /proc/self/exe)
    int rc = 0;
    std::string o = shell_out("cd '" + tmp + "/elsewhere' && MEGA_INDEX_DATA='" + tmp +
                                  "/env.csv' '" + g_bin + "' guess 2>&1", &rc);
    CHECK(rc == 0 && o.rfind("MEGA MILLIONS GUESS  draws=3", 0) == 0);
    o = shell_out("cd '" + tmp + "/proj/a/b' && env -u MEGA_INDEX_DATA '" + g_bin + "' guess 2>&1", &rc);
    CHECK(rc == 0 && o.rfind("MEGA MILLIONS GUESS  draws=3", 0) == 0);
    o = shell_out("cd '" + tmp + "/proj/a/b' && env -u MEGA_INDEX_DATA '" + g_bin +
                      "' guess --data '" + tmp + "/cli.csv' 2>&1", &rc);
    CHECK(rc == 0);
    std::string cp = "cp '" + g_bin + "' '" + tmp + "/proj/bin/mega-index'";
    CHECK(std::system(cp.c_str()) == 0);
    o = shell_out("cd '" + tmp + "/elsewhere' && env -u MEGA_INDEX_DATA '" + tmp +
                      "/proj/bin/mega-index' stats 2>&1", &rc);
    CHECK(rc == 0 && o.rfind("MEGA MILLIONS STATS\ndraws: 3\n", 0) == 0);
    // not found anywhere (copy binary to a dir without data above it)
    mkdirs(tmp + "/nodata");
    cp = "cp '" + g_bin + "' '" + tmp + "/nodata/mega-index'";
    CHECK(std::system(cp.c_str()) == 0);
    o = shell_out("cd '" + tmp + "/elsewhere' && env -u MEGA_INDEX_DATA '" + tmp +
                      "/nodata/mega-index' stats 2>&1 >/dev/null", &rc);
    CHECK(o == "error: data file not found (use --data or MEGA_INDEX_DATA)\n" ||
          access("/tmp/data/draws.csv", F_OK) == 0);
    // binary: bad args exit code 2, no args usage on stderr
    o = shell_out("'" + g_bin + "' decode 0 2>/dev/null");
    CHECK(o == "game: Mega Millions\nticket: 01 02 03 04 05 MB 01\nindex: 0\n");
    shell_out("'" + g_bin + "' >/dev/null 2>&1", &rc);
    CHECK(WIFEXITED(rc) && WEXITSTATUS(rc) == 2);
}

static void test_powerball_data() {
    const Game& pb = powerball();
    static const char* const PB_CSV =
        "date,w1,w2,w3,w4,w5,mb\n2015-10-07,18,30,40,48,52,9\n2015-10-10,5,10,69,20,1,26\n"
        "2015-10-14,69,68,67,66,65,2\n";
    std::vector<Draw> d = parse_draws(PB_CSV, pb);
    CHECK(d.size() == 3 && d[1].whites[0] == 1 && d[1].whites[4] == 69 && d[1].mb == 26);
    // 69 / bonus 26 are fine for Powerball but invalid for Mega Millions? (69 ok, 26 not)
    bool threw = false;
    try {
        parse_draws(PB_CSV, mega_millions());
    } catch (const CliError& e) {
        threw = e.code == 1 && std::string(e.what()) == "bad data file: line 3";
    }
    CHECK(threw);
    Stats st(pb, d);
    CHECK(st.wf.size() == 70 && st.bf.size() == 27);
    CHECK(st.wf[69] == 2 && st.bf[26] == 1);

    // weighted picks only ever produce Powerball-valid tickets
    for (Mode m : {Mode::Hot, Mode::Cold, Mode::Mixed}) {
        for (int i = 0; i < 300; ++i) {
            Pick p = make_pick(pb, m, &st);
            CHECK(p.whites.size() == 5 && p.bonus >= 1 && p.bonus <= 26 && p.index < pb.total);
            CHECK(encode(pb, p.whites, p.bonus) == p.index);
            std::set<int> u(p.whites.begin(), p.whites.end());
            CHECK(u.size() == 5 && *u.begin() >= 1 && *u.rbegin() <= 69);
        }
    }

    // data discovery: POWER_INDEX_DATA and powerball-draws.csv, per game isolation
    std::string tmp = mkdtemp_dir();
    mkdirs(tmp + "/proj/data");
    mkdirs(tmp + "/proj/a/b");
    mkdirs(tmp + "/proj/bin");
    mkdirs(tmp + "/elsewhere");
    mkdirs(tmp + "/other");
    write_file(tmp + "/proj/data/powerball-draws.csv", PB_CSV);
    write_file(tmp + "/env.csv", PB_CSV);
    DataEnv e{"/mm/only.csv", tmp + "/proj/a/b", tmp + "/other", tmp + "/env.csv"};
    CHECK(find_data(nullptr, e, pb) == tmp + "/env.csv");           // own env var
    CHECK(find_data(nullptr, e, mega_millions()) == "/mm/only.csv");  // not POWER_INDEX_DATA
    std::string cli_path = "x.csv";
    CHECK(find_data(&cli_path, e, pb) == "x.csv");
    e.env_data_pb = "";
    CHECK(find_data(nullptr, e, pb) == tmp + "/proj/data/powerball-draws.csv");
    e.env_data = "";
    e.cwd = tmp + "/elsewhere";
    e.exe_dir = tmp + "/proj/bin";
    CHECK(find_data(nullptr, e, pb) == tmp + "/proj/data/powerball-draws.csv");  // exe dir walk
    e.exe_dir = tmp + "/other";
    bool nf = false, nm = false;
    try {
        find_data(nullptr, e, pb);
    } catch (const CliError& ce) {
        nf = ce.code == 1 &&
             std::string(ce.what()) == "data file not found (use --data or POWER_INDEX_DATA)";
    }
    CHECK(nf || access("/data/powerball-draws.csv", F_OK) == 0 ||
          access("/tmp/data/powerball-draws.csv", F_OK) == 0);
    // powerball file is not mistaken for the mega millions one
    e.cwd = tmp + "/proj/a/b";
    try {
        find_data(nullptr, e, mega_millions());
    } catch (const CliError& ce) {
        nm = std::string(ce.what()) == "data file not found (use --data or MEGA_INDEX_DATA)";
    }
    CHECK(nm || access("/data/draws.csv", F_OK) == 0 || access("/tmp/data/draws.csv", F_OK) == 0);

    // through run()
    Result r = run_cli({"stats", "--game", "powerball"}, DataEnv{"", "/nonexistent", "", tmp + "/env.csv"});
    CHECK(r.rc == 0 && r.out.rfind("POWERBALL STATS\ndraws: 3\n", 0) == 0);
    CHECK(r.out.find("expected PB freq: 0.12\n") != std::string::npos);
    CHECK(r.out.find("HOT PB:") != std::string::npos);
    // MEGA_INDEX_DATA does not leak into powerball
    r = run_cli({"guess", "--game", "powerball"}, DataEnv{tmp + "/env.csv", "/nonexistent", "", ""});
    CHECK(r.rc == 1 && r.err == "error: data file not found (use --data or POWER_INDEX_DATA)\n");
    r = run_cli({"pick", "--mode", "mixed", "--game", "powerball"},
                DataEnv{"", "/nonexistent", "", tmp + "/env.csv"});
    CHECK(r.rc == 0 && r.out.rfind("POWERBALL PICK  mode=mixed  plays=1\n", 0) == 0);

    if (g_bin.empty()) return;
    int rc = 0;
    std::string o = shell_out("cd '" + tmp + "/elsewhere' && env -u MEGA_INDEX_DATA POWER_INDEX_DATA='" +
                                  tmp + "/env.csv' '" + g_bin + "' guess --game powerball 2>&1", &rc);
    CHECK(rc == 0 && o.rfind("POWERBALL GUESS  draws=3", 0) == 0);
    mkdirs(tmp + "/nodata");
    std::string cp = "cp '" + g_bin + "' '" + tmp + "/nodata/mega-index'";
    CHECK(std::system(cp.c_str()) == 0);
    o = shell_out("cd '" + tmp + "/elsewhere' && MEGA_INDEX_DATA='" + tmp + "/env.csv' env -u POWER_INDEX_DATA '" +
                      tmp + "/nodata/mega-index' guess --game powerball 2>&1 >/dev/null", &rc);
    CHECK(o == "error: data file not found (use --data or POWER_INDEX_DATA)\n" ||
          access("/tmp/data/powerball-draws.csv", F_OK) == 0);
    o = shell_out("cd '" + tmp + "/proj/a/b' && env -u POWER_INDEX_DATA '" + g_bin +
                      "' pick --mode hot --game powerball 2>&1", &rc);
    CHECK(rc == 0 && o.rfind("POWERBALL PICK  mode=hot  plays=1\n", 0) == 0);
}

int main(int argc, char** argv) {
    if (argc > 1) g_bin = argv[1];
    // repo root guess: <bin>/../../../.. (src/cpp/build/mega-index -> repo root)
    std::string root;
    if (!g_bin.empty()) {
        std::string p = g_bin;
        for (int i = 0; i < 4; ++i) {
            std::size_t s = p.find_last_of('/');
            if (s == std::string::npos) { p.clear(); break; }
            p.resize(s);
        }
        root = p;
    }
    test_vectors();
    test_roundtrip();
    test_randbelow();
    test_errors();
    test_data_loader();
    test_stats_math();
    if (!root.empty()) test_golden_like(root);
    test_picks_and_export();
    test_data_discovery();
    test_powerball_data();
    std::printf("%d checks, %d failed\n", g_checks, g_fails);
    return g_fails == 0 ? 0 : 1;
}
