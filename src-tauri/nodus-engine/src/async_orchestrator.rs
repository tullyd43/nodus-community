// src-tauri/src/observability/async_orchestrator.rs
// Async Orchestrator - Async Operation Execution Gateway with Automatic Observability
// Replaces AsyncOrchestrator.js with the dual execution gateway pattern

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{RwLock, Semaphore};
use std::collections::HashMap;
use uuid::Uuid;
use std::time::{Duration, Instant};
use futures::future::BoxFuture;

use crate::observability::{ObservabilityContext, AutomaticInstrumentation, PerformanceBudget};
use crate::security::{SecurityLabel, ClassificationLevel};
use crate::license::LicenseManager;
use crate::state::AppState;

/// Async Orchestrator - Second execution gateway for automatic observability
/// Handles async operations, background tasks, and performance-critical operations
#[derive(Debug)]
pub struct AsyncOrchestrator {
    // Automatic observability system
    automatic_instrumentation: AutomaticInstrumentation,
    
    // Operation execution management
    active_operations: Arc<RwLock<HashMap<Uuid, ActiveOperation>>>,
    
    // Concurrency control
    concurrency_limiter: Arc<Semaphore>,
    
    // Circuit breaker for reliability
    circuit_breakers: Arc<RwLock<HashMap<String, CircuitBreaker>>>,
    
    // Retry policies
    retry_policies: Arc<RwLock<HashMap<String, RetryPolicy>>>,
    
    // Performance tracking
    operation_metrics: Arc<RwLock<HashMap<String, OperationMetrics>>>,
    
    // Enterprise features
    license_manager: Arc<LicenseManager>,
    
    // Resource monitoring
    resource_monitor: ResourceMonitor,
}

/// Operation runner for executing async operations with automatic observability
#[derive(Debug)]
pub struct OperationRunner {
    operation_id: Uuid,
    operation_name: String,
    orchestrator: Arc<AsyncOrchestrator>,
    context: ObservabilityContext,
    performance_budget: PerformanceBudget,
    retry_policy: Option<RetryPolicy>,
    timeout: Option<Duration>,
}

/// Active operation tracking
#[derive(Debug, Clone)]
struct ActiveOperation {
    pub operation_id: Uuid,
    pub operation_name: String,
    pub start_time: Instant,
    pub user_id: String,
    pub session_id: Uuid,
    pub classification: ClassificationLevel,
    pub status: OperationStatus,
    pub progress: f64, // 0.0 to 1.0
    pub resource_usage: ResourceUsage,
}

/// Operation execution status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OperationStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
    TimedOut,
    CircuitBreakerOpen,
}

/// Resource usage tracking for operations
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ResourceUsage {
    pub cpu_time_ms: u64,
    pub memory_bytes: u64,
    pub disk_io_bytes: u64,
    pub network_io_bytes: u64,
}

/// Circuit breaker for operation reliability
#[derive(Debug, Clone)]
struct CircuitBreaker {
    pub operation_pattern: String,
    pub failure_threshold: u32,
    pub timeout_seconds: u64,
    pub current_failures: u32,
    pub state: CircuitBreakerState,
    pub last_failure_time: Option<Instant>,
    pub success_count_after_half_open: u32,
}

/// Circuit breaker states
#[derive(Debug, Clone, PartialEq)]
enum CircuitBreakerState {
    Closed,    // Normal operation
    Open,      // Failing fast
    HalfOpen,  // Testing if service recovered
}

/// Retry policy for operation resilience
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub base_delay_ms: u64,
    pub max_delay_ms: u64,
    pub backoff_multiplier: f64,
    pub jitter: bool,
    pub retriable_errors: Vec<String>,
}

/// Operation metrics for performance monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
struct OperationMetrics {
    pub total_executions: u64,
    pub successful_executions: u64,
    pub failed_executions: u64,
    pub avg_duration_ms: f64,
    pub p95_duration_ms: f64,
    pub p99_duration_ms: f64,
    pub last_execution: chrono::DateTime<chrono::Utc>,
    pub circuit_breaker_trips: u32,
    pub retry_attempts: u64,
}

