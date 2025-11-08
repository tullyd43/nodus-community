// src/storage/mod.rs
// Storage Manager - Multi-backend storage with security integration
// Ports ModernIndexedDB.js, StorageLoader.js, and indexeddb-adapter.js to Rust

use std::collections::HashMap;
use std::sync::Arc;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::RwLock;
use uuid::Uuid;
use chrono::{DateTime, Utc};

use crate::security::{SecurityManager, SecurityError};
use crate::observability::instrument::instrument;
use crate::policy::policy_snapshot::current_policy;

// Sub-modules
// The IndexedDB adapter uses `web-sys`/`wasm-bindgen` types which are
// not Send/Sync and will fail to compile for native targets. Gate the
// module so it's only compiled for wasm32 targets; native builds should
// use other adapters (sqlite/memory/etc.). This avoids many platform
// specific compilation errors when running the desktop build.
#[cfg(target_arch = "wasm32")]
pub mod indexeddb_adapter;
// Storage adapters consolidated or not present in this layout
// pub mod sqlite_adapter;
// pub mod postgres_adapter;
// pub mod memory_adapter;
// pub mod storage_query;
// pub mod migrations;

/// Storage errors with detailed context
#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("Not found: {key}")]
    NotFound { key: String },
    
    #[error("Access denied: {reason}")]
    AccessDenied { reason: String },
    
    #[error("Validation failed: {error}")]
    ValidationFailed { error: String },
    
    #[error("Backend error: {backend} - {error}")]
    BackendError { backend: String, error: String },
    
    #[error("Serialization error: {error}")]
    SerializationError { error: String },
    
    #[error("Migration failed: {version} - {error}")]
    MigrationFailed { version: u32, error: String },
    
    #[error("Sync conflict: {key}")]
    SyncConflict { key: String },
    
    #[error("Database unavailable: {reason}")]
    DatabaseUnavailable { reason: String },
}

/// Storage query interface (replaces JS query objects)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageQuery {
    pub entity_type: Option<String>,
    pub filters: HashMap<String, Value>,
    pub sort: Option<Vec<SortCriteria>>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    pub include_deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SortCriteria {
    pub field: String,
    pub direction: SortDirection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SortDirection {
    Asc,
    Desc,
}

/// Storage context for operations (replaces JS context objects)
#[derive(Debug, Clone)]
pub struct StorageContext {
    pub user_id: String,
    pub session_id: Uuid,
    pub tenant_id: Option<String>,
    pub classification_level: String,
    pub compartments: Vec<String>,
    pub operation_id: Uuid,
}

/// Stored entity with metadata (replaces JS entity objects)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredEntity {
    pub id: String,
    pub entity_type: String,
    pub data: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub created_by: String,
    pub updated_by: String,
    pub version: u64,
    pub classification: String,
    pub compartments: Vec<String>,
    pub tenant_id: Option<String>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub sync_status: SyncStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SyncStatus {
    Local,
    Synced,
    Pending,
    Conflict,
}

/// Storage adapter trait (replaces JS storage adapter interface)
#[async_trait]
pub trait StorageAdapter: Send + Sync {
    /// Initialize the storage backend
    async fn initialize(&mut self) -> Result<(), StorageError>;
    
    /// Check if the backend is healthy
    async fn health_check(&self) -> Result<(), StorageError>;
    
    /// Get a single entity by key
    async fn get(&self, key: &str, ctx: &StorageContext) -> Result<Option<StoredEntity>, StorageError>;
    
    /// Put/update an entity
    async fn put(&self, key: &str, entity: StoredEntity, ctx: &StorageContext) -> Result<(), StorageError>;
    
    /// Delete an entity (soft delete)
    async fn delete(&self, key: &str, ctx: &StorageContext) -> Result<(), StorageError>;
    
    /// Hard delete an entity
    async fn purge(&self, key: &str, ctx: &StorageContext) -> Result<(), StorageError>;
    
    /// Query entities with filters
    async fn query(&self, query: &StorageQuery, ctx: &StorageContext) -> Result<Vec<StoredEntity>, StorageError>;
    
    /// Get entities by type
    async fn get_by_type(&self, entity_type: &str, ctx: &StorageContext) -> Result<Vec<StoredEntity>, StorageError>;
    
    /// Batch operations
    async fn batch_put(&self, entities: Vec<(String, StoredEntity)>, ctx: &StorageContext) -> Result<(), StorageError>;
    
    /// Get storage statistics
    async fn get_stats(&self) -> Result<StorageStats, StorageError>;
    
    /// Run migrations
    async fn migrate(&mut self, target_version: u32) -> Result<(), StorageError>;
    
    /// Export data for backup
    async fn export_data(&self, ctx: &StorageContext) -> Result<Vec<u8>, StorageError>;
    
    /// Import data from backup
    async fn import_data(&mut self, data: &[u8], ctx: &StorageContext) -> Result<(), StorageError>;
}

/// Storage statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageStats {
    pub total_entities: u64,
    pub entities_by_type: HashMap<String, u64>,
    pub storage_size_bytes: u64,
    pub last_sync: Option<DateTime<Utc>>,
    pub pending_changes: u64,
}

