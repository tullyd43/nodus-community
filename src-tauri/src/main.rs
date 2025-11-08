// src-tauri/src/main.rs
// Nodus Application Entry Point - Works with Community and Enterprise
// Fixed to compile and use the license system we designed

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, State};
use std::sync::Arc;
use tokio::sync::RwLock;

// Import our modules (will exist after we fix them)
mod license;
mod state_mod;
mod commands;

// Import the license system we just designed
use license::{LicenseManager, LicenseTier, PluginAccessMode};
use state_mod::AppState;

// Import command handlers 
use commands::{
    license_commands::*,
    system_commands::*,
};

type AppStateType = Arc<RwLock<AppState>>;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    tracing_subscriber::fmt::init();
    
    println!("🦀 Starting Nodus Application");

    // Initialize the application based on license tier
    let app_state = initialize_application().await?;

    // Get license info for logging
    let license_tier = app_state.read().await.license_manager.get_tier().await;
    println!("📜 License tier: {:?}", license_tier);

    // Build and run Tauri app
    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // License commands (always available)
            get_license_info,
            check_feature_availability,
            
            // System commands (always available)
            get_system_status,
            get_plugin_access_mode,
            
            // Plugin commands (behavior depends on license)
            list_plugins,
            load_plugin,
            unload_plugin,
        ])
        .setup(|app| {
            println!("✅ Nodus application initialized successfully");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}

/// Initialize application - creates community or enterprise state based on license
async fn initialize_application() -> Result<AppStateType, Box<dyn std::error::Error>> {
    println!("🔍 Detecting license and initializing application...");

    // Step 1: Initialize license manager (this determines everything else)
    let license_manager = LicenseManager::new().await?;
    let license_tier = license_manager.get_tier().await;
    let plugin_access_mode = license_manager.get_plugin_access_mode().await;
    
    println!("📋 License detected: {:?}", license_tier);
    println!("🔌 Plugin access mode: {:?}", plugin_access_mode);

    // Step 2: Create appropriate app state based on license
    let app_state = match license_tier {
        LicenseTier::Community => {
            println!("🌍 Initializing Community version");
            create_community_state(license_manager).await?
        }
        LicenseTier::Pro => {
            println!("💼 Initializing Pro version");
            create_pro_state(license_manager).await?
        }
        LicenseTier::Team => {
            println!("👥 Initializing Team version");
            create_team_state(license_manager).await?
        }
        LicenseTier::Enterprise => {
            println!("🏢 Initializing Enterprise version");
            create_enterprise_state(license_manager).await?
        }
    };

    // Step 3: Initialize the state
    let mut state_guard = app_state.write().await;
    state_guard.initialize().await?;
    drop(state_guard);

    println!("✅ Application state initialized for {:?} tier", license_tier);
    
    Ok(app_state)
}

/// Create community app state (basic functionality)
async fn create_community_state(
    license_manager: LicenseManager,
) -> Result<AppStateType, Box<dyn std::error::Error>> {
    // For now, create a basic state
    // TODO: Use the community modules we created
    let app_state = AppState::new_community(license_manager).await?;
    Ok(Arc::new(RwLock::new(app_state)))
}

/// Create pro app state (community + AI features)  
async fn create_pro_state(
    license_manager: LicenseManager,
) -> Result<AppStateType, Box<dyn std::error::Error>> {
    // Pro uses community state + pro features enabled by license
    let app_state = AppState::new_community(license_manager).await?;
    Ok(Arc::new(RwLock::new(app_state)))
}

/// Create team app state (pro + collaboration)
async fn create_team_state(
    license_manager: LicenseManager,
) -> Result<AppStateType, Box<dyn std::error::Error>> {
    // Team uses community state + team features enabled by license
    let app_state = AppState::new_community(license_manager).await?;
    Ok(Arc::new(RwLock::new(app_state)))
}

/// Create enterprise app state (team + enterprise features + signed plugins only)
async fn create_enterprise_state(
    license_manager: LicenseManager,
) -> Result<AppStateType, Box<dyn std::error::Error>> {
    // Enterprise uses community state + enterprise features injected
    // TODO: Use the enterprise modules we created
    let app_state = AppState::new_community(license_manager).await?;
    
    // TODO: Inject enterprise plugins here
    // This is where the plugin injection architecture goes
    
    Ok(Arc::new(RwLock::new(app_state)))
}