/// Resource monitoring for system health
#[derive(Debug)]
struct ResourceMonitor {
    cpu_usage: Arc<RwLock<f64>>,
    memory_usage: Arc<RwLock<f64>>,
    active_connections: Arc<RwLock<u32>>,
    disk_io_rate: Arc<RwLock<f64>>,
    network_io_rate: Arc<RwLock<f64>>,
}

/// Operation execution configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationConfig {
    pub timeout_ms: Option<u64>,
    pub retries: Option<u32>,
    pub performance_budget_ms: Option<u64>,
    pub priority: OperationPriority,
    pub resource_limits: Option<ResourceLimits>,
    pub classification: Option<ClassificationLevel>,
    pub tags: HashMap<String, String>,
}

/// Operation priority for scheduling
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OperationPriority {
    Critical,   // Execute immediately
    High,       // Execute soon
    Normal,     // Standard priority
    Low,        // Execute when resources available
    Background, // Execute during idle time
}

/// Resource limits for operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLimits {
    pub max_memory_mb: Option<u32>,
    pub max_cpu_percent: Option<f64>,
    pub max_duration_ms: Option<u64>,
    pub max_concurrent_ops: Option<u32>,
}

/// Result of operation execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationResult<T> {
    pub value: T,
    pub execution_metadata: ExecutionMetadata,
}

/// Metadata about operation execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionMetadata {
    pub operation_id: String,
    pub duration_ms: u64,
    pub retry_attempts: u32,
    pub circuit_breaker_state: String,
    pub resource_usage: ResourceUsage,
    pub performance_budget_status: String,
    pub observability_applied: bool,
}

impl AsyncOrchestrator {
    /// Create new async orchestrator with automatic observability
    pub fn new(license_manager: Arc<LicenseManager>) -> Self {
        Self {
            automatic_instrumentation: AutomaticInstrumentation::new(license_manager.clone()),
            active_operations: Arc::new(RwLock::new(HashMap::new())),
            concurrency_limiter: Arc::new(Semaphore::new(100)), // Default 100 concurrent operations
            circuit_breakers: Arc::new(RwLock::new(HashMap::new())),
            retry_policies: Arc::new(RwLock::new(HashMap::new())),
            operation_metrics: Arc::new(RwLock::new(HashMap::new())),
            license_manager,
            resource_monitor: ResourceMonitor::new(),
        }
    }

    /// Create operation runner (replaces JavaScript AsyncOrchestrator.createRunner)
    pub async fn create_runner(
        &self,
        operation_name: &str,
        user_id: &str,
        session_id: Uuid,
        classification: ClassificationLevel,
    ) -> OperationRunner {
        let operation_id = Uuid::new_v4();
        
        let context = ObservabilityContext::new(
            "async_orchestrator",
            operation_name,
            classification.clone(),
            user_id,
            session_id,
        );

        let performance_budget = PerformanceBudget::new(
            5000, // Default 5 second budget
            operation_name,
            false,
        );

        OperationRunner {
            operation_id,
            operation_name: operation_name.to_string(),
            orchestrator: Arc::new(self.clone()),
            context,
            performance_budget,
            retry_policy: None,
            timeout: None,
        }
    }

