// universal_plugin_system.rs - Universal Plugin System with License Integration
// Properly integrates with your license_mod.rs system

use serde::{Serialize, Deserialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use uuid::Uuid;

// Import from your license system
use crate::license_mod::{LicenseTier, PluginAccessMode};
use crate::action_dispatcher::{Action, ActionContext, ActionResult};
use async_trait::async_trait;

/// Universal Plugin System - Properly integrated with your license system
#[derive(Debug)]
pub struct UniversalPluginSystem {
    /// JavaScript plugins (hot reload)
    js_plugins: Arc<RwLock<HashMap<String, JSPlugin>>>,
    
    /// Rust plugins (restart required)  
    rust_plugins: Arc<RwLock<HashMap<String, Box<dyn RustPlugin>>>>,
    
    /// Plugin execution order (lower numbers first)
    execution_order: Arc<RwLock<Vec<String>>>,
    
    /// Plugin relationships (composable like your relationship system)
    #[allow(dead_code)]
    plugin_relationships: Arc<RwLock<Vec<PluginRelationship>>>,
    
    /// License-based restrictions (from your license system)
    license_tier: LicenseTier,
    plugin_access_mode: PluginAccessMode,
}

/// JavaScript Plugin (hot reloadable)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JSPlugin {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    
    /// Plugin code (JavaScript source)
    pub code: String,
    
    /// Actions this plugin handles
    pub handled_actions: Vec<String>,
    
    /// Plugin metadata
    pub metadata: PluginMetadata,
    
    /// License requirements (integrates with your license system)
    pub license_requirements: LicenseRequirement,
    
    /// Plugin state
    pub enabled: bool,
    pub loaded_at: DateTime<Utc>,
}

/// Rust Plugin Trait (for compiled plugins)
#[async_trait]
pub trait RustPlugin: Send + Sync + std::fmt::Debug {
    async fn initialize(&mut self) -> Result<(), PluginError>;
    async fn execute_action(&self, action: &Action, context: &ActionContext) -> Result<ActionResult, PluginError>;
    fn get_handled_actions(&self) -> Vec<String>;
    fn get_metadata(&self) -> &PluginMetadata;
    fn get_license_requirements(&self) -> &LicenseRequirement;
}

/// Plugin metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginMetadata {
    pub plugin_id: Uuid,
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub tags: Vec<String>,
    pub priority: i32,
    pub dependencies: Vec<String>,
    pub conflicts: Vec<String>,
    pub homepage: Option<String>,
    pub documentation: Option<String>,
}

/// Plugin relationships (composable like your relationship system)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginRelationship {
    pub relationship_id: Uuid,
    pub source_plugin: String,
    pub target_plugin: String,
    pub relationship_type: PluginRelationshipType,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PluginRelationshipType {
    /// One plugin depends on another
    DependsOn,
    /// One plugin enhances another
    Enhances,
    /// Plugins conflict with each other
    ConflictsWith,
    /// Plugins can be used together
    CompatibleWith,
    /// Custom relationship types
    Custom(String),
}

/// License requirements for plugins (integrates with your license system)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseRequirement {
    pub minimum_tier: LicenseTier,
    pub requires_signed: bool,
    pub enterprise_only_features: Vec<String>,
}

/// Plugin information summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub plugin_type: PluginType,
    pub enabled: bool,
    pub loaded_at: DateTime<Utc>,
    pub license_tier_required: LicenseTier,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PluginType {
    JavaScript,
    Rust,
}

/// Plugin errors
#[derive(Debug, thiserror::Error)]
pub enum PluginError {
    #[error("Plugin not found: {plugin_id}")]
    PluginNotFound { plugin_id: String },
    
    #[error("License insufficient: plugin '{plugin_id}' requires {required_tier:?}, current: {current_tier:?}")]
    LicenseInsufficient { 
        plugin_id: String, 
        required_tier: LicenseTier, 
        current_tier: LicenseTier 
    },
    
    #[error("Plugin signature invalid: {plugin_id}")]
    InvalidSignature { plugin_id: String },
    
    #[error("Plugin dependency not met: {plugin_id} depends on {dependency}")]
    DependencyNotMet { plugin_id: String, dependency: String },
    
    #[error("Plugin conflict: {plugin_id} conflicts with {conflicting_plugin}")]
    PluginConflict { plugin_id: String, conflicting_plugin: String },
    
    #[error("Plugin execution error: {message}")]
    ExecutionError { message: String },
    
    #[error("Plugin initialization error: {message}")]
    InitializationError { message: String },
}

impl UniversalPluginSystem {
    /// Create new universal plugin system (integrates with your license system)
    pub async fn new(license_tier: LicenseTier, plugin_access_mode: PluginAccessMode) -> Self {
        tracing::info!(
            "Initializing plugin system with license tier: {:?}, access mode: {:?}",
            license_tier, plugin_access_mode
        );

        Self {
            js_plugins: Arc::new(RwLock::new(HashMap::new())),
            rust_plugins: Arc::new(RwLock::new(HashMap::new())),
            execution_order: Arc::new(RwLock::new(Vec::new())),
            plugin_relationships: Arc::new(RwLock::new(Vec::new())),
            license_tier,
            plugin_access_mode,
        }
    }
    
