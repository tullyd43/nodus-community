// src/action_dispatcher.rs
// Action Dispatcher - UI Action Execution Gateway (Community Version)
// Simplified version without enterprise observability and security

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;

/// Action Dispatcher - Simplified for community version
pub struct ActionDispatcher {
    // Action handler registry
    action_handlers: Arc<RwLock<HashMap<String, Box<dyn ActionHandler>>>>,
    
    // Action middleware for basic features
    middleware_stack: Arc<RwLock<Vec<Box<dyn ActionMiddleware>>>>,
    
    // Performance tracking (simplified)
    action_performance: Arc<RwLock<HashMap<String, ActionPerformanceStats>>>,
    
    // Basic action validation
    action_validator: ActionValidator,
}

impl std::fmt::Debug for ActionDispatcher {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ActionDispatcher")
            .field("handlers_count", &self.action_handlers.try_read().map(|h| h.len()).unwrap_or(0))
            .field("middleware_count", &self.middleware_stack.try_read().map(|m| m.len()).unwrap_or(0))
            .finish()
    }
}

/// Action that can be dispatched through the system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    pub action_type: String,
    pub payload: serde_json::Value,
    pub metadata: ActionMetadata,
}

/// Metadata for action tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionMetadata {
    pub action_id: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub source: Option<String>,
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub trace_id: Option<String>,
}

/// Action execution context (simplified)
#[derive(Debug, Clone)]
pub struct ActionContext {
    pub user_id: String,
    pub session_id: String,
    pub security_label: Option<String>,
    pub request_metadata: HashMap<String, String>,
    // Removed enterprise-specific fields:
    // - security_label
}

/// Action handler trait
#[async_trait::async_trait]
pub trait ActionHandler: Send + Sync {
    /// Execute the action
    async fn execute(
        &self,
        action: &Action,
        context: &ActionContext,
        app_state: &crate::state_mod::AppState,
    ) -> Result<serde_json::Value, ActionError>;
    
    /// Get the action type this handler supports
    fn action_type(&self) -> &str;
    
    /// Validate the action before execution
    async fn validate(&self, action: &Action, _context: &ActionContext) -> Result<(), ActionError> {
        // Basic validation - check required fields
        if action.action_type.is_empty() {
            return Err(ActionError::ValidationError {
                field: "action_type".to_string(),
                message: "Action type cannot be empty".to_string(),
            });
        }
        Ok(())
    }
}

/// Action middleware trait (simplified)
#[async_trait::async_trait] 
pub trait ActionMiddleware: Send + Sync {
    /// Execute before action
    async fn before_execute(
        &self,
        _action: &mut Action,
        _context: &ActionContext,
    ) -> Result<(), ActionError> {
        Ok(())
    }
    
    /// Execute after action
    async fn after_execute(
        &self,
        _action: &Action,
        _result: &mut ActionResult,
        _context: &ActionContext,
    ) -> Result<(), ActionError> {
        Ok(())
    }
    
    /// Get middleware priority (lower numbers execute first)
    fn priority(&self) -> u32 {
        100
    }
    
    /// Get middleware name
    fn name(&self) -> &str;
}

/// Action execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionResult {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
    pub execution_time_ms: u64,
    pub side_effects: Vec<String>,
    pub observability_metadata: ObservabilityMetadata,
}

/// Simplified observability metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObservabilityMetadata {
    pub operation_id: String,
    pub instrumentation_applied: bool,
    pub audit_logged: bool,
    pub metrics_recorded: bool,
    pub performance_budget_status: String,
    pub middleware_executed: Vec<String>,
}

/// Action performance statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionPerformanceStats {
    pub total_executions: u64,
    pub avg_duration_ms: f64,
    pub success_rate: f64,
    pub last_execution: chrono::DateTime<chrono::Utc>,
    pub slowest_execution_ms: u64,
    pub fastest_execution_ms: u64,
}

/// Action errors
#[derive(Debug, thiserror::Error)]
pub enum ActionError {
    #[error("Handler not found for action type: {action_type}")]
    HandlerNotFound { action_type: String },
    
