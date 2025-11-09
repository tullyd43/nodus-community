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
    // Record start time for duration tracking
    let mut starts = app_state.active_async_operation_starts.write().await;
    starts.insert(context.operation_id.clone(), chrono::Utc::now());
    
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
    
    // Compute duration if we have a recorded start time
    let mut duration_ms: u64 = 0;
    {
        let mut starts = app_state.active_async_operation_starts.write().await;
        if let Some(start_ts) = starts.remove(&operation_id) {
            let dur = chrono::Utc::now().signed_duration_since(start_ts);
            duration_ms = dur.num_milliseconds().max(0) as u64;
        }
    }

    // Create result record
    let operation_result = OperationResult {
        operation_id: operation_id.clone(),
        success,
        result,
        error,
        duration_ms,
    };
    
    // Log completion
    if success {
        println!("[AsyncOrchestrator] Completed operation: {} (success)", operation_id);
    } else {
        println!("[AsyncOrchestrator] Completed operation: {} (error: {:?})", 
            operation_id, operation_result.error);
    }
    
    // Update minimal metrics: increment completed counter
    {
        let mut completed = app_state.completed_operations_count.write().await;
        *completed = completed.saturating_add(1);
    }
    
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
    let _orchestrator = &app_state.async_orchestrator;
    
    let completed = *app_state.completed_operations_count.read().await;
    let active_ops = app_state.active_async_operations.read().await.len();
    let total_ops = completed + active_ops as u64;
    let avg_duration_ms = 0.0_f64; // no historical durations stored in community build
    let success_rate = 100.0_f64; // optimistic default

    let stats = serde_json::json!({
        "total_operations": total_ops,
        "active_operations": active_ops,
        "avg_duration_ms": avg_duration_ms,
        "success_rate": success_rate,
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
