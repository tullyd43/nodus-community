//! Library root for the local `nodus` engine crate.
//!
//! This file exposes a small, focused surface used by the Tauri binary.

pub mod action_dispatcher;
pub mod async_orchestrator;
pub mod commands;
pub mod commands_plugin;
pub mod state_mod;
pub mod universal_plugin_system;

// CRITICAL: Add your license module
pub mod license_mod;

// The grid commands file is named `commands_grid.rs` in this layout.
pub mod commands_async;
pub mod commands_grid;

// Storage modules for grid data persistence
pub mod storage;

// NOTE: keeping the public module surface explicit and clean.
// No backward-compatibility aliases — callers should use the canonical module names

// Other modules exist in the `src` directory but are internal to the engine
// implementation and not required by the Tauri entrypoint at the moment.