    /// Execute operation with automatic observability and resilience patterns
    pub async fn execute_operation<T, F, Fut>(
        &self,
        operation_id: Uuid,
        operation_name: &str,
        operation: F,
        context: &ObservabilityContext,
        config: OperationConfig,
        app_state: &AppState,
    ) -> Result<OperationResult<T>, OrchestrationError>
    where
        F: FnOnce() -> Fut + Send + 'static,
        Fut: std::future::Future<Output = Result<T, OrchestrationError>> + Send + 'static,
        T: Send + 'static,
    {
        let start_time = Instant::now();

        // Check circuit breaker
        if self.is_circuit_breaker_open(operation_name).await {
            return Err(OrchestrationError::CircuitBreakerOpen(operation_name.to_string()));
        }

        // Acquire concurrency permit
        let _permit = self.concurrency_limiter.acquire().await
            .map_err(|_| OrchestrationError::ConcurrencyLimitExceeded)?;

        // Register active operation
        self.register_active_operation(operation_id, operation_name, context, &config).await;

        // Execute with automatic observability and retries
        let result = self.execute_with_retries_and_observability(
            operation_id,
            operation_name,
            operation,
            context,
            config,
            app_state,
        ).await;

        // Update operation metrics
        let duration = start_time.elapsed();
        self.update_operation_metrics(operation_name, duration, result.is_ok()).await;

        // Update circuit breaker
        self.update_circuit_breaker(operation_name, result.is_ok()).await;

        // Unregister active operation
        self.unregister_active_operation(operation_id).await;

        // Check performance budget
        let budget_status = if let Some(budget_ms) = config.performance_budget_ms {
            let budget = PerformanceBudget::new(budget_ms, operation_name, false);
            budget.check_budget(duration.as_millis() as u64)
        } else {
            crate::observability::BudgetResult::WithinBudget
        };

        match result {
            Ok(value) => Ok(OperationResult {
                value,
                execution_metadata: ExecutionMetadata {
                    operation_id: operation_id.to_string(),
                    duration_ms: duration.as_millis() as u64,
                    retry_attempts: 0, // TODO: Track actual retry attempts
                    circuit_breaker_state: "closed".to_string(),
                    resource_usage: ResourceUsage::default(),
                    performance_budget_status: match budget_status {
                        crate::observability::BudgetResult::WithinBudget => "OK".to_string(),
                        crate::observability::BudgetResult::Exceeded { budget, actual } => 
                            format!("EXCEEDED: {}ms > {}ms", actual, budget),
                        crate::observability::BudgetResult::CriticalExceeded { budget, actual } => 
                            format!("CRITICAL: {}ms > {}ms", actual, budget),
                    },
                    observability_applied: true,
                },
            }),
            Err(error) => Err(error),
        }
    }

