#pragma once
#include <cstddef>
#include <cstdint>

namespace mega_index {

// Fill buf with OS CSPRNG bytes: getrandom(2) (retrying on EINTR/partial reads),
// falling back to /dev/urandom. Throws std::runtime_error if both fail.
void fill_random(unsigned char* buf, std::size_t len);

// Uniform integer in [0, n), 1 <= n <= 2^32, by rejection (no modulo bias).
std::uint32_t randbelow(std::uint64_t n);

}  // namespace mega_index
