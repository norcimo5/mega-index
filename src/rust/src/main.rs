use std::io::Write;

fn main() {
    let args: Vec<String> = std::env::args_os()
        .skip(1)
        .map(|a| mega_index::osarg::decode(&a))
        .collect();
    let res = mega_index::cli::run(&args);
    let stdout = std::io::stdout();
    let mut lock = stdout.lock();
    let wrote = lock.write_all(&mega_index::osarg::encode(&res.stdout)).and_then(|_| lock.flush());
    if wrote.is_err() {
        // Full disk / closed pipe: one clean error, exit 1 (SPEC section 8).
        let _ = std::io::stderr().write_all(b"error: cannot write output\n");
        std::process::exit(1);
    }
    if !res.stderr.is_empty() {
        let _ = std::io::stderr().write_all(&mega_index::osarg::encode(&res.stderr));
    }
    std::process::exit(res.code);
}