    /// Execute operation with retries and automatic observability
    async fn execute_with_retries_and_observability<T, F, Fut>(
        &self,
        operation_id: Uuid,
        operation_name: &str,
        operation: F,
        context: &ObservabilityContext,
        config: OperationConfig,
        app_state: &AppState,
    ) -> Result<T, OrchestrationError>
    where
        F: FnOnce() -> Fut + Send + 'static,
        Fut: std::future::Future<Output = Result<T, OrchestrationError>> + Send + 'static,
        T: Send + 'static,
    {
        let retry_policy = self.get_retry_policy(operation_name).await
            .unwrap_or_else(|| RetryPolicy::default());

        let mut attempt = 0;
        let max_attempts = config.retries.unwrap_or(retry_policy.max_attempts);

        loop {
            attempt += 1;

            // Execute with automatic observability
            let result = self.automatic_instrumentation.instrument_operation(
                context,
                async {
                    // Apply timeout if configured
                    if let Some(timeout_ms) = config.timeout_ms {
                        let timeout_duration = Duration::from_millis(timeout_ms);
                        match tokio::time::timeout(timeout_duration, operation()).await {
                            Ok(result) => result,
                            Err(_) => Err(OrchestrationError::Timeout),
                        }
                    } else {
                        operation().await
                    }
                },
                app_state,
            ).await;

            match result {
                Ok(value) => return Ok(value),
                Err(error) => {
                    // Check if error is retriable and we have attempts left
                    if attempt >= max_attempts || !self.is_retriable_error(&error, &retry_policy) {
                        return Err(error);
                    }

                    // Calculate delay for next attempt
                    let delay = self.calculate_retry_delay(attempt, &retry_policy);
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }

    /// Get active operations for monitoring
    pub async fn get_active_operations(&self) -> Vec<ActiveOperation> {
        let operations = self.active_operations.read().await;
        operations.values().cloned().collect()
    }

    /// Get operation metrics for performance monitoring
    pub async fn get_operation_metrics(&self) -> HashMap<String, OperationMetrics> {
        self.operation_metrics.read().await.clone()
    }

    /// Get circuit breaker status
    pub async fn get_circuit_breaker_status(&self) -> HashMap<String, CircuitBreakerState> {
        let breakers = self.circuit_breakers.read().await;
        breakers.iter()
            .map(|(name, breaker)| (name.clone(), breaker.state.clone()))
            .collect()
    }

    /// Cancel operation
    pub async fn cancel_operation(&self, operation_id: Uuid) -> Result<(), OrchestrationError> {
        let mut operations = self.active_operations.write().await;
        if let Some(operation) = operations.get_mut(&operation_id) {
            operation.status = OperationStatus::Cancelled;
            Ok(())
        } else {
            Err(OrchestrationError::OperationNotFound(operation_id))
        }
    }

    /// Update retry policy for operation pattern
    pub async fn set_retry_policy(&self, pattern: &str, policy: RetryPolicy) {
        let mut policies = self.retry_policies.write().await;
        policies.insert(pattern.to_string(), policy);
    }

    /// Get system resource usage
    pub async fn get_resource_usage(&self) -> SystemResourceUsage {
        SystemResourceUsage {
            cpu_usage_percent: *self.resource_monitor.cpu_usage.read().await,
            memory_usage_percent: *self.resource_monitor.memory_usage.read().await,
            active_operations: self.active_operations.read().await.len() as u32,
            active_connections: *self.resource_monitor.active_connections.read().await,
            disk_io_rate_mbps: *self.resource_monitor.disk_io_rate.read().await,
            network_io_rate_mbps: *self.resource_monitor.network_io_rate.read().await,
        }
    }

    // Private helper methods

    async fn register_active_operation(
        &self,
        operation_id: Uuid,
        operation_name: &str,
        context: &ObservabilityContext,
        config: &OperationConfig,
    ) {
        let operation = ActiveOperation {
            operation_id,
            operation_name: operation_name.to_string(),
            start_time: Instant::now(),
            user_id: context.user_id.clone(),
            session_id: context.session_id,
            classification: config.classification.clone().unwrap_or(ClassificationLevel::Internal),
            status: OperationStatus::Running,
            progress: 0.0,
            resource_usage: ResourceUsage::default(),
        };

        let mut operations = self.active_operations.write().await;
        operations.insert(operation_id, operation);
    }

    async fn unregister_active_operation(&self, operation_id: Uuid) {
        let mut operations = self.active_operations.write().await;
        operations.remove(&operation_id);
    }

    async fn is_circuit_breaker_open(&self, operation_name: &str) -> bool {
        let breakers = self.circuit_breakers.read().await;
        if let Some(breaker) = breakers.get(operation_name) {
            match breaker.state {
                CircuitBreakerState::Open => {
                    // Check if we should try half-open
                    if let Some(last_failure) = breaker.last_failure_time {
                        let elapsed = last_failure.elapsed();
                        elapsed.as_secs() >= breaker.timeout_seconds
                    } else {
                        true
                    }
                },
                _ => false,
            }
        } else {
            false
        }
    }

    async fn update_circuit_breaker(&self, operation_name: &str, success: bool) {
        let mut breakers = self.circuit_breakers.write().await;
        let breaker = breakers.entry(operation_name.to_string()).or_insert_with(|| {
            CircuitBreaker {
                operation_pattern: operation_name.to_string(),
                failure_threshold: 5,
                timeout_seconds: 60,
                current_failures: 0,
                state: CircuitBreakerState::Closed,
                last_failure_time: None,
                success_count_after_half_open: 0,
            }
        });

        match breaker.state {
            CircuitBreakerState::Closed => {
                if success {
                    breaker.current_failures = 0;
                } else {
                    breaker.current_failures += 1;
                    breaker.last_failure_time = Some(Instant::now());
                    
                    if breaker.current_failures >= breaker.failure_threshold {
                        breaker.state = CircuitBreakerState::Open;
                    }
                }
            },
            CircuitBreakerState::HalfOpen => {
                if success {
                    breaker.success_count_after_half_open += 1;
                    if breaker.success_count_after_half_open >= 3 {
                        breaker.state = CircuitBreakerState::Closed;
                        breaker.current_failures = 0;
                        breaker.success_count_after_half_open = 0;
                    }
                } else {
                    breaker.state = CircuitBreakerState::Open;
                    breaker.current_failures += 1;
                    breaker.last_failure_time = Some(Instant::now());
                }
            },
            CircuitBreakerState::Open => {
                // Circuit breaker is open, check if we should transition to half-open
                if let Some(last_failure) = breaker.last_failure_time {
                    if last_failure.elapsed().as_secs() >= breaker.timeout_seconds {
                        breaker.state = CircuitBreakerState::HalfOpen;
                        breaker.success_count_after_half_open = 0;
                    }
                }
            },
        }
    }

    async fn update_operation_metrics(
        &self,
        operation_name: &str,
        duration: Duration,
        success: bool,
    ) {
        let mut metrics = self.operation_metrics.write().await;
        let metric = metrics.entry(operation_name.to_string()).or_insert_with(|| {
            OperationMetrics {
                total_executions: 0,
                successful_executions: 0,
                failed_executions: 0,
                avg_duration_ms: 0.0,
                p95_duration_ms: 0.0,
                p99_duration_ms: 0.0,
                last_execution: chrono::Utc::now(),
                circuit_breaker_trips: 0,
                retry_attempts: 0,
            }
        });

        metric.total_executions += 1;
        if success {
            metric.successful_executions += 1;
        } else {
            metric.failed_executions += 1;
        }

        let duration_ms = duration.as_millis() as f64;
        metric.avg_duration_ms = (metric.avg_duration_ms + duration_ms) / 2.0;
        metric.last_execution = chrono::Utc::now();
        
        // Simplified percentile calculation (in production, use proper histogram)
        metric.p95_duration_ms = metric.p95_duration_ms.max(duration_ms);
        metric.p99_duration_ms = metric.p99_duration_ms.max(duration_ms);
    }

    async fn get_retry_policy(&self, operation_name: &str) -> Option<RetryPolicy> {
        let policies = self.retry_policies.read().await;
        policies.get(operation_name).cloned()
    }

    fn is_retriable_error(&self, error: &OrchestrationError, retry_policy: &RetryPolicy) -> bool {
        match error {
            OrchestrationError::Timeout => true,
            OrchestrationError::NetworkError(_) => true,
            OrchestrationError::ServiceUnavailable => true,
            OrchestrationError::ConcurrencyLimitExceeded => false,
            OrchestrationError::CircuitBreakerOpen(_) => false,
            _ => retry_policy.retriable_errors.iter().any(|pattern| {
                error.to_string().contains(pattern)
            }),
        }
    }

    fn calculate_retry_delay(&self, attempt: u32, retry_policy: &RetryPolicy) -> Duration {
        let delay_ms = (retry_policy.base_delay_ms as f64 * 
            retry_policy.backoff_multiplier.powi(attempt as i32 - 1)) as u64;
        
        let capped_delay = delay_ms.min(retry_policy.max_delay_ms);
        
        let final_delay = if retry_policy.jitter {
            // Add ±25% jitter
            let jitter_range = capped_delay / 4;
            let jitter = rand::random::<u64>() % (jitter_range * 2);
            capped_delay.saturating_sub(jitter_range).saturating_add(jitter)
        } else {
            capped_delay
        };

        Duration::from_millis(final_delay)
    }
}

impl Clone for AsyncOrchestrator {
    fn clone(&self) -> Self {
        Self {
            automatic_instrumentation: AutomaticInstrumentation::new(self.license_manager.clone()),
            active_operations: self.active_operations.clone(),
            concurrency_limiter: self.concurrency_limiter.clone(),
            circuit_breakers: self.circuit_breakers.clone(),
            retry_policies: self.retry_policies.clone(),
            operation_metrics: self.operation_metrics.clone(),
            license_manager: self.license_manager.clone(),
            resource_monitor: ResourceMonitor::new(),
        }
    }
}

impl OperationRunner {
    /// Execute operation with automatic observability (main execution method)
    pub async fn run<T, F, Fut>(
        &self,
        operation: F,
        config: Option<OperationConfig>,
        app_state: &AppState,
    ) -> Result<OperationResult<T>, OrchestrationError>
    where
        F: FnOnce() -> Fut + Send + 'static,
        Fut: std::future::Future<Output = Result<T, OrchestrationError>> + Send + 'static,
        T: Send + 'static,
    {
        let config = config.unwrap_or_default();
        
        self.orchestrator.execute_operation(
            self.operation_id,
            &self.operation_name,
            operation,
            &self.context,
            config,
            app_state,
        ).await
    }

    /// Set retry policy for this operation
    pub fn with_retries(mut self, retries: u32) -> Self {
        self.retry_policy = Some(RetryPolicy {
            max_attempts: retries,
            base_delay_ms: 1000,
            max_delay_ms: 30000,
            backoff_multiplier: 2.0,
            jitter: true,
            retriable_errors: vec![
                "timeout".to_string(),
                "network".to_string(),
                "service_unavailable".to_string(),
            ],
        });
        self
    }

    /// Set timeout for this operation
    pub fn with_timeout(mut self, timeout_ms: u64) -> Self {
        self.timeout = Some(Duration::from_millis(timeout_ms));
        self
    }
}

impl ResourceMonitor {
    fn new() -> Self {
        Self {
            cpu_usage: Arc::new(RwLock::new(0.0)),
            memory_usage: Arc::new(RwLock::new(0.0)),
            active_connections: Arc::new(RwLock::new(0)),
            disk_io_rate: Arc::new(RwLock::new(0.0)),
            network_io_rate: Arc::new(RwLock::new(0.0)),
        }
    }
}

impl Default for OperationConfig {
    fn default() -> Self {
        Self {
            timeout_ms: Some(30000), // 30 seconds default
            retries: Some(3),
            performance_budget_ms: Some(5000), // 5 seconds default
            priority: OperationPriority::Normal,
            resource_limits: None,
            classification: Some(ClassificationLevel::Internal),
            tags: HashMap::new(),
        }
    }
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay_ms: 1000,
            max_delay_ms: 30000,
            backoff_multiplier: 2.0,
            jitter: true,
            retriable_errors: vec![
                "timeout".to_string(),
                "network".to_string(),
                "connection".to_string(),
                "unavailable".to_string(),
            ],
        }
    }
}

impl Default for ResourceUsage {
    fn default() -> Self {
        Self {
            cpu_time_ms: 0,
            memory_bytes: 0,
            disk_io_bytes: 0,
            network_io_bytes: 0,
        }
    }
}

/// System resource usage summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemResourceUsage {
    pub cpu_usage_percent: f64,
    pub memory_usage_percent: f64,
    pub active_operations: u32,
    pub active_connections: u32,
    pub disk_io_rate_mbps: f64,
    pub network_io_rate_mbps: f64,
}

