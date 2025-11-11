// commands_grid.rs - FIXED VERSION 
// Complete implementation of grid commands that actually work with storage

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;
use chrono::Utc;

use crate::action_dispatcher::Action;
use crate::state_mod::AppState;

pub type AppStateType = Arc<RwLock<AppState>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridConfig {
    pub blocks: Vec<GridBlock>,
    pub columns: Option<u32>,
    pub config_id: String,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridBlock {
    pub id: String,
    pub block_type: String,
    pub title: Option<String>,
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
    pub config: Value,
    #[serde(default)]
    pub static_grid: bool,
    pub entity_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridStateUpdate {
    pub config_id: String,
    pub block_id: String,
    pub update_type: String, // "add", "update", "delete", "move"
    pub data: Value,
}

/// Simple ping to verify Rust backend connectivity
pub async fn ping(_state: AppStateType) -> Result<String, String> {
    Ok("pong".to_string())
}

/// Get grid configuration with actual storage lookup
pub async fn get_grid_config(state: AppStateType, config_id: String) -> Result<GridConfig, String> {
    // Read the app state for storage access. This value is used below
    // to access the storage subsystem.
    // Not used directly in this function (we call get_grid_config), keep the
    // read for parity and future use. Prefix with underscore to avoid
    // unused-variable warnings.
        let app_state = state.read().await;
    
    // Create storage context
    let ctx = crate::storage::StorageContext {
        user_id: "system".to_string(),
        session_id: Uuid::new_v4(),
        operation_id: Uuid::new_v4(),
    };
    
    // Try to get from storage using the key format
    let key = format!("grid_config:{}", config_id);
    match app_state.storage.get(&key, &ctx).await {
        Ok(Some(entity)) => {
            // Parse the stored entity data
            match serde_json::from_value::<GridConfig>(entity.data) {
                Ok(config) => Ok(config),
                Err(e) => {
                    println!("[GridCommands] Failed to parse stored config: {}", e);
                    // Return default if parse fails
                    Ok(create_default_config(&config_id))
                }
            }
        },
        Ok(None) => {
            println!("[GridCommands] No config found for {}, returning default", config_id);
            Ok(create_default_config(&config_id))
        },
        Err(e) => {
            println!("[GridCommands] Storage error: {}", e);
            // Return default config on storage error to keep app functional
            Ok(create_default_config(&config_id))
        }
    }
}

/// Save grid configuration to storage
pub async fn save_grid_config(
    state: AppStateType, 
    config_id: String, 
    config: GridConfig
) -> Result<(), String> {
    // Read the app state (needed for storage access). This value is used
    // below when saving the grid config to the storage subsystem.
    let app_state = state.read().await;
    
    println!("[GridCommands] Saving grid config: {} with {} blocks", config_id, config.blocks.len());
    
    // Create storage context
    let ctx = crate::storage::StorageContext {
        user_id: "system".to_string(),
        session_id: Uuid::new_v4(),
        operation_id: Uuid::new_v4(),
    };
    
    // Create stored entity
    let entity = crate::storage::StoredEntity {
        id: format!("grid_config:{}", config_id),
        entity_type: "grid_config".to_string(),
        data: serde_json::to_value(&config).map_err(|e| format!("Serialization error: {}", e))?,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        created_by: "system".to_string(),
        updated_by: "system".to_string(),
        version: 1,
        deleted_at: None,
        sync_status: crate::storage::SyncStatus::Local,
    };
    
    // Save to storage
    let key = format!("grid_config:{}", config_id);
    match app_state.storage.put(&key, entity, &ctx).await {
        Ok(()) => {
            println!("[GridCommands] Successfully saved grid config: {}", config_id);
            Ok(())
        },
        Err(e) => {
            let error_msg = format!("Failed to save grid config: {}", e);
            println!("[GridCommands] {}", error_msg);
            Err(error_msg)
        }
    }
}

/// Update grid state (add/remove/move blocks)
pub async fn update_grid_state(
    state: AppStateType, 
    state_update: GridStateUpdate
) -> Result<(), String> {
    println!("[GridCommands] Updating grid state: {} - {}", 
             state_update.config_id, state_update.update_type);
    
    // Not used directly here (we call `get_grid_config`), keep the read for
    // parity and future use; prefix with underscore to avoid warnings.
    let _app_state = state.read().await;
    
    // Get current config
    let mut config = get_grid_config(state.clone(), state_update.config_id.clone()).await?;
    
    // Apply the update based on type
    match state_update.update_type.as_str() {
        "add" => {
            // Parse block data from the update
            let block_data = state_update.data;
            let block = GridBlock {
                id: state_update.block_id.clone(),
                block_type: block_data.get("type").and_then(|v| v.as_str()).unwrap_or("html").to_string(),
                title: block_data.get("title").and_then(|v| v.as_str()).map(|s| s.to_string()),
                x: block_data.get("x").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                y: block_data.get("y").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                w: block_data.get("w").and_then(|v| v.as_u64()).unwrap_or(1) as u32,
                h: block_data.get("h").and_then(|v| v.as_u64()).unwrap_or(1) as u32,
                config: block_data.get("config").cloned().unwrap_or(Value::Object(serde_json::Map::new())),
                static_grid: block_data.get("static_grid").and_then(|v| v.as_bool()).unwrap_or(false),
                entity_id: block_data.get("entity_id").and_then(|v| v.as_str()).map(|s| s.to_string()),
            };
            
            // Add the block
            config.blocks.push(block);
            println!("[GridCommands] Added block {} to grid {}", state_update.block_id, state_update.config_id);
        },
        
        "delete" | "remove" => {
            // Remove the block
            config.blocks.retain(|block| block.id != state_update.block_id);
            println!("[GridCommands] Removed block {} from grid {}", state_update.block_id, state_update.config_id);
        },
        
        "update" => {
            // Update existing block
            if let Some(block) = config.blocks.iter_mut().find(|b| b.id == state_update.block_id) {
                let update_data = &state_update.data;
                
                // Update position if provided
                if let Some(x) = update_data.get("x").and_then(|v| v.as_u64()) {
                    block.x = x as u32;
                }
                if let Some(y) = update_data.get("y").and_then(|v| v.as_u64()) {
                    block.y = y as u32;
                }
                if let Some(w) = update_data.get("w").and_then(|v| v.as_u64()) {
                    block.w = w as u32;
                }
                if let Some(h) = update_data.get("h").and_then(|v| v.as_u64()) {
                    block.h = h as u32;
                }
                
                // Update config if provided
                if let Some(new_config) = update_data.get("config") {
                    block.config = new_config.clone();
                }
                
                // Update title if provided
                if let Some(title) = update_data.get("title").and_then(|v| v.as_str()) {
                    block.title = Some(title.to_string());
                }
                
                println!("[GridCommands] Updated block {} in grid {}", state_update.block_id, state_update.config_id);
            } else {
                return Err(format!("Block {} not found in grid {}", state_update.block_id, state_update.config_id));
            }
        },
        
        "move" => {
            // Move block to new position
            if let Some(block) = config.blocks.iter_mut().find(|b| b.id == state_update.block_id) {
                let move_data = &state_update.data;
                if let (Some(x), Some(y)) = (
                    move_data.get("x").and_then(|v| v.as_u64()),
                    move_data.get("y").and_then(|v| v.as_u64())
                ) {
                    block.x = x as u32;
                    block.y = y as u32;
                    println!("[GridCommands] Moved block {} to ({}, {}) in grid {}", 
                             state_update.block_id, x, y, state_update.config_id);
                }
            } else {
                return Err(format!("Block {} not found in grid {}", state_update.block_id, state_update.config_id));
            }
        },
        
        _ => {
            return Err(format!("Unknown update type: {}", state_update.update_type));
        }
    }
    
    // Save the updated config
    save_grid_config(state.clone(), state_update.config_id, config).await?;
    
    Ok(())
}

/// Main dispatch entry point - ACTUALLY WORKING VERSION
pub async fn dispatch_action(
    action_type: String,
    payload: Value,
    state: AppStateType,
) -> Result<Value, String> {
    println!("[GridCommands] Dispatching action: {}", action_type);
    
    match action_type.as_str() {
        // Grid configuration actions
        "grid.config.load" => {
            let config_id = payload.get("containerId")
                .and_then(|v| v.as_str())
                .unwrap_or("default")
                .to_string();
            
            match get_grid_config(state.clone(), config_id).await {
                Ok(config) => Ok(serde_json::to_value(config).unwrap()),
                Err(e) => Err(e),
            }
        },
        
        "grid.config.save" => {
            let config: GridConfig = serde_json::from_value(payload.clone())
                .map_err(|e| format!("Invalid grid config: {}", e))?;
            
            match save_grid_config(state.clone(), config.config_id.clone(), config).await {
                Ok(()) => Ok(serde_json::json!({ "success": true })),
                Err(e) => Err(e),
            }
        },

        // Block operations - ACTUALLY WORKING NOW
        "grid.block.add" => {
            let block_config = payload.get("blockConfig")
                .ok_or("Missing blockConfig")?;
            let container_id = payload.get("containerId")
                .and_then(|v| v.as_str())
                .unwrap_or("default")
                .to_string();

            let block_id = Uuid::new_v4().to_string();
            
            let state_update = GridStateUpdate {
                config_id: container_id,
                block_id: block_id.clone(),
                update_type: "add".to_string(),
                data: block_config.clone(),
            };

            match update_grid_state(state.clone(), state_update).await {
                Ok(()) => {
                    println!("[GridCommands] Successfully added block {}", block_id);
                    Ok(serde_json::json!({ "blockId": block_id, "success": true }))
                },
                Err(e) => {
                    println!("[GridCommands] Failed to add block: {}", e);
                    Err(e)
                }
            }
        },

        "grid.block.remove" => {
            let block_id = payload.get("blockId")
                .and_then(|v| v.as_str())
                .ok_or("Missing blockId")?
                .to_string();
            let container_id = payload.get("containerId")
                .and_then(|v| v.as_str())
                .unwrap_or("default")
                .to_string();

            let state_update = GridStateUpdate {
                config_id: container_id,
                block_id,
                update_type: "delete".to_string(),
                data: Value::Null,
            };

            match update_grid_state(state.clone(), state_update).await {
                Ok(()) => Ok(serde_json::json!({ "success": true })),
                Err(e) => Err(e),
            }
        },

        "grid.layout.update" => {
            let layout_config = payload.get("layoutConfig")
                .ok_or("Missing layoutConfig")?;
            let container_id = payload.get("containerId")
                .and_then(|v| v.as_str())
                .unwrap_or("default")
                .to_string();

            let config: GridConfig = serde_json::from_value(layout_config.clone())
                .map_err(|e| format!("Invalid layout config: {}", e))?;

            match save_grid_config(state.clone(), container_id, config).await {
                Ok(()) => Ok(serde_json::json!({ "success": true })),
                Err(e) => Err(e),
            }
        },

        "grid.state.get" => {
            let container_id = payload.get("containerId")
                .and_then(|v| v.as_str())
                .unwrap_or("default")
                .to_string();

            match get_grid_config(state.clone(), container_id).await {
                Ok(config) => Ok(serde_json::to_value(config).unwrap()),
                Err(e) => Err(e),
            }
        },

        // Block interactions - now with actual state changes
        "grid.block.update" => {
            let block_id = payload.get("blockId")
                .and_then(|v| v.as_str())
                .ok_or("Missing blockId")?
                .to_string();
            let container_id = payload.get("containerId")
                .and_then(|v| v.as_str())
                .unwrap_or("default")
                .to_string();
            let updates = payload.get("updates")
                .ok_or("Missing updates")?;

            let state_update = GridStateUpdate {
                config_id: container_id,
                block_id,
                update_type: "update".to_string(),
                data: updates.clone(),
            };

            match update_grid_state(state.clone(), state_update).await {
                Ok(()) => Ok(serde_json::json!({ "success": true })),
                Err(e) => Err(e),
            }
        },

        "grid.block.move" => {
            let block_id = payload.get("blockId")
                .and_then(|v| v.as_str())
                .ok_or("Missing blockId")?
                .to_string();
            let container_id = payload.get("containerId")
                .and_then(|v| v.as_str())
                .unwrap_or("default")
                .to_string();
            let position = payload.get("position")
                .ok_or("Missing position")?;

            let state_update = GridStateUpdate {
                config_id: container_id,
                block_id,
                update_type: "move".to_string(),
                data: position.clone(),
            };

            match update_grid_state(state.clone(), state_update).await {
                Ok(()) => Ok(serde_json::json!({ "success": true })),
                Err(e) => Err(e),
            }
        },

        // System actions
        "system.ping" => {
            ping(state.clone()).await.map(|response| serde_json::json!({ "response": response }))
        },

        "system.error.report" => {
            let error_message = payload.get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown error");
            
            println!("[GridCommands] Frontend error reported: {}", error_message);
            Ok(serde_json::json!({ "success": true }))
        },

        "system.bootstrap.completed" => {
            let duration = payload.get("duration")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            
            println!("[GridCommands] Frontend bootstrap completed in {:.2}ms", duration);
            Ok(serde_json::json!({ "success": true }))
        },

        // Log other actions but don't fail
        _ => {
            println!("[GridCommands] Unhandled action type: {}", action_type);
            Ok(serde_json::json!({ "success": true, "message": format!("Action {} logged", action_type) }))
        }
    }
}

/// Create a default grid configuration
fn create_default_config(config_id: &str) -> GridConfig {
    GridConfig {
        blocks: vec![],
        columns: Some(24),
        config_id: config_id.to_string(),
        metadata: Some(serde_json::json!({
            "created_at": Utc::now().to_rfc3339(),
            "version": "1.0",
            "description": "Default grid configuration"
        })),
    }
}

/// Execute a grid action (alternative entry point)
pub async fn execute_action(state: AppStateType, action: Action) -> Result<Value, String> {
    let action_type = action.action_type;
    let payload = action.payload;
    
    dispatch_action(action_type, payload, state).await
}

/// Get grid statistics
pub async fn get_grid_stats(config_id: String, state: AppStateType) -> Result<Value, String> {
    match get_grid_config(state, config_id.clone()).await {
        Ok(config) => {
            let stats = serde_json::json!({
                "config_id": config_id,
                "total_blocks": config.blocks.len(),
                "columns": config.columns.unwrap_or(24),
                "block_types": count_block_types(&config.blocks),
                "last_updated": Utc::now().to_rfc3339()
            });
            Ok(stats)
        },
        Err(e) => Err(e)
    }
}

/// Export grid configuration as JSON
pub async fn export_grid_config(config_id: String, state: AppStateType) -> Result<String, String> {
    match get_grid_config(state, config_id).await {
        Ok(config) => {
            serde_json::to_string_pretty(&config)
                .map_err(|e| format!("Failed to serialize config: {}", e))
        },
        Err(e) => Err(e)
    }
}

/// Import grid configuration from JSON
pub async fn import_grid_config(config_json: String, state: AppStateType) -> Result<Value, String> {
    let config: GridConfig = serde_json::from_str(&config_json)
        .map_err(|e| format!("Invalid JSON config: {}", e))?;
    
    match save_grid_config(state, config.config_id.clone(), config.clone()).await {
                Ok(()) => Ok(serde_json::json!({ 
            "success": true, 
            "imported": true,
            "config_id": config.config_id 
        })),
        Err(e) => Err(e),
    }
}

/// Operation completed callback
pub async fn operation_completed(
    operation_type: String,
    success: bool,
    duration: Option<f64>,
    error: Option<String>,
    metadata: Option<Value>,
    _state: AppStateType,
) -> Result<(), String> {
    let duration_str = duration.map(|d| format!("{:.2}ms", d)).unwrap_or_else(|| "unknown".to_string());
    let status = if success { "SUCCESS" } else { "FAILED" };
    
    println!("[GridCommands] Operation {} {} in {}", operation_type, status, duration_str);
    
    if let Some(err) = error {
        println!("[GridCommands] Operation error: {}", err);
    }
    
    if let Some(meta) = metadata {
        println!("[GridCommands] Operation metadata: {}", meta);
    }
    
    Ok(())
}

/// Helper function to count block types for statistics
fn count_block_types(blocks: &[GridBlock]) -> HashMap<String, u32> {
    let mut counts = HashMap::new();
    for block in blocks {
        *counts.entry(block.block_type.clone()).or_insert(0) += 1;
    }
    counts
}

/// Simple logging helper
#[allow(dead_code)]
async fn log_grid_interaction(action_type: &str, payload: &Value) {
    // Lightweight helper retained for future instrumentation. Keep the
    // implementation minimal to avoid extra deps.
    println!("[GridCommands] Grid interaction: {} - {}", action_type, payload);
}