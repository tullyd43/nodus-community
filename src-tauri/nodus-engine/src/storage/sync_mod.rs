// src/sync/mod.rs
// Sync Manager - Real-time and batch synchronization
// Ports realtime-sync.js, batch-sync.js, and sync-stack.js to Rust

use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::{RwLock, Mutex};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use chrono::{DateTime, Utc, Duration};
use uuid::Uuid;

use crate::storage::{StorageManager, StoredEntity, StorageContext, StorageError};
use crate::security::SecurityManager;
use crate::observability::instrument::instrument;
use crate::policy::policy_snapshot::current_policy;

// Sub-modules (consolidated in this file or not present)
// pub mod conflict_resolution;
// pub mod sync_client;
// pub mod websocket_sync;
// pub mod batch_processor;

/// Sync errors
#[derive(Debug, thiserror::Error)]
pub enum SyncError {
    #[error("Connection failed: {reason}")]
    ConnectionFailed { reason: String },
    
    #[error("Sync conflict: {entity_id} - {reason}")]
    SyncConflict { entity_id: String, reason: String },
    
    #[error("Authentication failed: {reason}")]
    AuthenticationFailed { reason: String },
    
    #[error("Network error: {error}")]
    NetworkError { error: String },
    
    #[error("Serialization error: {error}")]
    SerializationError { error: String },
    
    #[error("Storage error: {error}")]
    StorageError { error: String },
    
    #[error("Timeout: operation took longer than {seconds}s")]
    Timeout { seconds: u64 },
    
    #[error("Server error: {status} - {message}")]
    ServerError { status: u16, message: String },
}

/// Change record for synchronization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeRecord {
    pub id: Uuid,
    pub entity_id: String,
    pub entity_type: String,
    pub operation: ChangeOperation,
    pub data: Option<Value>,
    pub timestamp: DateTime<Utc>,
    pub actor: String,
    pub session_id: Uuid,
    pub tenant_id: Option<String>,
    pub sync_vector: SyncVector,
    pub dependencies: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChangeOperation {
    Create,
    Update,
    Delete,
    Purge,
}

/// Vector clock for conflict resolution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncVector {
    pub client_id: String,
    pub version: u64,
    pub server_version: Option<u64>,
}

/// Sync state tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncState {
    pub last_sync_timestamp: DateTime<Utc>,
    pub last_server_vector: Option<SyncVector>,
    pub pending_changes: u64,
    pub failed_changes: u64,
    pub sync_in_progress: bool,
    pub next_sync_at: Option<DateTime<Utc>>,
    pub sync_interval_seconds: u64,
}

impl Default for SyncState {
    fn default() -> Self {
        Self {
            last_sync_timestamp: Utc::now() - Duration::days(1),
            last_server_vector: None,
            pending_changes: 0,
            failed_changes: 0,
            sync_in_progress: false,
            next_sync_at: None,
            sync_interval_seconds: 300, // 5 minutes default
        }
    }
}

/// Sync result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub changes_pushed: u64,
    pub changes_pulled: u64,
    pub conflicts_resolved: u64,
    pub duration_ms: u64,
    pub success: bool,
    pub error: Option<String>,
}

/// Sync client trait for different transport implementations
#[async_trait]
pub trait SyncClient: Send + Sync {
    /// Connect to the sync server
    async fn connect(&mut self, auth_token: &str) -> Result<(), SyncError>;
    
    /// Disconnect from the sync server
    async fn disconnect(&mut self) -> Result<(), SyncError>;
    
    /// Check if connected
    fn is_connected(&self) -> bool;
    
    /// Push changes to server
    async fn push_changes(&self, changes: Vec<ChangeRecord>) -> Result<PushResult, SyncError>;
    
    /// Pull changes from server
    async fn pull_changes(&self, since: &SyncVector) -> Result<Vec<ChangeRecord>, SyncError>;
    
    /// Get current server vector
    async fn get_server_vector(&self) -> Result<SyncVector, SyncError>;
    
    /// Subscribe to real-time changes
    async fn subscribe_to_changes(&self, callback: Box<dyn Fn(ChangeRecord) + Send + Sync>) -> Result<(), SyncError>;
}

/// Push result from server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushResult {
    pub accepted: Vec<Uuid>,
    pub rejected: Vec<Uuid>,
    pub conflicts: Vec<ConflictRecord>,
    pub server_vector: SyncVector,
}

