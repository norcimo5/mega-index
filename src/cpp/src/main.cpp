#include <iostream>
#include <string>
#include <vector>

#include "mega_index/cli.hpp"

int main(int argc, char** argv) {
    std::vector<std::string> args(argv + 1, argv + argc);
    int rc = mega_index::run(args, std::cout, std::cerr, mega_index::DataEnv::from_process());
    std::cout.flush();
    return rc;
}