    #[error("Validation error in field '{field}': {message}")]
    ValidationError { field: String, message: String },
    
    #[error("Execution error: {message}")]
    ExecutionError { message: String },
    
    #[error("Middleware error: {middleware} - {message}")]
    MiddlewareError { middleware: String, message: String },
    
    #[error("Timeout: action took longer than expected")]
    Timeout,
    
    #[error("Serialization error: {message}")]
    SerializationError { message: String },
    
    #[error("Authorization error: {message}")]
    AuthorizationError { message: String },
    
    #[error("System error: {message}")]
    SystemError { message: String },
}

/// Action validator (simplified)
#[derive(Debug)]
pub struct ActionValidator {
    // Simplified validation rules
    max_payload_size: usize,
    allowed_action_types: Option<Vec<String>>,
}

impl ActionValidator {
    fn new() -> Self {
        Self {
            max_payload_size: 1024 * 1024, // 1MB
            allowed_action_types: None,
        }
    }
    
    async fn validate_action(&self, action: &Action) -> Result<(), ActionError> {
        // Basic validation
        if action.action_type.is_empty() {
            return Err(ActionError::ValidationError {
                field: "action_type".to_string(),
                message: "Action type is required".to_string(),
            });
        }
        
        // Check payload size
        let payload_str = serde_json::to_string(&action.payload)
            .map_err(|e| ActionError::SerializationError {
                message: format!("Failed to serialize payload: {}", e),
            })?;
        
        if payload_str.len() > self.max_payload_size {
            return Err(ActionError::ValidationError {
                field: "payload".to_string(),
                message: format!("Payload too large: {} bytes (max: {})", 
                    payload_str.len(), self.max_payload_size),
            });
        }
        
        // Check allowed action types
        if let Some(allowed) = &self.allowed_action_types {
            if !allowed.contains(&action.action_type) {
                return Err(ActionError::ValidationError {
                    field: "action_type".to_string(),
                    message: format!("Action type '{}' not allowed", action.action_type),
                });
            }
        }
        
        Ok(())
    }
}

impl ActionDispatcher {
    /// Create new action dispatcher (simplified)
    pub async fn new() -> Result<Self, ActionError> {
        Ok(Self {
            action_handlers: Arc::new(RwLock::new(HashMap::new())),
            middleware_stack: Arc::new(RwLock::new(Vec::new())),
            action_performance: Arc::new(RwLock::new(HashMap::new())),
            action_validator: ActionValidator::new(),
        })
    }
    
