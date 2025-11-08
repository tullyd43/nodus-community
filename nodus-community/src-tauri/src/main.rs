// src-tauri/src/main.rs (Community Version)
// This is 100% open-source and has no license checks.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

// Use types and commands from the local engine crate. The project no longer
// exposes a separate `license` module; `state_mod` contains the minimal
// license-related types required for the community build.
use nodus::state_mod::AppState;

type AppStateType = Arc<RwLock<AppState>>;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();
    println!("🦀 Starting Nodus Community");

    // NO license check. Just create the community state directly.
    println!("🌍 Initializing Community version...");
    let app_state = AppState::new_community().await?;
    let app_state_arc = Arc::new(RwLock::new(app_state));
    println!("✅ Application state initialized for Community tier");

    // Provide the shared app state to Tauri and register small wrapper
    // commands that forward into the engine functions. The engine functions
    // are framework-agnostic and accept AppStateType.
    tauri::Builder::default()
        .manage(app_state_arc.clone())
        .invoke_handler(tauri::generate_handler![
            // System commands (wrappers)
            wrapper_get_system_status,
            // Plugin commands (wrappers)
            wrapper_list_plugins,
            wrapper_load_plugin,
            wrapper_unload_plugin,
            // Grid commands (wrappers)
            wrapper_execute_action,
            wrapper_get_grid_config,
            wrapper_save_grid_config,
            wrapper_update_grid_state,
            wrapper_ping,
            // Async orchestrator commands (wrappers)
            wrapper_start_async_operation,
            wrapper_complete_async_operation,
            wrapper_get_active_operations_count,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}

// Tauri wrappers: small annotated functions that adapt Tauri State to the
// engine-level API. They clone the Arc and forward the call.
#[tauri::command]
async fn wrapper_get_system_status(
    state: State<'_, AppStateType>,
) -> Result<serde_json::Value, String> {
    let arc = state.inner().clone();
    nodus::commands::get_system_status(arc).await
}

#[tauri::command]
async fn wrapper_list_plugins(state: State<'_, AppStateType>) -> Result<Vec<String>, String> {
    let arc = state.inner().clone();
    nodus::commands::list_plugins(arc).await
}

#[tauri::command]
async fn wrapper_load_plugin(
    state: State<'_, AppStateType>,
    plugin_path: String,
) -> Result<String, String> {
    let arc = state.inner().clone();
    nodus::commands::load_plugin(arc, plugin_path).await
}

#[tauri::command]
async fn wrapper_unload_plugin(
    state: State<'_, AppStateType>,
    plugin_id: String,
) -> Result<(), String> {
    let arc = state.inner().clone();
    nodus::commands::unload_plugin(arc, plugin_id).await
}

// Grid command wrappers
#[tauri::command]
async fn wrapper_execute_action(
    state: State<'_, AppStateType>,
    action: nodus::action_dispatcher::Action,
) -> Result<serde_json::Value, String> {
    let arc = state.inner().clone();
    nodus::commands_grid::execute_action(arc, action).await
}

#[tauri::command]
async fn wrapper_get_grid_config(
    state: State<'_, AppStateType>,
    config_id: String,
) -> Result<nodus::commands_grid::GridConfig, String> {
    let arc = state.inner().clone();
    nodus::commands_grid::get_grid_config(arc, config_id).await
}

#[tauri::command]
async fn wrapper_save_grid_config(
    state: State<'_, AppStateType>,
    config_id: String,
    config: nodus::commands_grid::GridConfig,
) -> Result<(), String> {
    let arc = state.inner().clone();
    nodus::commands_grid::save_grid_config(arc, config_id, config).await
}

#[tauri::command]
async fn wrapper_update_grid_state(
    state: State<'_, AppStateType>,
    state_update: nodus::commands_grid::GridStateUpdate,
) -> Result<(), String> {
    let arc = state.inner().clone();
    nodus::commands_grid::update_grid_state(arc, state_update).await
}

#[tauri::command]
async fn wrapper_ping(state: State<'_, AppStateType>) -> Result<String, String> {
    let arc = state.inner().clone();
    nodus::commands_grid::ping(arc).await
}

// Async orchestrator command wrappers
#[tauri::command]
async fn wrapper_start_async_operation(
    state: State<'_, AppStateType>,
    context: nodus::commands_async::AsyncOperationContext,
) -> Result<(), String> {
    let arc = state.inner().clone();
    nodus::commands_async::start_async_operation(arc, context).await
}

#[tauri::command]
async fn wrapper_complete_async_operation(
    state: State<'_, AppStateType>,
    operation_id: String,
    success: bool,
    result: Option<String>,
    error: Option<String>,
) -> Result<nodus::commands_async::OperationResult, String> {
    let arc = state.inner().clone();
    nodus::commands_async::complete_async_operation(arc, operation_id, success, result, error).await
}

#[tauri::command]
async fn wrapper_get_active_operations_count(
    state: State<'_, AppStateType>,
) -> Result<usize, String> {
    let arc = state.inner().clone();
    nodus::commands_async::get_active_operations_count(arc).await
}