    /// Register JavaScript plugin (with license validation)
    pub async fn register_js_plugin(&self, mut js_plugin: JSPlugin) -> Result<(), PluginError> {
        // Check license requirements FIRST (uses your license system)
        self.check_license_requirements(&js_plugin.license_requirements, Some(&js_plugin.id)).await?;

        // Check signature if required (enterprise feature)
        if matches!(self.plugin_access_mode, PluginAccessMode::SignedOnly) {
            if !js_plugin.license_requirements.requires_signed {
                return Err(PluginError::InvalidSignature { 
                    plugin_id: js_plugin.id.clone() 
                });
            }
            // Perform a minimal signature verification pass (stub).
            // In production this should verify a cryptographic signature.
            if !Self::verify_plugin_signature(&js_plugin) {
                return Err(PluginError::InvalidSignature { plugin_id: js_plugin.id.clone() });
            }
            tracing::info!("Signature validation (stub) passed for plugin: {}", js_plugin.id);
        }

        // Check dependencies
        self.check_plugin_dependencies(&js_plugin.id, &js_plugin.metadata.dependencies).await?;

        // Store plugin
        let plugin_id = js_plugin.id.clone();
        js_plugin.loaded_at = Utc::now();
        js_plugin.enabled = true;

        {
            let mut js_plugins = self.js_plugins.write().await;
            js_plugins.insert(plugin_id.clone(), js_plugin);
        }

        // Update execution order
        self.update_execution_order(&plugin_id).await;

        tracing::info!("JavaScript plugin registered: {}", plugin_id);
        Ok(())
    }

    /// Remove JavaScript plugin
    pub async fn remove_js_plugin(&self, plugin_id: &str) -> Result<(), PluginError> {
        let mut js_plugins = self.js_plugins.write().await;
        if js_plugins.remove(plugin_id).is_some() {
            tracing::info!("Removed JavaScript plugin: {}", plugin_id);
            Ok(())
        } else {
            Err(PluginError::PluginNotFound {
                plugin_id: plugin_id.to_string(),
            })
        }
    }
    
    /// Try to execute action through plugin system
    pub async fn try_execute_action(
        &self,
        action: &Action,
        context: &ActionContext,
        _app_state: &crate::state_mod::AppState,
    ) -> Result<Option<ActionResult>, PluginError> {
        let action_type = &action.action_type;
        
        // Check JavaScript plugins first (hot reloadable)
        {
            let js_plugins = self.js_plugins.read().await;
            for (plugin_id, js_plugin) in js_plugins.iter() {
                if js_plugin.enabled && js_plugin.handled_actions.contains(action_type) {
                    // Check license requirements again at execution time
                    if self.check_license_requirements(&js_plugin.license_requirements, Some(&js_plugin.id)).await.is_err() {
                        tracing::warn!("Skipping plugin {} due to license requirements", plugin_id);
                        continue;
                    }
                    
                    let start_time = std::time::Instant::now();
                    let result = self.execute_js_plugin(js_plugin, action, context).await;
                    let duration = start_time.elapsed();
                    
                        let action_result = match result {
                            Ok(data) => ActionResult {
                                success: true,
                                data: Some(data),
                                error: None,
                                execution_time_ms: duration.as_millis() as u64,
                                side_effects: vec![format!("Plugin {} executed", plugin_id)],
                                observability_metadata: crate::action_dispatcher::ObservabilityMetadata {
                                    operation_id: Uuid::new_v4().to_string(),
                                    instrumentation_applied: false,
                                    audit_logged: false,
                                    metrics_recorded: false,
                                    performance_budget_status: "OK".to_string(),
                                    middleware_executed: vec![plugin_id.clone()],
                                },
                            },
                            Err(e) => {
                                tracing::error!("Plugin {} execution failed: {}", plugin_id, e);
                                continue; // Try next plugin
                            }
                        };
                    
                    return Ok(Some(action_result));
                }
            }
        }
        
        // Check Rust plugins if no JS plugin handled it
        {
            let rust_plugins = self.rust_plugins.read().await;
            for (plugin_id, rust_plugin) in rust_plugins.iter() {
                let handled_actions = rust_plugin.get_handled_actions();
                if handled_actions.contains(&action_type.to_string()) {
                    // Check license requirements
                    let rust_plugin_id = rust_plugin.get_metadata().plugin_id.to_string();
                    if self.check_license_requirements(rust_plugin.get_license_requirements(), Some(&rust_plugin_id)).await.is_err() {
                        tracing::warn!("Skipping Rust plugin {} due to license requirements", plugin_id);
                        continue;
                    }
                    
                    let start_time = std::time::Instant::now();
                    match rust_plugin.execute_action(action, context).await {
                        Ok(mut result) => {
                            result.execution_time_ms = start_time.elapsed().as_millis() as u64;
                            result.side_effects.push(format!("Rust plugin {} executed", plugin_id));
                            return Ok(Some(result));
                        }
                        Err(e) => {
                            tracing::error!("Rust plugin {} execution failed: {}", plugin_id, e);
                            continue;
                        }
                    }
                }
            }
        }
        
        // No plugin handled the action
        Ok(None)
    }
    