    /// Execute an action
    ///
    /// Now accepts a reference to the application state so handlers and middleware
    /// have access to runtime state without resorting to unsafe code.
    pub async fn execute_action(
        &self,
        action: Action,
        context: ActionContext,
        app_state: &crate::state_mod::AppState,
    ) -> Result<ActionResult, ActionError> {
        let start_time = std::time::Instant::now();
        
        println!("[ActionDispatcher] Executing action: {}", action.action_type);
        
        // Validate action
        self.action_validator.validate_action(&action).await?;
        
        // Create mutable copies for middleware
        let mut action = action;
        
        // Execute before middleware
        {
            let middleware = self.middleware_stack.read().await;
            for middleware in middleware.iter() {
                middleware.before_execute(&mut action, &context).await?;
            }
        }
        
        // Find and execute action handler
        let handlers = self.action_handlers.read().await;

        // Exact match first
        let handler_opt: Option<&Box<dyn ActionHandler>> = if let Some(h) = handlers.get(&action.action_type) {
            Some(h)
        } else {
            // Support simple wildcard handlers registered as `prefix.*`, e.g. `grid.*`
            handlers.values().find(|h| {
                let pattern = h.action_type();
                if pattern.ends_with(".*") {
                    let prefix = &pattern[..pattern.len() - 2];
                    action.action_type.starts_with(prefix)
                } else {
                    false
                }
            })
        };

        let handler = handler_opt.ok_or_else(|| ActionError::HandlerNotFound {
            action_type: action.action_type.clone(),
        })?;

        // Use the provided app_state parameter (safer than the previous null-deref)
        let result = handler.execute(&action, &context, app_state).await;
        
        // Create result for middleware processing
        let mut action_result = match result {
            Ok(data) => ActionResult {
                success: true,
                data: Some(data.clone()),
                error: None,
                execution_time_ms: 0, // Will be updated later
                side_effects: Vec::new(),
                observability_metadata: ObservabilityMetadata {
                    operation_id: action.metadata.action_id.to_string(),
                    instrumentation_applied: false,
                    audit_logged: false,
                    metrics_recorded: false,
                    performance_budget_status: "OK".to_string(),
                    middleware_executed: Vec::new(),
                },
            },
            Err(ref error) => ActionResult {
                success: false,
                data: None,
                error: Some(error.to_string()),
                execution_time_ms: 0,
                side_effects: Vec::new(),
                observability_metadata: ObservabilityMetadata {
                    operation_id: action.metadata.action_id.to_string(),
                    instrumentation_applied: false,
                    audit_logged: false,
                    metrics_recorded: false,
                    performance_budget_status: "ERROR".to_string(),
                    middleware_executed: Vec::new(),
                },
            },
        };
        
        // Execute after middleware
        {
            let middleware = self.middleware_stack.read().await;
            for middleware in middleware.iter() {
                middleware.after_execute(&action, &mut action_result, &context).await?;
            }
        }
        
        // Update execution time
        action_result.execution_time_ms = start_time.elapsed().as_millis() as u64;
        
        // Update performance statistics
        self.update_action_performance(&action.action_type, start_time.elapsed(), action_result.success).await;
        
        println!("[ActionDispatcher] Action completed: {} ({}ms)", 
            action.action_type, action_result.execution_time_ms);

        Ok(action_result)
    }
    
    /// Register action handler
    pub async fn register_handler<H>(&self, handler: H)
    where
        H: ActionHandler + 'static,
    {
        let action_type = handler.action_type().to_string();
        let mut handlers = self.action_handlers.write().await;
        handlers.insert(action_type, Box::new(handler));
    }
    
    /// Add middleware to the processing pipeline
    pub async fn add_middleware<M>(&self, middleware: M)
    where
        M: ActionMiddleware + 'static,
    {
        let mut stack = self.middleware_stack.write().await;
        stack.push(Box::new(middleware));
        
        // Sort by priority (lower numbers first)
        stack.sort_by_key(|m| m.priority());
    }
    
    /// Get action performance statistics
    pub async fn get_action_stats(&self) -> HashMap<String, ActionPerformanceStats> {
        self.action_performance.read().await.clone()
    }
    
    /// Get list of registered action types
    pub async fn get_registered_actions(&self) -> Vec<String> {
        let handlers = self.action_handlers.read().await;
        handlers.keys().cloned().collect()
    }
    
    /// Update action performance statistics
    async fn update_action_performance(
        &self,
        action_type: &str,
        execution_time: std::time::Duration,
        success: bool,
    ) {
        let mut stats = self.action_performance.write().await;
        let duration_ms = execution_time.as_millis() as u64;
        
        let entry = stats.entry(action_type.to_string()).or_insert(ActionPerformanceStats {
            total_executions: 0,
            avg_duration_ms: 0.0,
            success_rate: 100.0,
            last_execution: chrono::Utc::now(),
            slowest_execution_ms: 0,
            fastest_execution_ms: u64::MAX,
        });
        
        entry.total_executions += 1;
        entry.last_execution = chrono::Utc::now();
        
        // Update average duration
        entry.avg_duration_ms = (entry.avg_duration_ms * (entry.total_executions - 1) as f64 + duration_ms as f64) / entry.total_executions as f64;
        
        // Update success rate
        let successes = if success {
            (entry.success_rate * (entry.total_executions - 1) as f64 / 100.0) + 1.0
        } else {
            entry.success_rate * (entry.total_executions - 1) as f64 / 100.0
        };
        entry.success_rate = successes / entry.total_executions as f64 * 100.0;
        
        // Update min/max times
        if duration_ms > entry.slowest_execution_ms {
            entry.slowest_execution_ms = duration_ms;
        }
        if duration_ms < entry.fastest_execution_ms || entry.fastest_execution_ms == u64::MAX {
            entry.fastest_execution_ms = duration_ms;
        }
    }
}

