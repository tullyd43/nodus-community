// Minimal binary entrypoint for test builds
// Some Cargo.toml configurations expect a `nodus-app` binary. Provide
// a tiny main so integration tests can build without requiring the full
// Tauri binary during CI/local `cargo test` runs.

fn main() {
    // Intentionally minimal. Tests exercise the library crate; the binary
    // is only present to satisfy Cargo's build requirements in this repository layout.
}