/// Conflict record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictRecord {
    pub change_id: Uuid,
    pub entity_id: String,
    pub local_change: ChangeRecord,
    pub remote_change: ChangeRecord,
    pub resolution_strategy: ConflictResolutionStrategy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConflictResolutionStrategy {
    LastWriteWins,
    FirstWriteWins,
    Merge,
    Manual,
}

/// Main sync manager (replaces JS sync functionality)
#[derive(Debug)]
pub struct SyncManager {
    storage_manager: Arc<StorageManager>,
    security_manager: Arc<SecurityManager>,
    sync_client: Arc<Mutex<Box<dyn SyncClient>>>,
    sync_state: Arc<RwLock<SyncState>>,
    pending_changes: Arc<Mutex<VecDeque<ChangeRecord>>>,
    conflict_resolver: ConflictResolver,
    change_listeners: Arc<RwLock<Vec<Box<dyn Fn(&ChangeRecord) + Send + Sync>>>>,
    metrics: SyncMetrics,
    client_id: String,
}

#[derive(Debug, Clone)]
struct SyncMetrics {
    pub syncs_total: Arc<std::sync::atomic::AtomicU64>,
    pub syncs_successful: Arc<std::sync::atomic::AtomicU64>,
    pub syncs_failed: Arc<std::sync::atomic::AtomicU64>,
    pub changes_pushed: Arc<std::sync::atomic::AtomicU64>,
    pub changes_pulled: Arc<std::sync::atomic::AtomicU64>,
    pub conflicts_resolved: Arc<std::sync::atomic::AtomicU64>,
}

/// Conflict resolver
#[derive(Debug)]
pub struct ConflictResolver {
    strategies: HashMap<String, ConflictResolutionStrategy>,
    default_strategy: ConflictResolutionStrategy,
}

impl SyncManager {
    /// Create a new sync manager
    pub fn new(
        storage_manager: Arc<StorageManager>,
        security_manager: Arc<SecurityManager>,
        sync_client: Box<dyn SyncClient>,
    ) -> Self {
        let client_id = Uuid::new_v4().to_string();
        
        Self {
            storage_manager,
            security_manager,
            sync_client: Arc::new(Mutex::new(sync_client)),
            sync_state: Arc::new(RwLock::new(SyncState::default())),
            pending_changes: Arc::new(Mutex::new(VecDeque::new())),
            conflict_resolver: ConflictResolver::new(),
            change_listeners: Arc::new(RwLock::new(Vec::new())),
            metrics: SyncMetrics {
                syncs_total: Arc::new(std::sync::atomic::AtomicU64::new(0)),
                syncs_successful: Arc::new(std::sync::atomic::AtomicU64::new(0)),
                syncs_failed: Arc::new(std::sync::atomic::AtomicU64::new(0)),
                changes_pushed: Arc::new(std::sync::atomic::AtomicU64::new(0)),
                changes_pulled: Arc::new(std::sync::atomic::AtomicU64::new(0)),
                conflicts_resolved: Arc::new(std::sync::atomic::AtomicU64::new(0)),
            },
            client_id,
        }
    }
    
    /// Start sync manager
    pub async fn start(&self) -> Result<(), SyncError> {
        instrument("sync_start", || async {
            tracing::info!("Starting sync manager");
            
            // Start background sync loop
            self.start_sync_loop().await;
            
            // Start real-time listener
            self.start_realtime_listener().await?;
            
            Ok(())
        }).await
    }
    
    /// Stop sync manager
    pub async fn stop(&self) -> Result<(), SyncError> {
        instrument("sync_stop", || async {
            tracing::info!("Stopping sync manager");
            
            let mut client = self.sync_client.lock().await;
            client.disconnect().await?;
            
            Ok(())
        }).await
    }
    