impl Default for ActionDispatcher {
    fn default() -> Self {
        Self {
            action_handlers: Arc::new(RwLock::new(HashMap::new())),
            middleware_stack: Arc::new(RwLock::new(Vec::new())),
            action_performance: Arc::new(RwLock::new(HashMap::new())),
            action_validator: ActionValidator::new(),
        }
    }
}

impl Action {
    /// Create new action
    pub fn new(action_type: &str, payload: serde_json::Value) -> Self {
        Self {
            action_type: action_type.to_string(),
            payload,
            metadata: ActionMetadata {
                action_id: uuid::Uuid::new_v4().to_string(),
                timestamp: chrono::Utc::now(),
                source: None,
                user_id: None,
                session_id: None,
                trace_id: None,
            },
        }
    }
    
    /// Set metadata fields
    pub fn with_metadata(mut self, user_id: Option<String>, session_id: Option<String>, source: Option<String>) -> Self {
        self.metadata.user_id = user_id;
        self.metadata.session_id = session_id;
        self.metadata.source = source;
        self
    }
}

impl ActionContext {
    /// Create new action context
    pub fn new(user_id: &str, session_id: &str) -> Self {
        Self {
            user_id: user_id.to_string(),
            session_id: session_id.to_string(),
            security_label: None,
            request_metadata: HashMap::new(),
        }
    }
    
    /// Add metadata
    pub fn with_metadata(mut self, key: &str, value: &str) -> Self {
        self.request_metadata.insert(key.to_string(), value.to_string());
        self
    }
}

/// Example basic action handler for grid operations
pub struct GridActionHandler;

#[async_trait::async_trait]
impl ActionHandler for GridActionHandler {
    async fn execute(
        &self,
        action: &Action,
        _context: &ActionContext,
        _app_state: &crate::state_mod::AppState,
    ) -> Result<serde_json::Value, ActionError> {
        match action.action_type.as_str() {
            "grid.save_config" => {
                println!("[GridActionHandler] Saving grid config");
                Ok(serde_json::json!({"status": "saved"}))
            },
            "grid.load_config" => {
                println!("[GridActionHandler] Loading grid config");
                Ok(serde_json::json!({"status": "loaded", "config": {}}))
            },
            "grid.move_block" => {
                println!("[GridActionHandler] Moving grid block");
                Ok(serde_json::json!({"status": "moved"}))
            },
            _ => Err(ActionError::ExecutionError {
                message: format!("Unknown grid action: {}", action.action_type),
            }),
        }
    }
    
    fn action_type(&self) -> &str {
        "grid.*" // Handles all grid actions
    }
}

/// Example middleware for basic logging
pub struct LoggingMiddleware;

#[async_trait::async_trait]
impl ActionMiddleware for LoggingMiddleware {
    async fn before_execute(
        &self,
        action: &mut Action,
        context: &ActionContext,
    ) -> Result<(), ActionError> {
        println!("[LoggingMiddleware] Before: {} by user {}", 
            action.action_type, context.user_id);
        Ok(())
    }
    
    async fn after_execute(
        &self,
        action: &Action,
        result: &mut ActionResult,
        _context: &ActionContext,
    ) -> Result<(), ActionError> {
        println!("[LoggingMiddleware] After: {} - {} ({}ms)", 
            action.action_type, 
            if result.success { "SUCCESS" } else { "FAILED" },
            result.execution_time_ms);
        
        result.observability_metadata.middleware_executed.push("LoggingMiddleware".to_string());
        Ok(())
    }
    
    fn priority(&self) -> u32 {
        10 // Execute early
    }
    
    fn name(&self) -> &str {
        "LoggingMiddleware"
    }
}