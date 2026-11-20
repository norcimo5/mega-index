#include <signal.h>

#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "mega_index/cli.hpp"

int main(int argc, char** argv) {
    // A closed pipe must surface as a write error (handled below), not kill the process.
    ::signal(SIGPIPE, SIG_IGN);
    std::vector<std::string> args(argv + 1, argv + argc);
    std::ostringstream out, err;
    int rc = mega_index::run(args, out, err, mega_index::DataEnv::from_process());
    const std::string o = out.str();
    if (!o.empty() && std::fwrite(o.data(), 1, o.size(), stdout) != o.size()) {
        std::fputs("error: cannot write output\n", stderr);
        return 1;
    }
    if (std::fflush(stdout) != 0) {
        std::fputs("error: cannot write output\n", stderr);
        return 1;
    }
    const std::string e = err.str();
    if (!e.empty()) std::fwrite(e.data(), 1, e.size(), stderr);
    return rc;
}
