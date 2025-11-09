// src-tauri/src/state_mod.rs
// Application State - Properly integrated with license system and universal plugin system
// This version properly uses your license_mod.rs and universal_plugin_system.rs

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use uuid::Uuid;

// Import from your license module (instead of duplicating types)
use crate::license_mod::{LicenseManager, LicenseTier, PluginAccessMode, LicenseError};

// Import your universal plugin system
use crate::universal_plugin_system::{UniversalPluginSystem, PluginInfo, PluginError};
use crate::action_dispatcher::ActionResult;

/// Application state that properly integrates with your license system
#[derive(Clone, Debug)]
pub struct AppState {
    // THE KEY INTEGRATION: Use your actual license manager
    pub license_manager: Arc<LicenseManager>,
    pub initialized: bool,
    
    // Basic state that always exists
    pub config: AppConfig,
    pub sessions: Arc<RwLock<HashMap<Uuid, SessionInfo>>>,
    
    // UNIVERSAL PLUGIN SYSTEM INTEGRATION (not simple Vec<String>)
    pub plugin_system: Arc<UniversalPluginSystem>,
    
    // Core components for grid functionality
    pub storage: Arc<crate::storage::StorageManager>,
    pub action_dispatcher: Arc<crate::action_dispatcher::ActionDispatcher>,
    pub async_orchestrator: Arc<crate::async_orchestrator::AsyncOrchestrator>,
    
    // Tracking for active async operations
    pub active_async_operations: Arc<RwLock<HashMap<String, crate::async_orchestrator::OperationRunner>>>,
    pub active_async_operation_starts: Arc<RwLock<HashMap<String, chrono::DateTime<chrono::Utc>>>>,
    pub completed_operations_count: Arc<RwLock<u64>>,
}

/// Shared AppState handle used across engine modules
pub type AppStateType = Arc<RwLock<AppState>>;

