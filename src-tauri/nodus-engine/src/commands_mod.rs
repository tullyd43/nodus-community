// src-tauri/src/commands/system_commands.rs
// System-related Tauri commands

use tauri::State;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde_json::Value;
use crate::state_mod::AppState;

type AppStateType = Arc<RwLock<AppState>>;

/// Get overall system status
#[tauri::command]
pub async fn get_system_status(state: State<'_, AppStateType>) -> Result<Value, String> {
    let app_state = state.read().await;
    let status = app_state.get_system_status().await;
    
    Ok(serde_json::to_value(status).map_err(|e| e.to_string())?)
}

/// List loaded plugins
#[tauri::command]
pub async fn list_plugins(state: State<'_, AppStateType>) -> Result<Vec<String>, String> {
    let app_state = state.read().await;
    Ok(app_state.list_plugins().await)
}

/// Load a plugin (behavior depends on license tier)
#[tauri::command]
pub async fn load_plugin(
    state: State<'_, AppStateType>,
    plugin_path: String,
) -> Result<String, String> {
    let app_state = state.read().await;
    
    match app_state.load_plugin(&plugin_path).await {
        Ok(plugin_id) => Ok(plugin_id),
        Err(e) => Err(e.to_string()),
    }
}

/// Unload a plugin
#[tauri::command]
pub async fn unload_plugin(
    state: State<'_, AppStateType>,
    plugin_id: String,
) -> Result<(), String> {
    let app_state = state.read().await;
    
    match app_state.unload_plugin(&plugin_id).await {
        Ok(()) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