    /// Record a local change for sync
    pub async fn record_change(&self, change: ChangeRecord) -> Result<(), SyncError> {
        instrument("sync_record_change", || async {
            tracing::debug!(entity_id = %change.entity_id, operation = ?change.operation, "Recording change");
            
            {
                let mut pending = self.pending_changes.lock().await;
                pending.push_back(change.clone());
            }
            
            {
                let mut state = self.sync_state.write().await;
                state.pending_changes += 1;
            }
            
            // Notify listeners
            let listeners = self.change_listeners.read().await;
            for listener in listeners.iter() {
                listener(&change);
            }
            
            // Trigger immediate sync if policy allows
            let policy = current_policy();
            if policy.database.auto_optimize {
                tokio::spawn({
                    let sync_manager = self.clone();
                    async move {
                        if let Err(e) = sync_manager.sync_now().await {
                            tracing::warn!(error = %e, "Immediate sync failed");
                        }
                    }
                });
            }
            
            Ok(())
        }).await
    }
    
    /// Perform immediate synchronization
    pub async fn sync_now(&self) -> Result<SyncResult, SyncError> {
        instrument("sync_now", || async {
            let start_time = std::time::Instant::now();
            self.metrics.syncs_total.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            
            // Check if sync is already in progress
            {
                let mut state = self.sync_state.write().await;
                if state.sync_in_progress {
                    return Err(SyncError::ConnectionFailed {
                        reason: "Sync already in progress".to_string(),
                    });
                }
                state.sync_in_progress = true;
            }
            
            let result = self.perform_sync().await;
            
            // Update sync state
            {
                let mut state = self.sync_state.write().await;
                state.sync_in_progress = false;
                state.last_sync_timestamp = Utc::now();
                
                if result.is_ok() {
                    state.next_sync_at = Some(Utc::now() + Duration::seconds(state.sync_interval_seconds as i64));
                }
            }
            
            let duration_ms = start_time.elapsed().as_millis() as u64;
            
            match result {
                Ok(mut sync_result) => {
                    sync_result.duration_ms = duration_ms;
                    self.metrics.syncs_successful.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    self.metrics.changes_pushed.fetch_add(sync_result.changes_pushed, std::sync::atomic::Ordering::Relaxed);
                    self.metrics.changes_pulled.fetch_add(sync_result.changes_pulled, std::sync::atomic::Ordering::Relaxed);
                    self.metrics.conflicts_resolved.fetch_add(sync_result.conflicts_resolved, std::sync::atomic::Ordering::Relaxed);
                    
                    tracing::info!(
                        pushed = sync_result.changes_pushed,
                        pulled = sync_result.changes_pulled,
                        conflicts = sync_result.conflicts_resolved,
                        duration_ms = duration_ms,
                        "Sync completed successfully"
                    );
                    
                    Ok(sync_result)
                }
                Err(e) => {
                    self.metrics.syncs_failed.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    
                    tracing::error!(error = %e, duration_ms = duration_ms, "Sync failed");
                    
                    Err(e)
                }
            }
        }).await
    }
    
    /// Get sync status
    pub async fn get_sync_status(&self) -> SyncState {
        self.sync_state.read().await.clone()
    }
    
    /// Add change listener
    pub async fn add_change_listener<F>(&self, listener: F)
    where
        F: Fn(&ChangeRecord) + Send + Sync + 'static,
    {
        let mut listeners = self.change_listeners.write().await;
        listeners.push(Box::new(listener));
    }
    
    /// Force conflict resolution
    pub async fn resolve_conflict(&self, conflict: ConflictRecord, resolution: ConflictResolutionStrategy) -> Result<(), SyncError> {
        instrument("sync_resolve_conflict", || async {
            self.conflict_resolver.resolve_conflict(conflict, resolution, &self.storage_manager).await
        }).await
    }
    
    // Private methods
    
