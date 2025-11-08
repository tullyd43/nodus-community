// Async orchestrator commands for JavaScript-to-Rust bridge
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use crate::state_mod::AppState;

pub type AppStateType = Arc<RwLock<AppState>>;

#[derive(Debug, Serialize, Deserialize)]
pub struct AsyncOperationContext {
    pub operation_id: String,
    pub operation_name: String,
    pub user_id: String,
    pub classification: String,
    pub timeout_ms: u64,
    pub metadata: Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OperationResult {
    pub operation_id: String,
    pub success: bool,
    pub result: Option<String>,
    pub error: Option<String>,
    pub duration_ms: u64,
}

/// Start async operation tracking in Rust backend
pub async fn start_async_operation(
    state: AppStateType, 
    context: AsyncOperationContext
) -> Result<(), String> {
    let app_state = state.read().await;
    
    // Start operation through the async orchestrator
    let orchestrator = &app_state.async_orchestrator;
    
    let classification = match context.classification.as_str() {
        "CONFIDENTIAL" => crate::async_orchestrator::ClassificationLevel::Confidential,
        "SECRET" => crate::async_orchestrator::ClassificationLevel::Secret,
        "INTERNAL" => crate::async_orchestrator::ClassificationLevel::Internal,
        _ => crate::async_orchestrator::ClassificationLevel::Public,
    };
    
    // Create operation runner 
    let runner = orchestrator.create_runner(
        &context.operation_name,
        &context.user_id,
        uuid::Uuid::parse_str(&context.operation_id)
            .unwrap_or_else(|_| uuid::Uuid::new_v4()),
        classification,
    ).await;
    
    // Store the runner for later completion
    let mut active_operations = app_state.active_async_operations.write().await;
    active_operations.insert(context.operation_id.clone(), runner);
    
    // Log operation start
    println!("[AsyncOrchestrator] Started operation: {} ({})", 
        context.operation_name, context.operation_id);
    
    Ok(())
}

/// Complete async operation (success or failure)
pub async fn complete_async_operation(
    state: AppStateType,
    operation_id: String,
    success: bool,
    result: Option<String>,
    error: Option<String>,
) -> Result<OperationResult, String> {
    let app_state = state.read().await;
    
    // Remove from active operations
    let mut active_operations = app_state.active_async_operations.write().await;
    let _runner = active_operations.remove(&operation_id);
    
    // Create result record
    let operation_result = OperationResult {
        operation_id: operation_id.clone(),
        success,
        result,
        error,
        duration_ms: 0, // TODO: Track actual duration
    };
    
    // Log completion
    if success {
        println!("[AsyncOrchestrator] Completed operation: {} (success)", operation_id);
    } else {
        println!("[AsyncOrchestrator] Completed operation: {} (error: {:?})", 
            operation_id, operation_result.error);
    }
    
    // Store operation metrics
    let _orchestrator = &app_state.async_orchestrator;
    // TODO: Update operation metrics here
    
    Ok(operation_result)
}

/// Get active operation count
pub async fn get_active_operations_count(state: AppStateType) -> Result<usize, String> {
    let app_state = state.read().await;
    let active_operations = app_state.active_async_operations.read().await;
    Ok(active_operations.len())
}

/// Get operation statistics  
pub async fn get_operation_stats(state: AppStateType) -> Result<Value, String> {
    let app_state = state.read().await;
    let orchestrator = &app_state.async_orchestrator;
    
    let stats = serde_json::json!({
        "total_operations": 0, // TODO: Get from orchestrator metrics
        "active_operations": app_state.active_async_operations.read().await.len(),
        "avg_duration_ms": 0.0, // TODO: Calculate from metrics
        "success_rate": 100.0, // TODO: Calculate from metrics
    });
    
    Ok(stats)
}

// Extension to AppState to add async operation tracking

impl crate::state_mod::AppState {
    pub fn add_async_operation_tracking(&mut self) {
        // This would be called during AppState initialization
        // to add the HashMap for tracking active operations
    }
}

// Note: The active_async_operations field needs to be added to AppState struct
// This is a placeholder implementation showing the required interface
