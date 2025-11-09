// src-tauri/src/commands/system_commands.rs
// System-related Tauri commands

use std::sync::Arc;
use tokio::sync::RwLock;
use serde_json::Value;
use crate::state_mod::AppState;

// Engine-level command functions must not depend on Tauri so the engine crate
// can remain framework-agnostic. The binary crate (src-tauri) will provide
// small Tauri wrappers that call these functions.

pub type AppStateType = Arc<RwLock<AppState>>;

/// Get overall system status (engine-level). Accepts an Arc<RwLock<AppState>> so
/// callers (including wrappers) can pass in the shared state.
pub async fn get_system_status(state: AppStateType) -> Result<Value, String> {
    let app_state = state.read().await;
    // Use the existing get_app_stats() method on AppState for system stats
    let status = app_state.get_app_stats().await;
    serde_json::to_value(status).map_err(|e| e.to_string())
}

/// List loaded plugins
pub async fn list_plugins(state: AppStateType) -> Result<Vec<String>, String> {
    let app_state = state.read().await;
    // Return plugin IDs from the AppState plugin info
    let plugins = app_state.get_plugin_info().await;
    Ok(plugins.into_iter().map(|p| p.id).collect())
}

/// Load a plugin (behavior depends on license tier)
pub async fn load_plugin(state: AppStateType, plugin_path: String) -> Result<String, String> {
    // Delegate plugin loading to the plugin-specific module so plugin logic
    // remains colocated in `commands_plugin.rs`.
    crate::commands_plugin::load_plugin_from_path(state, plugin_path).await
}

/// Unload a plugin
pub async fn unload_plugin(state: AppStateType, plugin_id: String) -> Result<(), String> {
    // Delegate plugin unloading to the plugin-specific module implementation.
    crate::commands_plugin::unload_plugin_by_id(state, plugin_id).await
}
