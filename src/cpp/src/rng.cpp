#include "mega_index/rng.hpp"

#include <sys/random.h>

#include <cerrno>
#include <cstdio>
#include <stdexcept>

namespace mega_index {

namespace {

bool fill_getrandom(unsigned char* buf, std::size_t len) {
    std::size_t got = 0;
    while (got < len) {
        ssize_t r = ::getrandom(buf + got, len - got, 0);
        if (r < 0) {
            if (errno == EINTR) continue;
            return false;  // ENOSYS, EPERM (seccomp), ...: use fallback
        }
        got += static_cast<std::size_t>(r);
    }
    return true;
}

bool fill_urandom(unsigned char* buf, std::size_t len) {
    std::FILE* f = std::fopen("/dev/urandom", "rb");
    if (!f) return false;
    std::size_t got = 0;
    while (got < len) {
        std::size_t r = std::fread(buf + got, 1, len - got, f);
        if (r == 0) {
            if (std::ferror(f) && errno == EINTR) {
                std::clearerr(f);
                continue;
            }
            break;
        }
        got += r;
    }
    std::fclose(f);
    return got == len;
}

}  // namespace

void fill_random(unsigned char* buf, std::size_t len) {
    if (fill_getrandom(buf, len)) return;
    if (fill_urandom(buf, len)) return;
    throw std::runtime_error("no OS random source available");
}

std::uint32_t randbelow(std::uint64_t n) {
    const std::uint64_t two32 = 1ULL << 32;
    const std::uint64_t limit = two32 - (two32 % n);
    for (;;) {
        unsigned char b[4];
        fill_random(b, 4);
        std::uint64_t u = static_cast<std::uint64_t>(b[0]) | (static_cast<std::uint64_t>(b[1]) << 8) |
                          (static_cast<std::uint64_t>(b[2]) << 16) |
                          (static_cast<std::uint64_t>(b[3]) << 24);
        if (u < limit) return static_cast<std::uint32_t>(u % n);
    }
}

}  // namespace mega_index