/// Basic app configuration (aligned with license system)
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
    /// Create new app state with proper license integration
    pub async fn new() -> Result<Self, AppStateError> {
        // Initialize your license manager first
        let license_manager = Arc::new(LicenseManager::new().await?);
        
        // Get tier and plugin access mode from license manager
        let license_tier = license_manager.get_tier().await;
        let plugin_access_mode = license_manager.get_plugin_access_mode().await;
        
        let config = AppConfig {
            app_name: "Nodus".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            license_tier: license_tier.display_name().to_string(),
            plugin_access_mode: format!("{:?}", plugin_access_mode),
        };

        // Initialize core components
        let storage = Arc::new(crate::storage::StorageManager::new());
        let action_dispatcher = Arc::new(crate::action_dispatcher::ActionDispatcher::new().await?);
        let async_orchestrator = Arc::new(crate::async_orchestrator::AsyncOrchestrator::new().await?);

        // Register default core handlers and middleware so frontend actions
        // like `grid.*`, `system.*`, and `ui.*` are handled out-of-the-box in
        // the community build. These are lightweight and intentionally
        // conservative: they provide sensible defaults and avoid falling
        // back to offline mode when the app initializes.
        {
            // Register the GridActionHandler (defined in action_dispatcher.rs)
            let ad = action_dispatcher.clone();
            ad.register_handler(crate::action_dispatcher::GridActionHandler).await;

            // Small system handler for `system.*` actions (ping/bootstrap)
            struct SystemHandler;
            #[async_trait::async_trait]
            impl crate::action_dispatcher::ActionHandler for SystemHandler {
                async fn execute(
                    &self,
                    action: &crate::action_dispatcher::Action,
                    _context: &crate::action_dispatcher::ActionContext,
                    _app_state: crate::state_mod::AppStateType,
                ) -> Result<serde_json::Value, crate::action_dispatcher::ActionError> {
                    match action.action_type.as_str() {
                        "system.ping" => Ok(serde_json::json!({"status": "pong"})),
                        "system.bootstrap.completed" => Ok(serde_json::json!({"status": "ok"})),
                        _ => Ok(serde_json::json!({"status": "unhandled_system_action", "action": action.action_type})),
                    }
                }

                fn action_type(&self) -> &str {
                    "system.*"
                }
            }

            ad.register_handler(SystemHandler).await;

            // Small UI handler for `ui.*` actions (toasts, basic UI events)
            struct UiHandler;
            #[async_trait::async_trait]
            impl crate::action_dispatcher::ActionHandler for UiHandler {
                async fn execute(
                    &self,
                    action: &crate::action_dispatcher::Action,
                    _context: &crate::action_dispatcher::ActionContext,
                    _app_state: crate::state_mod::AppStateType,
                ) -> Result<serde_json::Value, crate::action_dispatcher::ActionError> {
                    match action.action_type.as_str() {
                        "ui.toast.show" => {
                            // Return a simple acknowledgment so the frontend can continue
                            Ok(serde_json::json!({"status": "toast_ack"}))
                        }
                        _ => Ok(serde_json::json!({"status": "unhandled_ui_action", "action": action.action_type})),
                    }
                }

                fn action_type(&self) -> &str {
                    "ui.*"
                }
            }

            ad.register_handler(UiHandler).await;

            // Register logging middleware from the core dispatcher so we get
            // consistent logs for middleware hooks during development.
            ad.add_middleware(crate::action_dispatcher::LoggingMiddleware).await;
        }

        // Initialize universal plugin system with license constraints
        let plugin_system = Arc::new(
            UniversalPluginSystem::new(license_tier, plugin_access_mode).await
        );

        Ok(Self {
            license_manager,
            initialized: false,
            config,
            sessions: Arc::new(RwLock::new(HashMap::new())),
            plugin_system,
            storage,
            action_dispatcher,
            async_orchestrator,
            active_async_operations: Arc::new(RwLock::new(HashMap::new())),
            active_async_operation_starts: Arc::new(RwLock::new(HashMap::new())),
            completed_operations_count: Arc::new(RwLock::new(0)),
        })
    }

    /// Initialize the application state
    pub async fn initialize(&mut self) -> Result<(), AppStateError> {
        if self.initialized {
            return Ok(());
        }

        let license_tier = self.license_manager.get_tier().await;
        tracing::info!("Initializing application state for {:?} tier", license_tier);

        // Validate license before initialization
        if let Some(license_info) = self.license_manager.get_license_info().await {
            match &license_info.status {
                crate::license_mod::LicenseStatus::Valid => {
                    tracing::info!("✅ License valid: {}", license_info.customer_name);
                }
                crate::license_mod::LicenseStatus::Expired => {
                    tracing::warn!("⚠️ License expired, falling back to Community tier");
                }
                _ => {
                    tracing::warn!("⚠️ License invalid, using Community tier");
                }
            }
        }

        // Initialize based on tier (using your license system's feature detection)
        match license_tier {
            LicenseTier::Community => {
                tracing::info!("🌍 Community features initialized");
                // Load community plugins if available
                self.load_community_plugins().await?;
            }
            LicenseTier::Pro => {
                tracing::info!("💼 Pro features initialized");
            }
            LicenseTier::Team => {
                tracing::info!("👥 Team features initialized");
            }
            LicenseTier::Enterprise => {
                tracing::info!("🏢 Enterprise features initialized");
                // Enterprise: Only signed plugins, auto-fetch from your plugin server
                self.load_enterprise_plugins().await?;
            }
        }

        self.initialized = true;
        Ok(())
    }

    /// Load community plugins (unsigned allowed)
    async fn load_community_plugins(&self) -> Result<(), AppStateError> {
        if self.license_manager.has_feature("unsigned_plugins_allowed").await {
            tracing::info!("Community plugin loading enabled");
            // Implementation would scan for community plugins
        }
        Ok(())
    }

    /// Load enterprise plugins (signed only, auto-fetch)
    async fn load_enterprise_plugins(&self) -> Result<(), AppStateError> {
        if self.license_manager.has_feature("signed_plugins_only").await {
            tracing::info!("Enterprise plugin loading enabled (signed only)");
            // Implementation would auto-fetch certified plugins from your server
        }
        Ok(())
    }

    /// Get current license tier (delegates to license manager)
    pub async fn get_license_tier(&self) -> LicenseTier {
        self.license_manager.get_tier().await
    }

    /// Get plugin access mode (delegates to license manager)
    pub async fn get_plugin_access_mode(&self) -> PluginAccessMode {
        self.license_manager.get_plugin_access_mode().await
    }

    /// Check if a feature is available (uses your license system)
    pub async fn has_feature(&self, feature: &str) -> bool {
        self.license_manager.has_feature(feature).await
    }

    // Action dispatch helpers

    /// Load a plugin (uses your license system constraints)
    pub async fn load_plugin(&self, plugin_path: &str) -> Result<String, AppStateError> {
        // Check license first
        let plugin_access_mode = self.get_plugin_access_mode().await;
        
        match plugin_access_mode {
            PluginAccessMode::UnsignedAllowed => {
                tracing::info!("Loading unsigned plugin: {}", plugin_path);
                // Use plugin system to load
                // Implementation would call plugin_system.load_js_plugin_from_file()
                Ok(format!("plugin_{}", Uuid::new_v4()))
            }
            PluginAccessMode::SignedOnly => {
                // Validate enterprise access first
                self.license_manager.validate_enterprise_access("signed_plugins_only").await?;
                
                tracing::info!("Checking plugin signature: {}", plugin_path);
                // Implementation would verify signature then load
                if self.verify_plugin_signature(plugin_path).await? {
                    Ok(format!("signed_plugin_{}", Uuid::new_v4()))
                } else {
                    Err(AppStateError::UnsignedPluginRejected {
                        plugin_path: plugin_path.to_string(),
                    })
                }
            }
        }
    }

    /// Verify plugin signature (enterprise feature)
    async fn verify_plugin_signature(&self, plugin_path: &str) -> Result<bool, AppStateError> {
        // Implementation would use your license system's crypto validation
        // For now, just check if path contains "signed"
        Ok(plugin_path.contains("signed"))
    }

    /// Get plugin info (delegates to universal plugin system)
    pub async fn get_plugin_info(&self) -> Vec<PluginInfo> {
        self.plugin_system.get_all_plugins().await
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

    /// Get app stats (enhanced with license info)
    pub async fn get_app_stats(&self) -> AppStats {
        let license_tier = self.get_license_tier().await;
        let plugin_info = self.get_plugin_info().await;
        let available_features = self.license_manager.get_available_features().await;

        AppStats {
            initialized: self.initialized,
            license_tier: license_tier.display_name().to_string(),
            plugin_access_mode: format!("{:?}", self.get_plugin_access_mode().await),
            plugins_loaded: plugin_info.len() as u32,
            active_sessions: self.sessions.read().await.len() as u32,
            available_features: available_features.len() as u32,
            license_status: if let Some(license) = self.license_manager.get_license_info().await {
                format!("{:?}", license.status)
            } else {
                "Community".to_string()
            },
        }
    }
}