    /// Get all plugins
    pub async fn get_all_plugins(&self) -> Vec<PluginInfo> {
        let mut plugins = Vec::new();
        
        // JavaScript plugins
        {
            let js_plugins = self.js_plugins.read().await;
            for (_, plugin) in js_plugins.iter() {
                plugins.push(PluginInfo {
                    id: plugin.id.clone(),
                    name: plugin.name.clone(),
                    version: plugin.version.clone(),
                    plugin_type: PluginType::JavaScript,
                    enabled: plugin.enabled,
                    loaded_at: plugin.loaded_at,
                    license_tier_required: plugin.license_requirements.minimum_tier.clone(),
                });
            }
        }
        
        // Rust plugins
        {
            let rust_plugins = self.rust_plugins.read().await;
            for (_, plugin) in rust_plugins.iter() {
                let metadata = plugin.get_metadata();
                let license_req = plugin.get_license_requirements();
                plugins.push(PluginInfo {
                    id: metadata.plugin_id.to_string(),
                    name: metadata.name.clone(),
                    version: metadata.version.clone(),
                    plugin_type: PluginType::Rust,
                    enabled: true, // Rust plugins are always enabled once loaded
                    loaded_at: Utc::now(),
                    license_tier_required: license_req.minimum_tier.clone(),
                });
            }
        }
        
        plugins
    }
    
    /// Execute JavaScript plugin (mock implementation)
    async fn execute_js_plugin(
        &self,
        js_plugin: &JSPlugin,
        action: &Action,
        _context: &ActionContext,
    ) -> Result<serde_json::Value, PluginError> {
        tracing::debug!("Executing JS plugin: {} for action: {}", js_plugin.name, action.action_type);
        
    // Note: JavaScript execution is intentionally a mock here.
    // A production implementation should run plugin JavaScript in a
    // sandboxed JS runtime (QuickJS, Deno core, or WASM) and safely
    // serialize the result. For the community build we return a
    // stable mock payload so plugins can be exercised in tests.
        Ok(serde_json::json!({
            "plugin_id": js_plugin.id,
            "action_type": action.action_type,
            "result": "success",
            "data": {
                "message": format!("Action {} handled by plugin {}", action.action_type, js_plugin.name),
                "plugin_type": "javascript",
                "executed": true,
                "mock": true
            }
        }))
    }
    
    /// Minimal plugin signature verification stub.
    /// Replace with real cryptographic verification in production.
    fn verify_plugin_signature(js_plugin: &JSPlugin) -> bool {
        tracing::debug!("Verifying plugin signature (stub) for {}", js_plugin.id);
        // Always return true for now; real implementation should verify signature blob
        true
    }

    /// Check license requirements (integrates with your license system)
    /// `plugin_id` is optional and used to produce better error messages when present.
    async fn check_license_requirements(&self, requirements: &LicenseRequirement, plugin_id: Option<&str>) -> Result<(), PluginError> {
        let pid = plugin_id.unwrap_or("unknown").to_string();
        // Check minimum tier
        if self.license_tier < requirements.minimum_tier {
            return Err(PluginError::LicenseInsufficient {
                plugin_id: pid.clone(),
                required_tier: requirements.minimum_tier.clone(),
                current_tier: self.license_tier.clone(),
            });
        }

        // Check signature requirements
        if requirements.requires_signed && matches!(self.plugin_access_mode, PluginAccessMode::UnsignedAllowed) {
            // This plugin requires signed access but we're in unsigned mode
            return Err(PluginError::LicenseInsufficient {
                plugin_id: pid.clone(),
                required_tier: LicenseTier::Enterprise, // Signed plugins need Enterprise
                current_tier: self.license_tier.clone(),
            });
        }

        Ok(())
    }
    
    /// Check plugin dependencies
    async fn check_plugin_dependencies(&self, plugin_id: &str, dependencies: &[String]) -> Result<(), PluginError> {
        let js_plugins = self.js_plugins.read().await;
        let rust_plugins = self.rust_plugins.read().await;
        
        for dependency in dependencies {
            let dep_exists = js_plugins.contains_key(dependency) || rust_plugins.contains_key(dependency);
            if !dep_exists {
                return Err(PluginError::DependencyNotMet {
                    plugin_id: plugin_id.to_string(),
                    dependency: dependency.clone(),
                });
            }
        }
        
        Ok(())
    }
    
    /// Update plugin execution order based on priorities and dependencies
    async fn update_execution_order(&self, new_plugin_id: &str) {
        let mut order = self.execution_order.write().await;
        if !order.contains(&new_plugin_id.to_string()) {
            order.push(new_plugin_id.to_string());
        }
        
        // In real implementation, would sort by priority and resolve dependencies
        tracing::debug!("Updated execution order for: {}", new_plugin_id);
    }
}

impl Default for LicenseRequirement {
    fn default() -> Self {
        Self {
            minimum_tier: LicenseTier::Community,
            requires_signed: false,
            enterprise_only_features: Vec::new(),
        }
    }
}