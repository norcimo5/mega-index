use std::io::Write;

fn main() {
    let args: Vec<String> = std::env::args_os()
        .skip(1)
        .map(|a| mega_index::osarg::decode(&a))
        .collect();
    let res = mega_index::cli::run(&args);
    let stdout = std::io::stdout();
    let mut lock = stdout.lock();
    let _ = lock.write_all(&mega_index::osarg::encode(&res.stdout));
    let _ = lock.flush();
    if !res.stderr.is_empty() {
        let _ = std::io::stderr().write_all(&mega_index::osarg::encode(&res.stderr));
    }
    std::process::exit(res.code);
}
