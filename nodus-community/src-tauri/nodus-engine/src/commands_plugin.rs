// commands_plugin.rs - Engine-level Plugin Commands
// Provides framework-agnostic plugin functionality that Tauri wrappers can call

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::state_mod::AppState;
use crate::universal_plugin_system::{JSPlugin, PluginInfo, PluginMetadata, LicenseRequirement};
use crate::license_mod::LicenseTier;

type AppStateType = Arc<RwLock<AppState>>;

/// JavaScript Plugin Registration Request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JSPluginRequest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub code: String,
    pub handled_actions: Vec<String>,
    pub metadata: PluginMetadata,
    pub license_requirements: Option<LicenseRequirement>,
}

/// Plugin Registration Response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginRegistrationResponse {
    pub success: bool,
    pub plugin_id: String,
    pub message: String,
}

/// Plugin System Status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginSystemStatus {
    pub plugins_loaded: u32,
    pub js_plugins_count: u32,
    pub rust_plugins_count: u32,
    pub license_tier: String,
    pub plugin_access_mode: String,
    pub can_load_unsigned: bool,
    pub can_load_enterprise: bool,
}

// ============================================================================
// ENGINE-LEVEL PLUGIN FUNCTIONS (Framework Agnostic)
// ============================================================================

/// Register JavaScript plugin from frontend (engine-level API)
pub async fn register_js_plugin(
    state: AppStateType,
    plugin_request: JSPluginRequest,
) -> Result<PluginRegistrationResponse, String> {
    let app_state = state.read().await;
    
    // Create JSPlugin from request
    let pid = plugin_request.id.clone();
    let js_plugin = JSPlugin {
        id: pid.clone(),
        name: plugin_request.name,
        version: plugin_request.version,
        author: plugin_request.author,
        description: plugin_request.description,
        code: plugin_request.code,
        handled_actions: plugin_request.handled_actions,
        metadata: plugin_request.metadata,
        license_requirements: plugin_request.license_requirements.unwrap_or_default(),
        enabled: true,
        loaded_at: chrono::Utc::now(),
    };

    match app_state.plugin_system.register_js_plugin(js_plugin).await {
        Ok(()) => {
            tracing::info!("JS Plugin registered: {}", pid);
            Ok(PluginRegistrationResponse {
                success: true,
                plugin_id: pid,
                message: "Plugin registered successfully".to_string(),
            })
        },
        Err(e) => {
            tracing::error!("Failed to register JS plugin: {}", e);
            Err(format!("Failed to register plugin: {}", e))
        }
    }
}

/// Execute action (routes through plugin system)
pub async fn execute_action_with_plugins(
    state: AppStateType,
    action_type: String,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    // Dispatch using the shared AppStateType handle (avoids recreating state wrappers)
    match crate::state_mod::execute_action(state.clone(), action_type, payload).await {
        Ok(result) => Ok(serde_json::json!({
            "success": result.success,
            "data": result.data,
            "error": result.error,
            "execution_time_ms": result.execution_time_ms,
            "side_effects": result.side_effects,
            "plugin_executed": !result.observability_metadata.middleware_executed.is_empty(),
        })),
        Err(e) => {
            tracing::error!("Action execution failed: {}", e);
            Err(format!("Action execution failed: {}", e))
        }
    }
}

/// Get loaded plugins info (engine-level)
pub async fn get_loaded_plugins(state: AppStateType) -> Result<Vec<PluginInfo>, String> {
    let app_state = state.read().await;
    Ok(app_state.plugin_system.get_all_plugins().await)
}

/// Remove JavaScript plugin (engine-level)
pub async fn remove_js_plugin(
    state: AppStateType,
    plugin_id: String,
) -> Result<(), String> {
    let app_state = state.read().await;

    app_state
        .plugin_system
        .remove_js_plugin(&plugin_id)
        .await
        .map_err(|e| format!("Failed to remove plugin: {}", e))
}

/// Load plugin from file path (engine-level helper for existing wrapper)
pub async fn load_plugin_from_path(
    state: AppStateType,
    plugin_path: String,
) -> Result<String, String> {
    let app_state = state.read().await;
    
    // Check license first
    let _plugin_access_mode = app_state.get_plugin_access_mode().await;
    
    // For now, delegate to the existing load_plugin method
    // In future, this would parse the file and call register_js_plugin
    app_state.load_plugin(&plugin_path).await
        .map_err(|e| format!("Failed to load plugin: {}", e))
}

/// Unload plugin by ID (engine-level helper for existing wrapper)
pub async fn unload_plugin_by_id(
    state: AppStateType,
    plugin_id: String,
) -> Result<(), String> {
    let app_state = state.read().await;
    
    // Try to remove from plugin system; if that fails, return an error
    app_state
        .plugin_system
        .remove_js_plugin(&plugin_id)
        .await
        .map_err(|e| format!("Failed to unload plugin: {}", e))
}