/// Main storage manager (replaces HybridStateManager storage functionality)
pub struct StorageManager {
    adapters: HashMap<String, Box<dyn StorageAdapter>>,
    primary_backend: String,
    fallback_backends: Vec<String>,
    security_manager: Arc<SecurityManager>,
    cache: Arc<RwLock<HashMap<String, CachedEntity>>>,
    metrics: StorageMetrics,
}

impl std::fmt::Debug for StorageManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("StorageManager")
            .field("primary_backend", &self.primary_backend)
            .field("fallback_backends", &self.fallback_backends)
            .field("adapters_count", &self.adapters.len())
            .finish()
    }
}

#[derive(Debug, Clone)]
struct CachedEntity {
    entity: StoredEntity,
    cached_at: DateTime<Utc>,
    ttl_seconds: u64,
}

#[derive(Debug, Clone)]
struct StorageMetrics {
    pub cache_hits: Arc<std::sync::atomic::AtomicU64>,
    pub cache_misses: Arc<std::sync::atomic::AtomicU64>,
    pub operations_total: Arc<std::sync::atomic::AtomicU64>,
    pub errors_total: Arc<std::sync::atomic::AtomicU64>,
}

impl StorageManager {
    /// Create a new storage manager
    pub fn new(security_manager: Arc<SecurityManager>) -> Self {
        Self {
            adapters: HashMap::new(),
            primary_backend: "indexeddb".to_string(),
            fallback_backends: vec!["memory".to_string()],
            security_manager,
            cache: Arc::new(RwLock::new(HashMap::new())),
            metrics: StorageMetrics {
                cache_hits: Arc::new(std::sync::atomic::AtomicU64::new(0)),
                cache_misses: Arc::new(std::sync::atomic::AtomicU64::new(0)),
                operations_total: Arc::new(std::sync::atomic::AtomicU64::new(0)),
                errors_total: Arc::new(std::sync::atomic::AtomicU64::new(0)),
            },
        }
    }
    
    /// Register a storage adapter
    pub fn register_adapter(&mut self, name: String, adapter: Box<dyn StorageAdapter>) {
        self.adapters.insert(name, adapter);
    }
    
    /// Initialize all adapters
    pub async fn initialize(&mut self) -> Result<(), StorageError> {
        instrument("storage_initialize", || async {
            for (name, adapter) in self.adapters.iter_mut() {
                adapter.initialize().await.map_err(|e| {
                    StorageError::BackendError {
                        backend: name.clone(),
                        error: e.to_string(),
                    }
                })?;
                
                tracing::info!(backend = %name, "Storage adapter initialized");
            }
            Ok(())
        }).await
    }
    
