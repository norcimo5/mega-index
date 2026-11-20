//! mega-index: ticket <-> index codec, CSPRNG picker, and hot/cold stats.
//! Implements SPEC.md; see README.md.

pub mod cli;
pub mod codec;
pub mod data;
pub mod export;
pub mod game;
pub mod osarg;
pub mod picks;
pub mod rng;
pub mod stats;

/// A CLI error: message for `error: <msg>` on stderr plus the exit code.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CliError {
    pub msg: String,
    pub code: i32,
}

impl CliError {
    pub fn usage<S: Into<String>>(msg: S) -> Self {
        CliError { msg: msg.into(), code: 2 }
    }
    pub fn runtime<S: Into<String>>(msg: S) -> Self {
        CliError { msg: msg.into(), code: 1 }
    }
}

pub type Result<T> = std::result::Result<T, CliError>;