    async fn perform_sync(&self) -> Result<SyncResult, SyncError> {
        let mut changes_pushed = 0;
        let mut changes_pulled = 0;
        let mut conflicts_resolved = 0;
        
        // 1. Push local changes
        let pending_changes = {
            let mut pending = self.pending_changes.lock().await;
            let changes: Vec<ChangeRecord> = pending.drain(..).collect();
            changes
        };
        
        if !pending_changes.is_empty() {
            let client = self.sync_client.lock().await;
            let push_result = client.push_changes(pending_changes.clone()).await?;
            changes_pushed = push_result.accepted.len() as u64;
            
            // Handle conflicts
            for conflict in push_result.conflicts {
                if let Ok(()) = self.conflict_resolver.resolve_conflict(
                    conflict,
                    ConflictResolutionStrategy::LastWriteWins,
                    &self.storage_manager,
                ).await {
                    conflicts_resolved += 1;
                }
            }
            
            // Re-queue rejected changes
            if !push_result.rejected.is_empty() {
                let mut pending = self.pending_changes.lock().await;
                for change in pending_changes {
                    if push_result.rejected.contains(&change.id) {
                        pending.push_back(change);
                    }
                }
            }
        }
        
        // 2. Pull remote changes
        let last_vector = {
            let state = self.sync_state.read().await;
            state.last_server_vector.clone().unwrap_or_else(|| SyncVector {
                client_id: self.client_id.clone(),
                version: 0,
                server_version: Some(0),
            })
        };
        
        let client = self.sync_client.lock().await;
        let remote_changes = client.pull_changes(&last_vector).await?;
        changes_pulled = remote_changes.len() as u64;
        
        // 3. Apply remote changes
        for change in remote_changes {
            if let Err(e) = self.apply_remote_change(change).await {
                tracing::warn!(error = %e, "Failed to apply remote change");
            }
        }
        
        // 4. Update sync state
        if let Ok(server_vector) = client.get_server_vector().await {
            let mut state = self.sync_state.write().await;
            state.last_server_vector = Some(server_vector);
            state.pending_changes = self.pending_changes.lock().await.len() as u64;
        }
        
        Ok(SyncResult {
            changes_pushed,
            changes_pulled,
            conflicts_resolved,
            duration_ms: 0, // Will be set by caller
            success: true,
            error: None,
        })
    }
    
    async fn apply_remote_change(&self, change: ChangeRecord) -> Result<(), SyncError> {
        let ctx = StorageContext {
            user_id: change.actor.clone(),
            session_id: change.session_id,
            tenant_id: change.tenant_id.clone(),
            classification_level: "unclassified".to_string(), // Would get from change metadata
            compartments: vec![],
            operation_id: Uuid::new_v4(),
        };
        
        match change.operation {
            ChangeOperation::Create | ChangeOperation::Update => {
                if let Some(data) = change.data {
                    let entity = StoredEntity {
                        id: change.entity_id.clone(),
                        entity_type: change.entity_type.clone(),
                        data,
                        created_at: change.timestamp,
                        updated_at: change.timestamp,
                        created_by: change.actor.clone(),
                        updated_by: change.actor.clone(),
                        version: change.sync_vector.version,
                        classification: "unclassified".to_string(),
                        compartments: vec![],
                        tenant_id: change.tenant_id.clone(),
                        deleted_at: None,
                        sync_status: super::storage::SyncStatus::Synced,
                    };
                    
                    self.storage_manager.put(&change.entity_id, entity, &ctx).await
                        .map_err(|e| SyncError::StorageError { error: e.to_string() })?;
                }
            }
            ChangeOperation::Delete => {
                self.storage_manager.delete(&change.entity_id, &ctx).await
                    .map_err(|e| SyncError::StorageError { error: e.to_string() })?;
            }
            ChangeOperation::Purge => {
                // Would implement purge operation
            }
        }
        
        Ok(())
    }
    
    async fn start_sync_loop(&self) {
        let sync_manager = Arc::new(self.clone());
        
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
            
            loop {
                interval.tick().await;
                
                let should_sync = {
                    let state = sync_manager.sync_state.read().await;
                    !state.sync_in_progress && 
                    (state.pending_changes > 0 || 
                     state.next_sync_at.map_or(true, |next| Utc::now() >= next))
                };
                
                if should_sync {
                    if let Err(e) = sync_manager.sync_now().await {
                        tracing::warn!(error = %e, "Background sync failed");
                    }
                }
            }
        });
    }
    
    async fn start_realtime_listener(&self) -> Result<(), SyncError> {
        let sync_manager = Arc::new(self.clone());
        
        let client = self.sync_client.lock().await;
        client.subscribe_to_changes(Box::new(move |change| {
            let sync_manager = sync_manager.clone();
            tokio::spawn(async move {
                if let Err(e) = sync_manager.apply_remote_change(change).await {
                    tracing::warn!(error = %e, "Failed to apply real-time change");
                }
            });
        })).await?;
        
        Ok(())
    }
}

impl Clone for SyncManager {
    fn clone(&self) -> Self {
        Self {
            storage_manager: self.storage_manager.clone(),
            security_manager: self.security_manager.clone(),
            sync_client: self.sync_client.clone(),
            sync_state: self.sync_state.clone(),
            pending_changes: self.pending_changes.clone(),
            conflict_resolver: self.conflict_resolver.clone(),
            change_listeners: self.change_listeners.clone(),
            metrics: self.metrics.clone(),
            client_id: self.client_id.clone(),
        }
    }
}

