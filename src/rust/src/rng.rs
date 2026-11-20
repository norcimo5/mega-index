//! OS CSPRNG only. `randbelow(n)` is uniform in [0, n), 1 <= n <= 2^32.

/// One 32-bit value from the OS CSPRNG (getrandom, falling back to /dev/urandom).
pub fn os_u32() -> u32 {
    let mut buf = [0u8; 4];
    if getrandom::getrandom(&mut buf).is_err() {
        use std::io::Read;
        let mut f = std::fs::File::open("/dev/urandom").expect("no OS randomness available");
        f.read_exact(&mut buf).expect("cannot read /dev/urandom");
    }
    u32::from_le_bytes(buf)
}

/// Rejection sampling over an arbitrary 32-bit source (testable).
pub fn randbelow_with<F: FnMut() -> u32>(n: u64, mut src: F) -> u64 {
    assert!((1..=1u64 << 32).contains(&n), "randbelow range");
    let space: u64 = 1 << 32;
    let limit = space - (space % n);
    loop {
        let u = src() as u64;
        if u < limit {
            return u % n;
        }
    }
}

pub fn randbelow(n: u64) -> u64 {
    randbelow_with(n, os_u32)
}
