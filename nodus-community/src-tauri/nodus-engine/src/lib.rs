//! Library root for the local `nodus` engine crate.
//!
//! This file exposes a small, focused surface used by the Tauri binary.

pub mod commands;
pub mod state_mod;

// Other modules exist in the `src` directory but are internal to the engine
// implementation and not required by the Tauri entrypoint at the moment.