    /// Get an entity with caching and security
    pub async fn get(&self, key: &str, ctx: &StorageContext) -> Result<Option<StoredEntity>, StorageError> {
        instrument("storage_get", || async {
            self.metrics.operations_total.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            
            // Security check
            self.authorize_read(ctx, key).await?;
            
            // Check cache first
            if let Some(cached) = self.get_from_cache(key).await {
                self.metrics.cache_hits.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                return Ok(Some(cached));
            }
            
            self.metrics.cache_misses.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            
            // Try primary backend first
            let result = self.get_from_backend(&self.primary_backend, key, ctx).await;
            
            match result {
                Ok(Some(entity)) => {
                    // Cache the result
                    self.cache_entity(key, &entity).await;
                    Ok(Some(entity))
                }
                Ok(None) => Ok(None),
                Err(e) => {
                    // Try fallback backends
                    for backend in &self.fallback_backends {
                        if let Ok(Some(entity)) = self.get_from_backend(backend, key, ctx).await {
                            self.cache_entity(key, &entity).await;
                            return Ok(Some(entity));
                        }
                    }
                    
                    self.metrics.errors_total.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    Err(e)
                }
            }
        }).await
    }
    
    /// Put an entity with security and sync
    pub async fn put(&self, key: &str, mut entity: StoredEntity, ctx: &StorageContext) -> Result<(), StorageError> {
        instrument("storage_put", || async {
            self.metrics.operations_total.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            
            // Security check
            self.authorize_write(ctx, key, &entity).await?;
            
            // Update metadata
            entity.updated_at = Utc::now();
            entity.updated_by = ctx.user_id.clone();
            entity.version += 1;
            entity.sync_status = SyncStatus::Pending;
            
            // Store in primary backend
            let adapter = self.adapters.get(&self.primary_backend)
                .ok_or_else(|| StorageError::BackendError {
                    backend: self.primary_backend.clone(),
                    error: "Adapter not found".to_string(),
                })?;
            
            adapter.put(key, entity.clone(), ctx).await?;
            
            // Update cache
            self.cache_entity(key, &entity).await;
            
            // Trigger sync if enabled
            let policy = current_policy();
            if policy.database.auto_optimize {
                // Would trigger sync here
                tracing::debug!(key = %key, "Entity queued for sync");
            }
            
            Ok(())
        }).await
    }
    
    /// Delete an entity
    pub async fn delete(&self, key: &str, ctx: &StorageContext) -> Result<(), StorageError> {
        instrument("storage_delete", || async {
            self.metrics.operations_total.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            
            // Security check
            self.authorize_delete(ctx, key).await?;
            
            // Delete from primary backend
            let adapter = self.adapters.get(&self.primary_backend)
                .ok_or_else(|| StorageError::BackendError {
                    backend: self.primary_backend.clone(),
                    error: "Adapter not found".to_string(),
                })?;
            
            adapter.delete(key, ctx).await?;
            
            // Remove from cache
            self.evict_from_cache(key).await;
            
            Ok(())
        }).await
    }
    
    /// Query entities with security filtering
    pub async fn query(&self, query: &StorageQuery, ctx: &StorageContext) -> Result<Vec<StoredEntity>, StorageError> {
        instrument("storage_query", || async {
            self.metrics.operations_total.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            
            // Security check
            self.authorize_query(ctx, query).await?;
            
            // Query primary backend
            let adapter = self.adapters.get(&self.primary_backend)
                .ok_or_else(|| StorageError::BackendError {
                    backend: self.primary_backend.clone(),
                    error: "Adapter not found".to_string(),
                })?;
            
            let mut results = adapter.query(query, ctx).await?;
            
            // Apply security filtering
            results = self.filter_results_by_security(results, ctx).await?;
            
            Ok(results)
        }).await
    }
    
