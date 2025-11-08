// src-tauri/src/state_mod.rs
// Application State - Works with our license system
// This version compiles and works with main.rs

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use uuid::Uuid;

// The project no longer ships a separate `license` module. Provide minimal,
// local license-related types so the open-source `state_mod` can compile and
// operate in Community mode without an external license manager.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum LicenseTier {
    Community,
    Pro,
    Team,
    Enterprise,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum PluginAccessMode {
    UnsignedAllowed,
    SignedOnly,
}

/// Application state that works with our licensing system
#[derive(Debug)]
pub struct AppState {
    // Store the effective license tier and plugin access mode directly.
    pub license_tier: LicenseTier,
    pub plugin_access_mode: PluginAccessMode,
    pub initialized: bool,
    
    // Basic state that always exists
    pub config: AppConfig,
    pub sessions: Arc<RwLock<HashMap<Uuid, SessionInfo>>>,
    pub plugins: Arc<RwLock<Vec<String>>>, // List of loaded plugin IDs
    
    // Core components for grid functionality
    pub storage: Arc<crate::storage::StorageManager>,
    pub action_dispatcher: Arc<crate::action_dispatcher::ActionDispatcher>,
    pub async_orchestrator: Arc<crate::async_orchestrator::AsyncOrchestrator>,
    
    // Tracking for active async operations
    pub active_async_operations: Arc<RwLock<HashMap<String, crate::async_orchestrator::OperationRunner>>>,
}

/// Basic app configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub app_name: String,
    pub version: String,
    pub license_tier: String,
    pub plugin_access_mode: String,
}

/// Basic session information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub session_id: Uuid,
    pub user_id: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_access: chrono::DateTime<chrono::Utc>,
}

