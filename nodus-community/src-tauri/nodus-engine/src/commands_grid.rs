// Grid-specific Tauri commands for JavaScript-to-Rust bridge
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use crate::state_mod::AppState;
use crate::action_dispatcher::{Action, ActionContext};

pub type AppStateType = Arc<RwLock<AppState>>;

#[derive(Debug, Serialize, Deserialize)]
pub struct GridBlock {
    pub id: String,
    pub block_type: String,
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
    pub props: Value,
    pub constraints: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GridConfig {
    pub blocks: Vec<GridBlock>,
    pub columns: Option<u32>,
    pub config_id: String,
    pub metadata: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GridStateUpdate {
    pub config_id: String,
    pub block_id: String,
    pub update_type: String, // "move", "resize", "update_props", "delete"
    pub data: Value,
}

/// Execute action through the Rust ActionDispatcher
pub async fn execute_action(state: AppStateType, action: Action) -> Result<Value, String> {
    let app_state = state.read().await;
    
    // Get the action dispatcher
    let action_dispatcher = &app_state.action_dispatcher;
    
    // Create action context (simplified for grid operations)
    let context = ActionContext {
        user_id: "javascript_frontend".to_string(),
        session_id: action.metadata.action_id.clone(),
        security_label: None, // Will be set by middleware if needed
        request_metadata: std::collections::HashMap::new(),
    };
    
    match action_dispatcher.execute_action(action, context, &app_state).await {
        Ok(result) => Ok(result.data.unwrap_or(Value::Null)),
        Err(e) => Err(e.to_string()),
    }
}

/// Get grid configuration by ID
pub async fn get_grid_config(state: AppStateType, config_id: String) -> Result<GridConfig, String> {
    let app_state = state.read().await;
    
    // Try to get from storage
    match app_state.storage.get_grid_config(&config_id).await {
        Ok(Some(config)) => Ok(config),
        Ok(None) => {
            // Return default config for new grids
            Ok(GridConfig {
                blocks: vec![],
                columns: Some(24),
                config_id: config_id.clone(),
                metadata: Some(serde_json::json!({
                    "created_at": chrono::Utc::now().to_rfc3339(),
                    "version": "1.0"
                })),
            })
        },
        Err(e) => Err(format!("Failed to get grid config: {}", e)),
    }
}

/// Save grid configuration
pub async fn save_grid_config(
    state: AppStateType, 
    config_id: String, 
    config: GridConfig
) -> Result<(), String> {
    let app_state = state.read().await;
    
    // Validate the configuration
    if config.blocks.iter().any(|block| block.id.is_empty()) {
        return Err("All blocks must have valid IDs".to_string());
    }
    
    // Save through storage layer
    match app_state.storage.save_grid_config(&config_id, &config).await {
        Ok(()) => {
            // Trigger observability through action dispatcher
            let action = Action {
                action_type: "grid.config_saved".to_string(),
                payload: serde_json::json!({
                    "config_id": config_id,
                    "block_count": config.blocks.len()
                }),
                metadata: crate::action_dispatcher::ActionMetadata {
                    action_id: uuid::Uuid::new_v4().to_string(),
                    timestamp: chrono::Utc::now(),
                    source: Some("grid_commands".to_string()),
                    user_id: Some("system".to_string()),
                    session_id: None,
                    trace_id: None,
                },
            };
            
            let context = ActionContext {
                user_id: "system".to_string(),
                session_id: "grid_save".to_string(),
                security_label: None,
                request_metadata: std::collections::HashMap::new(),
            };
            
            // Fire and forget - don't block on observability
            let _ = app_state.action_dispatcher.execute_action(action, context, &app_state).await;
            
            Ok(())
        },
        Err(e) => Err(format!("Failed to save grid config: {}", e)),
    }
}

/// Update grid state (handle block moves, resizes, etc.)
pub async fn update_grid_state(
    state: AppStateType, 
    state_update: GridStateUpdate
) -> Result<(), String> {
    let app_state = state.read().await;
    
    // Get current config
    let mut config = match app_state.storage.get_grid_config(&state_update.config_id).await {
        Ok(Some(config)) => config,
        Ok(None) => return Err("Grid configuration not found".to_string()),
        Err(e) => return Err(format!("Failed to get grid config: {}", e)),
    };
    
    // Apply the update
    match state_update.update_type.as_str() {
        "move" | "resize" => {
            if let Some(block) = config.blocks.iter_mut().find(|b| b.id == state_update.block_id) {
                if let Ok(position) = serde_json::from_value::<GridPosition>(state_update.data) {
                    block.x = position.x;
                    block.y = position.y;
                    if let Some(w) = position.w { block.w = w; }
                    if let Some(h) = position.h { block.h = h; }
                }
            }
        },
        "update_props" => {
            if let Some(block) = config.blocks.iter_mut().find(|b| b.id == state_update.block_id) {
                block.props = state_update.data;
            }
        },
        "delete" => {
            config.blocks.retain(|b| b.id != state_update.block_id);
        },
        "add" => {
            if let Ok(new_block) = serde_json::from_value::<GridBlock>(state_update.data) {
                config.blocks.push(new_block);
            }
        },
        _ => return Err(format!("Unknown update type: {}", state_update.update_type)),
    }
    
    // Save updated config
    // clone the Arc before calling save_grid_config to avoid moving `state`
    save_grid_config(state.clone(), state_update.config_id.clone(), config).await
}

/// Simple ping command for connection testing
pub async fn ping(_state: AppStateType) -> Result<String, String> {
    Ok("pong".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
struct GridPosition {
    x: u32,
    y: u32,
    w: Option<u32>,
    h: Option<u32>,
}

// Extension trait for AppState to add grid storage methods
trait GridStorage {
    async fn get_grid_config(&self, config_id: &str) -> Result<Option<GridConfig>, Box<dyn std::error::Error + Send + Sync>>;
    async fn save_grid_config(&self, config_id: &str, config: &GridConfig) -> Result<(), Box<dyn std::error::Error + Send + Sync>>;
}

impl GridStorage for crate::storage::StorageManager {
    async fn get_grid_config(&self, config_id: &str) -> Result<Option<GridConfig>, Box<dyn std::error::Error + Send + Sync>> {
        // Create a storage context
        let ctx = crate::storage::StorageContext {
            user_id: "system".to_string(),
            session_id: uuid::Uuid::new_v4(),
            operation_id: uuid::Uuid::new_v4(),
        };
        
        // Use the entity storage interface
        let key = format!("grid_config:{}", config_id);
        match self.get(&key, &ctx).await? {
            Some(entity) => {
                let config: GridConfig = serde_json::from_value(entity.data)?;
                Ok(Some(config))
            },
            None => Ok(None),
        }
    }
    
    async fn save_grid_config(&self, config_id: &str, config: &GridConfig) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let ctx = crate::storage::StorageContext {
            user_id: "system".to_string(),
            session_id: uuid::Uuid::new_v4(),
            operation_id: uuid::Uuid::new_v4(),
        };
        
        let key = format!("grid_config:{}", config_id);
        let entity = crate::storage::StoredEntity {
            id: key.clone(),
            entity_type: "grid_config".to_string(),
            data: serde_json::to_value(config)?,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            created_by: "system".to_string(),
            updated_by: "system".to_string(),
            version: 1,
            deleted_at: None,
            sync_status: crate::storage::SyncStatus::Local,
        };
        
        self.put(&key, entity, &ctx).await?;
        Ok(())
    }
}