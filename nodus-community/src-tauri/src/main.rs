// src-tauri/src/main.rs (Community Version)
// This is 100% open-source and has no license checks.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, State};
use std::sync::Arc;
use tokio::sync::RwLock;

// Use types and commands from the local engine crate. The project no longer
// exposes a separate `license` module; `state_mod` contains the minimal
// license-related types required for the community build.
use nodus::state_mod::AppState;
use nodus::commands::{get_system_status, list_plugins, load_plugin, unload_plugin};

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}

// Tauri wrappers: small annotated functions that adapt Tauri State to the
// engine-level API. They clone the Arc and forward the call.
#[tauri::command]
async fn wrapper_get_system_status(state: State<'_, AppStateType>) -> Result<serde_json::Value, String> {
    let arc = state.inner().clone();
    nodus::commands::get_system_status(arc).await
}

#[tauri::command]
async fn wrapper_list_plugins(state: State<'_, AppStateType>) -> Result<Vec<String>, String> {
    let arc = state.inner().clone();
    nodus::commands::list_plugins(arc).await
}

#[tauri::command]
async fn wrapper_load_plugin(state: State<'_, AppStateType>, plugin_path: String) -> Result<String, String> {
    let arc = state.inner().clone();
    nodus::commands::load_plugin(arc, plugin_path).await
}

#[tauri::command]
async fn wrapper_unload_plugin(state: State<'_, AppStateType>, plugin_id: String) -> Result<(), String> {
    let arc = state.inner().clone();
    nodus::commands::unload_plugin(arc, plugin_id).await
}