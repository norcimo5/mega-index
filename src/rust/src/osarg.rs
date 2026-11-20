//! Lossless handling of non-UTF-8 command-line bytes (file names on Unix are arbitrary bytes).
//!
//! `decode` keeps valid UTF-8 as is and maps every invalid byte 0x80..=0xFF to the private-use
//! scalar U+10FF00 + byte (the same idea as Python's `surrogateescape`). `encode` reverses it, so
//! a path given on the command line is opened, and echoed in messages, byte for byte.

use std::ffi::OsStr;
use std::path::PathBuf;

const BASE: u32 = 0x10FF00;

#[cfg(unix)]
pub fn decode(arg: &OsStr) -> String {
    use std::os::unix::ffi::OsStrExt;
    let mut out = String::new();
    let mut rest = arg.as_bytes();
    loop {
        match std::str::from_utf8(rest) {
            Ok(s) => {
                out.push_str(s);
                return out;
            }
            Err(e) => {
                let (good, bad) = rest.split_at(e.valid_up_to());
                out.push_str(&String::from_utf8_lossy(good));
                out.push(char::from_u32(BASE + bad[0] as u32).unwrap_or('\u{FFFD}'));
                rest = &bad[1..];
            }
        }
    }
}

#[cfg(not(unix))]
pub fn decode(arg: &OsStr) -> String {
    arg.to_string_lossy().into_owned()
}

/// The original bytes of a string produced by `decode`.
pub fn encode(s: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(s.len());
    let mut buf = [0u8; 4];
    for c in s.chars() {
        let u = c as u32;
        if (BASE + 0x80..=BASE + 0xFF).contains(&u) {
            out.push((u - BASE) as u8);
        } else {
            out.extend_from_slice(c.encode_utf8(&mut buf).as_bytes());
        }
    }
    out
}

/// The filesystem path named by a (possibly escaped) argument string.
#[cfg(unix)]
pub fn path(s: &str) -> PathBuf {
    use std::os::unix::ffi::OsStringExt;
    PathBuf::from(std::ffi::OsString::from_vec(encode(s)))
}

#[cfg(not(unix))]
pub fn path(s: &str) -> PathBuf {
    PathBuf::from(s)
}