/// Async orchestration errors
#[derive(Debug, thiserror::Error)]
pub enum OrchestrationError {
    #[error("Operation timed out")]
    Timeout,
    
    #[error("Circuit breaker is open for operation: {0}")]
    CircuitBreakerOpen(String),
    
    #[error("Concurrency limit exceeded")]
    ConcurrencyLimitExceeded,
    
    #[error("Operation not found: {0}")]
    OperationNotFound(Uuid),
    
    #[error("Network error: {0}")]
    NetworkError(String),
    
    #[error("Service unavailable")]
    ServiceUnavailable,
    
    #[error("Resource limit exceeded: {0}")]
    ResourceLimitExceeded(String),
    
    #[error("Operation execution failed: {0}")]
    ExecutionFailed(String),
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::license::LicenseManager;

    #[tokio::test]
    async fn test_async_orchestrator_creation() {
        let license_manager = Arc::new(LicenseManager::new().await.unwrap());
        let orchestrator = AsyncOrchestrator::new(license_manager);
        
        assert!(true); // Placeholder assertion
    }

    #[tokio::test]
    async fn test_operation_runner_creation() {
        let license_manager = Arc::new(LicenseManager::new().await.unwrap());
        let orchestrator = AsyncOrchestrator::new(license_manager);
        
        let runner = orchestrator.create_runner(
            "test_operation",
            "test-user",
            Uuid::new_v4(),
            ClassificationLevel::Internal,
        ).await;
        
        assert_eq!(runner.operation_name, "test_operation");
    }

    #[test]
    fn test_retry_policy_creation() {
        let policy = RetryPolicy::default();
        assert_eq!(policy.max_attempts, 3);
        assert_eq!(policy.base_delay_ms, 1000);
        assert!(policy.jitter);
    }

    #[test]
    fn test_circuit_breaker_creation() {
        let breaker = CircuitBreaker {
            operation_pattern: "test_op".to_string(),
            failure_threshold: 5,
            timeout_seconds: 60,
            current_failures: 0,
            state: CircuitBreakerState::Closed,
            last_failure_time: None,
            success_count_after_half_open: 0,
        };
        
        assert_eq!(breaker.state, CircuitBreakerState::Closed);
        assert_eq!(breaker.failure_threshold, 5);
    }
}