impl ConflictResolver {
    pub fn new() -> Self {
        Self {
            strategies: HashMap::new(),
            default_strategy: ConflictResolutionStrategy::LastWriteWins,
        }
    }
    
    pub async fn resolve_conflict(
        &self,
        conflict: ConflictRecord,
        strategy: ConflictResolutionStrategy,
        storage_manager: &StorageManager,
    ) -> Result<(), SyncError> {
        match strategy {
            ConflictResolutionStrategy::LastWriteWins => {
                self.resolve_last_write_wins(conflict, storage_manager).await
            }
            ConflictResolutionStrategy::FirstWriteWins => {
                self.resolve_first_write_wins(conflict, storage_manager).await
            }
            ConflictResolutionStrategy::Merge => {
                self.resolve_merge(conflict, storage_manager).await
            }
            ConflictResolutionStrategy::Manual => {
                // Queue for manual resolution
                Err(SyncError::SyncConflict {
                    entity_id: conflict.entity_id,
                    reason: "Manual resolution required".to_string(),
                })
            }
        }
    }
    
    async fn resolve_last_write_wins(
        &self,
        conflict: ConflictRecord,
        storage_manager: &StorageManager,
    ) -> Result<(), SyncError> {
        let winning_change = if conflict.remote_change.timestamp > conflict.local_change.timestamp {
            conflict.remote_change
        } else {
            conflict.local_change
        };
        
        // Apply the winning change
        // Implementation would depend on the specific change type
        Ok(())
    }
    
    async fn resolve_first_write_wins(
        &self,
        conflict: ConflictRecord,
        storage_manager: &StorageManager,
    ) -> Result<(), SyncError> {
        let winning_change = if conflict.local_change.timestamp < conflict.remote_change.timestamp {
            conflict.local_change
        } else {
            conflict.remote_change
        };
        
        // Apply the winning change
        Ok(())
    }
    
    async fn resolve_merge(
        &self,
        conflict: ConflictRecord,
        storage_manager: &StorageManager,
    ) -> Result<(), SyncError> {
        // Implement field-level merging
        // This would be specific to your data models
        Err(SyncError::SyncConflict {
            entity_id: conflict.entity_id,
            reason: "Merge resolution not implemented".to_string(),
        })
    }
}

impl Clone for ConflictResolver {
    fn clone(&self) -> Self {
        Self {
            strategies: self.strategies.clone(),
            default_strategy: self.default_strategy.clone(),
        }
    }
}

/// Utility functions for change creation
impl ChangeRecord {
    pub fn new_create(entity_id: String, entity_type: String, data: Value, actor: String, session_id: Uuid) -> Self {
        Self {
            id: Uuid::new_v4(),
            entity_id,
            entity_type,
            operation: ChangeOperation::Create,
            data: Some(data),
            timestamp: Utc::now(),
            actor,
            session_id,
            tenant_id: None,
            sync_vector: SyncVector {
                client_id: Uuid::new_v4().to_string(),
                version: 1,
                server_version: None,
            },
            dependencies: vec![],
        }
    }
    
    pub fn new_update(entity_id: String, entity_type: String, data: Value, actor: String, session_id: Uuid) -> Self {
        Self {
            id: Uuid::new_v4(),
            entity_id,
            entity_type,
            operation: ChangeOperation::Update,
            data: Some(data),
            timestamp: Utc::now(),
            actor,
            session_id,
            tenant_id: None,
            sync_vector: SyncVector {
                client_id: Uuid::new_v4().to_string(),
                version: 1,
                server_version: None,
            },
            dependencies: vec![],
        }
    }
    
    pub fn new_delete(entity_id: String, entity_type: String, actor: String, session_id: Uuid) -> Self {
        Self {
            id: Uuid::new_v4(),
            entity_id,
            entity_type,
            operation: ChangeOperation::Delete,
            data: None,
            timestamp: Utc::now(),
            actor,
            session_id,
            tenant_id: None,
            sync_vector: SyncVector {
                client_id: Uuid::new_v4().to_string(),
                version: 1,
                server_version: None,
            },
            dependencies: vec![],
        }
    }
}