impl AppState {
    /// Create new community app state
    pub async fn new_community() -> Result<Self, AppStateError> {
        let license_tier = LicenseTier::Community;
        let plugin_access_mode = PluginAccessMode::UnsignedAllowed;
        
        let config = AppConfig {
            app_name: "Nodus".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            license_tier: format!("{:?}", license_tier),
            plugin_access_mode: format!("{:?}", plugin_access_mode),
        };

        // Initialize core components
        let storage = Arc::new(crate::storage::StorageManager::new());
        let action_dispatcher = Arc::new(crate::action_dispatcher::ActionDispatcher::new().await?);
        let async_orchestrator = Arc::new(crate::async_orchestrator::AsyncOrchestrator::new().await?);

        Ok(Self {
            license_tier,
            plugin_access_mode,
            initialized: false,
            config,
            sessions: Arc::new(RwLock::new(HashMap::new())),
            plugins: Arc::new(RwLock::new(Vec::new())),
            storage,
            action_dispatcher,
            async_orchestrator,
            active_async_operations: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    /// Initialize the application state
    pub async fn initialize(&mut self) -> Result<(), AppStateError> {
        if self.initialized {
            return Ok(());
        }

        let license_tier = self.license_tier;
        tracing::info!("Initializing application state for {:?} tier", license_tier);

        // For the open-source community build we assume the runtime is valid.
        // If you later provide enterprise license integration, restore checks.

        // Initialize based on tier
        match license_tier {
            LicenseTier::Community => {
                tracing::info!("🌍 Community features initialized");
            }
            LicenseTier::Pro => {
                tracing::info!("💼 Pro features initialized");
            }
            LicenseTier::Team => {
                tracing::info!("👥 Team features initialized");
            }
            LicenseTier::Enterprise => {
                tracing::info!("🏢 Enterprise features initialized");
            }
        }

        self.initialized = true;
        Ok(())
    }

    /// Get current license tier
    pub async fn get_license_tier(&self) -> LicenseTier {
        self.license_tier
    }

    /// Get plugin access mode (the key differentiator)
    pub async fn get_plugin_access_mode(&self) -> PluginAccessMode {
        self.plugin_access_mode
    }

    /// Check if a feature is available
    pub async fn has_feature(&self, feature: &str) -> bool {
        // Minimal feature gating for the community build.
        match self.license_tier {
            LicenseTier::Community => {
                // Community has only a basic feature set; return false for premium features
                !matches!(feature, "ai" | "enterprise")
            }
            _ => true,
        }
    }

    /// Create a new session
    pub async fn create_session(&self, user_id: &str) -> Result<Uuid, AppStateError> {
        let session_id = Uuid::new_v4();
        let session = SessionInfo {
            session_id,
            user_id: user_id.to_string(),
            created_at: chrono::Utc::now(),
            last_access: chrono::Utc::now(),
        };

        self.sessions.write().await.insert(session_id, session);
        
        tracing::info!("Created session {} for user {}", session_id, user_id);
        Ok(session_id)
    }

    /// Load a plugin (behavior depends on license)
    pub async fn load_plugin(&self, plugin_path: &str) -> Result<String, AppStateError> {
        let plugin_access_mode = self.get_plugin_access_mode().await;
        
        match plugin_access_mode {
            PluginAccessMode::UnsignedAllowed => {
                // Community/Pro/Team: Load any plugins
                tracing::info!("Loading unsigned plugin: {}", plugin_path);
                let plugin_id = format!("plugin_{}", uuid::Uuid::new_v4());
                self.plugins.write().await.push(plugin_id.clone());
                Ok(plugin_id)
            }
            PluginAccessMode::SignedOnly => {
                // Enterprise: Only load signed plugins
                tracing::info!("Checking plugin signature: {}", plugin_path);
                
                // TODO: Implement actual signature verification
                if plugin_path.contains("signed") {
                    let plugin_id = format!("signed_plugin_{}", uuid::Uuid::new_v4());
                    self.plugins.write().await.push(plugin_id.clone());
                    Ok(plugin_id)
                } else {
                    Err(AppStateError::UnsignedPluginRejected {
                        plugin_path: plugin_path.to_string(),
                    })
                }
            }
        }
    }

    /// List loaded plugins
    pub async fn list_plugins(&self) -> Vec<String> {
        self.plugins.read().await.clone()
    }

    /// Unload a plugin
    pub async fn unload_plugin(&self, plugin_id: &str) -> Result<(), AppStateError> {
        let mut plugins = self.plugins.write().await;
        if let Some(pos) = plugins.iter().position(|id| id == plugin_id) {
            plugins.remove(pos);
            tracing::info!("Unloaded plugin: {}", plugin_id);
            Ok(())
        } else {
            Err(AppStateError::PluginNotFound {
                plugin_id: plugin_id.to_string(),
            })
        }
    }

    /// Get system status
    pub async fn get_system_status(&self) -> SystemStatus {
        SystemStatus {
            initialized: self.initialized,
            license_tier: format!("{:?}", self.get_license_tier().await),
            plugin_access_mode: format!("{:?}", self.get_plugin_access_mode().await),
            plugins_loaded: self.list_plugins().await.len() as u32,
            active_sessions: self.sessions.read().await.len() as u32,
        }
    }
}

/// System status information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStatus {
    pub initialized: bool,
    pub license_tier: String,
    pub plugin_access_mode: String,
    pub plugins_loaded: u32,
    pub active_sessions: u32,
}

/// Application state errors
#[derive(Debug, thiserror::Error)]
pub enum AppStateError {
    #[error("Invalid license")]
    InvalidLicense,

    #[error("Plugin not found: {plugin_id}")]
    PluginNotFound { plugin_id: String },

    #[error("Unsigned plugin rejected in enterprise mode: {plugin_path}")]
    UnsignedPluginRejected { plugin_path: String },

    #[error("Session not found: {session_id}")]
    SessionNotFound { session_id: Uuid },

    #[error("Feature not available: {feature}")]
    FeatureNotAvailable { feature: String },

    #[error("Initialization failed: {reason}")]
    InitializationFailed { reason: String },
}

// Convert lower-level errors into AppStateError when used with `?` in initializers.
impl From<crate::action_dispatcher::ActionError> for AppStateError {
    fn from(e: crate::action_dispatcher::ActionError) -> Self {
        AppStateError::InitializationFailed { reason: format!("ActionDispatcher error: {}", e) }
    }
}

impl From<crate::async_orchestrator::OrchestrationError> for AppStateError {
    fn from(e: crate::async_orchestrator::OrchestrationError) -> Self {
        AppStateError::InitializationFailed { reason: format!("Orchestrator error: {}", e) }
    }
}