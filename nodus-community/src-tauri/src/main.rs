// src-tauri/src/main.rs (Community Version)
// This is 100% open-source and uses the integrated license system.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

// Use types and commands from the local engine crate with integrated license system
use nodus::state_mod::AppState;

type AppStateType = Arc<RwLock<AppState>>;

// Backwards-compatible frontend-facing wrappers (names expected by the JS safeInvoke)
// These must be declared before the generate_handler! invocation so the macro
// expansion can find the generated command symbols.
#[tauri::command]
async fn register_js_plugin(
    state: State<'_, AppStateType>,
    plugin_request: nodus::commands_plugin::JSPluginRequest,
) -> Result<nodus::commands_plugin::PluginRegistrationResponse, String> {
    let arc = state.inner().clone();
    nodus::commands_plugin::register_js_plugin(arc, plugin_request).await
}

#[tauri::command]
async fn execute_action_with_plugins(
    state: State<'_, AppStateType>,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    // Support two shapes coming from the frontend:
    // 1) Direct top-level: { actionType: "...", payload: { ... } }
    // 2) Wrapped by the Tauri low-level invoke shape: { args: { actionType: "...", payload: { ... } } }
    // Normalize to a single `effective_args` value so both callers work.
    let effective_args = if let Some(inner) = args.get("args") {
        inner.clone()
    } else {
        args.clone()
    };

    // Accept either camelCase (actionType) or snake_case (action_type)
    let action_type = effective_args
        .get("actionType")
        .or_else(|| effective_args.get("action_type"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing actionType".to_string())?
        .to_string();

    let payload = effective_args.get("payload").cloned().unwrap_or_else(|| serde_json::json!({}));

    let arc = state.inner().clone();
    nodus::commands_plugin::execute_action_with_plugins(arc, action_type, payload).await
}

#[tauri::command]
async fn get_loaded_plugins(state: State<'_, AppStateType>) -> Result<serde_json::Value, String> {
    let arc = state.inner().clone();
    match nodus::commands_plugin::get_loaded_plugins(arc).await {
        Ok(list) => Ok(serde_json::to_value(list).unwrap_or_else(|_| serde_json::json!([]))),
        Err(e) => Err(e),
    }
}

#[tauri::command]
async fn remove_js_plugin(state: State<'_, AppStateType>, plugin_id: String) -> Result<(), String> {
    let arc = state.inner().clone();
    nodus::commands_plugin::remove_js_plugin(arc, plugin_id).await
}

#[tauri::command]
async fn get_plugin_marketplace(_state: State<'_, AppStateType>) -> Result<serde_json::Value, String> {
    // Marketplace listing is not implemented yet; return empty list for now
    Ok(serde_json::json!([]))
}

#[tauri::command]
async fn install_marketplace_plugin(state: State<'_, AppStateType>, plugin_id: String) -> Result<nodus::commands_plugin::PluginRegistrationResponse, String> {
    let arc = state.inner().clone();
    nodus::commands_plugin::install_marketplace_plugin(arc, plugin_id, None).await
}

#[tauri::command]
async fn get_system_plugin_status(state: State<'_, AppStateType>) -> Result<serde_json::Value, String> {
    let arc = state.inner().clone();
    match nodus::commands_plugin::get_system_plugin_status(arc).await {
        Ok(status) => Ok(serde_json::to_value(status).unwrap_or_else(|_| serde_json::json!({}))),
        Err(e) => Err(e),
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();
    println!("🦀 Starting Nodus Community");

    // Use the integrated license system (defaults to Community tier)
    println!("🌍 Initializing with integrated license system...");
    let app_state = AppState::new().await?;
    let mut app_state_guard = app_state;
    app_state_guard.initialize().await?;
    
    let app_state_arc = Arc::new(RwLock::new(app_state_guard));
    println!("✅ Application state initialized with license system");

    // Provide the shared app state to Tauri and register small wrapper
    // commands that forward into the engine functions. The engine functions
    // are framework-agnostic and accept AppStateType.
    tauri::Builder::default()
        .manage(app_state_arc.clone())
        .invoke_handler(tauri::generate_handler![
            // System commands (wrappers)
            wrapper_get_system_status,
            // Backwards-compatible wrapper names expected by the frontend
            register_js_plugin,
            execute_action_with_plugins,
            get_loaded_plugins,
            remove_js_plugin,
            get_plugin_marketplace,
            install_marketplace_plugin,
            get_system_plugin_status,
            // Plugin commands (wrappers) - now with license integration
            wrapper_list_plugins,
            wrapper_load_plugin,
            wrapper_unload_plugin,
            wrapper_register_js_plugin,
            wrapper_get_plugin_capabilities,
            // Grid commands (wrappers)
            wrapper_execute_action,
            wrapper_get_grid_config,
            wrapper_save_grid_config,
            wrapper_update_grid_state,
            // NEW: direct bridge wrappers for converted JS components
            wrapper_dispatch_action,
            wrapper_operation_completed,
            // Backwards-compatible command name expected by some frontend bundles
            operation_completed,
            wrapper_get_grid_stats,
            wrapper_export_grid_config,
            wrapper_import_grid_config,
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

// NEW: Plugin system wrappers that use the license integration
#[tauri::command]
async fn wrapper_register_js_plugin(
    state: State<'_, AppStateType>,
    plugin_request: nodus::commands_plugin::JSPluginRequest,
) -> Result<nodus::commands_plugin::PluginRegistrationResponse, String> {
    let arc = state.inner().clone();
    nodus::commands_plugin::register_js_plugin(arc, plugin_request).await
}

#[tauri::command]
async fn wrapper_get_plugin_capabilities(
    state: State<'_, AppStateType>,
) -> Result<serde_json::Value, String> {
    let app_state = state.inner().read().await;
    Ok(nodus::commands_plugin::get_plugin_capabilities(&app_state.license_manager).await)
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

// Additional bridge wrappers used by the converted JavaScript bridge
#[tauri::command]
async fn wrapper_dispatch_action(
    state: State<'_, AppStateType>,
    action_type: String,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let arc = state.inner().clone();
    nodus::commands_grid::dispatch_action(action_type, payload, arc).await
}

#[tauri::command]
async fn wrapper_operation_completed(
    state: State<'_, AppStateType>,
    operation_type: String,
    success: bool,
    duration: Option<f64>,
    error: Option<String>,
    metadata: Option<serde_json::Value>,
) -> Result<(), String> {
    let arc = state.inner().clone();
    nodus::commands_grid::operation_completed(operation_type, success, duration, error, metadata, arc).await
}

// Backwards-compatible direct command exposed as `operation_completed` for
// older frontend bundles that call this name directly.
#[tauri::command]
async fn operation_completed(
    state: State<'_, AppStateType>,
    operation_type: String,
    success: bool,
    duration: Option<f64>,
    error: Option<String>,
    metadata: Option<serde_json::Value>,
) -> Result<(), String> {
    let arc = state.inner().clone();
    nodus::commands_grid::operation_completed(operation_type, success, duration, error, metadata, arc).await
}

#[tauri::command]
async fn wrapper_get_grid_stats(
    state: State<'_, AppStateType>,
    config_id: String,
) -> Result<serde_json::Value, String> {
    let arc = state.inner().clone();
    nodus::commands_grid::get_grid_stats(config_id, arc).await
}

#[tauri::command]
async fn wrapper_export_grid_config(
    state: State<'_, AppStateType>,
    config_id: String,
) -> Result<String, String> {
    let arc = state.inner().clone();
    nodus::commands_grid::export_grid_config(config_id, arc).await
}

#[tauri::command]
async fn wrapper_import_grid_config(
    state: State<'_, AppStateType>,
    config_json: String,
) -> Result<serde_json::Value, String> {
    let arc = state.inner().clone();
    nodus::commands_grid::import_grid_config(config_json, arc).await
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