/// Dispatch an action using the shared `AppStateType` handle.
/// This is the canonical entrypoint when callers already have the
/// Arc<RwLock<AppState>> handle (e.g. Tauri wrappers, tests).
pub async fn execute_action(
    state: AppStateType,
    action_type: String,
    payload: serde_json::Value,
) -> Result<ActionResult, AppStateError> {
    // Create action and context
    let action = crate::action_dispatcher::Action::new(&action_type, payload.clone()).with_metadata(None, None, None);
    let context = crate::action_dispatcher::ActionContext::new("", "");

    // Try plugin system first using a read lock
    let guard = state.read().await;
    match guard.plugin_system.try_execute_action(&action, &context, &guard).await {
        Ok(Some(result)) => Ok(result),
        Ok(None) => {
            // No plugin handled it: clone dispatcher, drop guard, then dispatch
            let dispatcher = guard.action_dispatcher.clone();
            drop(guard);
            dispatcher.execute_action(action, context, state.clone()).await.map_err(AppStateError::from)
        }
        Err(plugin_error) => {
            tracing::error!("Plugin system error: {}", plugin_error);
            let dispatcher = guard.action_dispatcher.clone();
            drop(guard);
            dispatcher.execute_action(action, context, state.clone()).await.map_err(AppStateError::from)
        }

    }
}

    /// Enhanced app statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppStats {
    pub initialized: bool,
    pub license_tier: String,
    pub plugin_access_mode: String,
    pub plugins_loaded: u32,
    pub active_sessions: u32,
    pub available_features: u32,
    pub license_status: String,
}

/// Application state errors (enhanced with license errors)
#[derive(Debug, thiserror::Error)]
pub enum AppStateError {
    #[error("License error: {0}")]
    License(#[from] LicenseError),

    #[error("Plugin error: {0}")]
    Plugin(#[from] PluginError),

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

// Convert lower-level errors into AppStateError
impl From<crate::action_dispatcher::ActionError> for AppStateError {
    fn from(e: crate::action_dispatcher::ActionError) -> Self {
        AppStateError::InitializationFailed { reason: format!("ActionDispatcher error: {}", e) }
    }
}
// End impl AppState

impl From<crate::async_orchestrator::OrchestrationError> for AppStateError {
    fn from(e: crate::async_orchestrator::OrchestrationError) -> Self {
        AppStateError::InitializationFailed { reason: format!("Orchestrator error: {}", e) }
    }
}

// (balanced)