    /// Get storage statistics
    pub async fn get_stats(&self) -> Result<StorageStats, StorageError> {
        let adapter = self.adapters.get(&self.primary_backend)
            .ok_or_else(|| StorageError::BackendError {
                backend: self.primary_backend.clone(),
                error: "Adapter not found".to_string(),
            })?;
        
        adapter.get_stats().await
    }
    
    /// Health check all backends
    pub async fn health_check(&self) -> Result<HashMap<String, bool>, StorageError> {
        let mut results = HashMap::new();
        
        for (name, adapter) in &self.adapters {
            let healthy = adapter.health_check().await.is_ok();
            results.insert(name.clone(), healthy);
        }
        
        Ok(results)
    }
    
    // Private helper methods
    
    async fn get_from_backend(&self, backend: &str, key: &str, ctx: &StorageContext) -> Result<Option<StoredEntity>, StorageError> {
        let adapter = self.adapters.get(backend)
            .ok_or_else(|| StorageError::BackendError {
                backend: backend.to_string(),
                error: "Adapter not found".to_string(),
            })?;
        
        adapter.get(key, ctx).await
    }
    
    async fn get_from_cache(&self, key: &str) -> Option<StoredEntity> {
        let cache = self.cache.read().await;
        if let Some(cached) = cache.get(key) {
            // Check TTL
            let now = Utc::now();
            let age_seconds = (now - cached.cached_at).num_seconds() as u64;
            
            if age_seconds < cached.ttl_seconds {
                return Some(cached.entity.clone());
            }
        }
        None
    }
    
    async fn cache_entity(&self, key: &str, entity: &StoredEntity) {
        let mut cache = self.cache.write().await;
        cache.insert(key.to_string(), CachedEntity {
            entity: entity.clone(),
            cached_at: Utc::now(),
            ttl_seconds: 300, // 5 minutes default TTL
        });
        
        // Evict old entries if cache is too large
        if cache.len() > 1000 {
            // Clone the entries (keys + values) so we don't hold references into the map
            // while mutating it below. This avoids the borrow-checker error when
            // attempting to remove while iterating.
            let mut entries: Vec<(String, CachedEntity)> = cache.iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            entries.sort_by_key(|(_, v)| v.cached_at);

            // Remove oldest 20%
            let to_remove = entries.len() / 5;
            for (key, _) in entries.into_iter().take(to_remove) {
                cache.remove(&key);
            }
        }
    }
    
    async fn evict_from_cache(&self, key: &str) {
        let mut cache = self.cache.write().await;
        cache.remove(key);
    }
    
    async fn authorize_read(&self, ctx: &StorageContext, key: &str) -> Result<(), StorageError> {
        // Implement security authorization
        // This would integrate with your SecurityManager
        Ok(())
    }
    
    async fn authorize_write(&self, ctx: &StorageContext, key: &str, entity: &StoredEntity) -> Result<(), StorageError> {
        // Implement security authorization
        Ok(())
    }
    
    async fn authorize_delete(&self, ctx: &StorageContext, key: &str) -> Result<(), StorageError> {
        // Implement security authorization
        Ok(())
    }
    
    async fn authorize_query(&self, ctx: &StorageContext, query: &StorageQuery) -> Result<(), StorageError> {
        // Implement security authorization
        Ok(())
    }
    
    async fn filter_results_by_security(&self, results: Vec<StoredEntity>, ctx: &StorageContext) -> Result<Vec<StoredEntity>, StorageError> {
        // Filter results based on security clearance
        Ok(results) // Simplified for now
    }
}

/// Storage configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageConfig {
    pub primary_backend: String,
    pub fallback_backends: Vec<String>,
    pub cache_ttl_seconds: u64,
    pub max_cache_size: usize,
    pub enable_compression: bool,
    pub enable_encryption: bool,
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            primary_backend: "indexeddb".to_string(),
            fallback_backends: vec!["memory".to_string()],
            cache_ttl_seconds: 300,
            max_cache_size: 1000,
            enable_compression: false,
            enable_encryption: true,
        }
    }
}