/// Upload plugin file and install (engine-level)
pub async fn upload_plugin_file(
    state: AppStateType,
    file_content: Vec<u8>,
    filename: String,
) -> Result<PluginRegistrationResponse, String> {
    // Avoid holding a read lock while we pass `state` into register_js_plugin()
    // Create plugin_request below and then call register_js_plugin(state.clone(), ...)
    
    // Basic validation
    if filename.is_empty() {
        return Err("Filename cannot be empty".to_string());
    }
    
    if file_content.is_empty() {
        return Err("File content cannot be empty".to_string());
    }
    
    // For JavaScript files, parse and register
    if filename.ends_with(".js") {
        let code = String::from_utf8(file_content)
            .map_err(|e| format!("Invalid UTF-8 in JavaScript file: {}", e))?;

        // Create basic plugin from file
        let plugin_id = format!("uploaded_{}", Uuid::new_v4().simple());
        let plugin_request = JSPluginRequest {
            id: plugin_id.clone(),
            name: filename.replace(".js", ""),
            version: "1.0.0".to_string(),
            author: "Uploaded".to_string(),
            description: format!("Uploaded plugin from file: {}", filename),
            code,
            handled_actions: vec!["*".to_string()], // Would parse from file
            metadata: PluginMetadata {
                plugin_id: Uuid::new_v4(),
                name: filename.replace(".js", ""),
                version: "1.0.0".to_string(),
                author: "Uploaded".to_string(),
                description: format!("Uploaded plugin from file: {}", filename),
                tags: vec!["uploaded".to_string()],
                priority: 100,
                dependencies: Vec::new(),
                conflicts: Vec::new(),
                homepage: None,
                documentation: None,
            },
            license_requirements: Some(LicenseRequirement::default()),
        };

        // Pass a cloned Arc so we don't move the caller's Arc while holding any locks
        register_js_plugin(state.clone(), plugin_request).await
    } else {
        Err(format!("Unsupported file type: {}", filename))
    }
}

/// Install plugin from marketplace (engine-level)
pub async fn install_marketplace_plugin(
    state: AppStateType,
    plugin_id: String,
    _marketplace_url: Option<String>,
) -> Result<PluginRegistrationResponse, String> {
    let app_state = state.read().await;
    
    // Check license requirements
    let license_tier = app_state.get_license_tier().await;
    
    // Validate marketplace access
    match license_tier {
        LicenseTier::Community => {
            if !app_state.license_manager.has_feature("community_plugin_marketplace").await {
                return Err("Community plugin marketplace not available".to_string());
            }
        }
        LicenseTier::Enterprise => {
            if !app_state.license_manager.has_feature("enterprise_plugin_marketplace").await {
                return Err("Enterprise plugin marketplace not available".to_string());
            }
        }
        _ => {}
    }
    
    // Marketplace installation not implemented yet. Return a clear error so callers
    // can distinguish between a real install and the unimplemented stub.
    Err(format!("Marketplace plugin installation not yet implemented for plugin {}. Use upload or load_plugin_from_path instead.", plugin_id))
}

/// Get system plugin status (engine-level)
pub async fn get_system_plugin_status(state: AppStateType) -> Result<PluginSystemStatus, String> {
    let app_state = state.read().await;
    
    let plugins = app_state.plugin_system.get_all_plugins().await;
    let js_plugins_count = plugins.iter()
        .filter(|p| matches!(p.plugin_type, crate::universal_plugin_system::PluginType::JavaScript))
        .count() as u32;
    let rust_plugins_count = plugins.iter()
        .filter(|p| matches!(p.plugin_type, crate::universal_plugin_system::PluginType::Rust))
        .count() as u32;
    
    let license_tier = app_state.get_license_tier().await;
    let plugin_access_mode = app_state.get_plugin_access_mode().await;
    
    Ok(PluginSystemStatus {
        plugins_loaded: plugins.len() as u32,
        js_plugins_count,
        rust_plugins_count,
        license_tier: license_tier.display_name().to_string(),
        plugin_access_mode: format!("{:?}", plugin_access_mode),
        can_load_unsigned: matches!(plugin_access_mode, crate::license_mod::PluginAccessMode::UnsignedAllowed),
        can_load_enterprise: app_state.license_manager.has_feature("enterprise_plugin_marketplace").await,
    })
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Validate plugin requirements against license
pub async fn validate_plugin_requirements(
    license_manager: &crate::license_mod::LicenseManager,
    requirements: &LicenseRequirement,
) -> Result<(), String> {
    // Check minimum tier
    let current_tier = license_manager.get_tier().await;
    if current_tier < requirements.minimum_tier {
        return Err(format!(
            "Plugin requires {:?} license tier, current tier is {:?}",
            requirements.minimum_tier, current_tier
        ));
    }
    
    // Check enterprise features
    for feature in &requirements.enterprise_only_features {
        if !license_manager.has_feature(feature).await {
            return Err(format!(
                "Plugin requires enterprise feature '{}' not available in current license",
                feature
            ));
        }
    }
    
    // Check signature requirements
    if requirements.requires_signed {
        let plugin_access_mode = license_manager.get_plugin_access_mode().await;
        if !matches!(plugin_access_mode, crate::license_mod::PluginAccessMode::SignedOnly) {
            return Err("Plugin requires signed plugins mode".to_string());
        }
    }
    
    Ok(())
}

/// Get plugin capabilities for current license
pub async fn get_plugin_capabilities(
    license_manager: &crate::license_mod::LicenseManager,
) -> serde_json::Value {
    let tier = license_manager.get_tier().await;
    let access_mode = license_manager.get_plugin_access_mode().await;
    
    serde_json::json!({
        "license_tier": tier.display_name(),
        "plugin_access_mode": format!("{:?}", access_mode),
        "can_load_unsigned": matches!(access_mode, crate::license_mod::PluginAccessMode::UnsignedAllowed),
        "can_load_signed": true, // All tiers can load signed plugins
        "marketplace_access": {
            "community": license_manager.has_feature("community_plugin_marketplace").await,
            "enterprise": license_manager.has_feature("enterprise_plugin_marketplace").await,
        },
        "available_features": license_manager.get_available_features().await,
    })
}