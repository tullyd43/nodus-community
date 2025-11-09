// src/storage/mod.rs
// Storage Manager - Community Version (Simplified)
// Multi-backend storage without enterprise security integration

use std::collections::HashMap;
use std::sync::Arc;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::RwLock;
use uuid::Uuid;
use chrono::{DateTime, Utc};

// Sub-modules
#[cfg(target_arch = "wasm32")]
pub mod indexeddb_adapter;

// `sync_mod` and `validation_mod` are declared at `storage/mod.rs` to keep the
// module tree flat (they are siblings of `storage_mod`). Declaring them here
// would attempt to create nested modules (e.g. `storage_mod::sync_mod`) which
// causes the compiler to look for files under a `storage_mod/` subdirectory.
// Keep this file focused on the core storage manager implementation only.

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

/// Simplified storage context for community version
#[derive(Debug, Clone)]
pub struct StorageContext {
    pub user_id: String,
    pub session_id: Uuid,
    pub operation_id: Uuid,
    // Removed enterprise-specific fields:
    // - tenant_id, classification_level, compartments
}

/// Stored entity with metadata (simplified for community)
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
    pub deleted_at: Option<DateTime<Utc>>,
    pub sync_status: SyncStatus,
    // Removed enterprise-specific fields:
    // - classification, compartments, tenant_id
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SyncStatus {
    Local,
    Synced,
    Pending,
    Conflict,
}

/// Storage adapter trait (simplified)
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

/// Main storage manager (simplified for community)
pub struct StorageManager {
    adapters: HashMap<String, Box<dyn StorageAdapter>>,
    primary_backend: String,
    fallback_backends: Vec<String>,
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

impl Default for StorageManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Simple in-memory storage adapter used as the default backend in the
/// community build when platform-specific adapters (IndexedDB) are not
/// available. This provides predictable behavior during desktop/Tauri
/// runs and unit tests.
pub struct MemoryAdapter {
    inner: Arc<RwLock<HashMap<String, StoredEntity>>>,
}

impl MemoryAdapter {
    pub fn new() -> Self {
        Self { inner: Arc::new(RwLock::new(HashMap::new())) }
    }
}

impl Default for MemoryAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl StorageAdapter for MemoryAdapter {
    async fn initialize(&mut self) -> Result<(), StorageError> {
        // Nothing to initialize for in-memory store
        Ok(())
    }

    async fn health_check(&self) -> Result<(), StorageError> {
        Ok(())
    }

    async fn get(&self, key: &str, _ctx: &StorageContext) -> Result<Option<StoredEntity>, StorageError> {
        let map = self.inner.read().await;
        Ok(map.get(key).cloned())
    }

    async fn put(&self, key: &str, entity: StoredEntity, _ctx: &StorageContext) -> Result<(), StorageError> {
        let mut map = self.inner.write().await;
        map.insert(key.to_string(), entity);
        Ok(())
    }

    async fn delete(&self, key: &str, _ctx: &StorageContext) -> Result<(), StorageError> {
        let mut map = self.inner.write().await;
        if let Some(e) = map.get_mut(key) {
            e.deleted_at = Some(Utc::now());
            e.sync_status = SyncStatus::Pending;
        }
        Ok(())
    }

    async fn purge(&self, key: &str, _ctx: &StorageContext) -> Result<(), StorageError> {
        let mut map = self.inner.write().await;
        map.remove(key);
        Ok(())
    }

    async fn query(&self, query: &StorageQuery, _ctx: &StorageContext) -> Result<Vec<StoredEntity>, StorageError> {
        let map = self.inner.read().await;
        let mut results = Vec::new();
        for (_k, v) in map.iter() {
            if let Some(ref et) = query.entity_type {
                if &v.entity_type != et { continue; }
            }
            results.push(v.clone());
        }
        Ok(results)
    }

    async fn get_by_type(&self, entity_type: &str, _ctx: &StorageContext) -> Result<Vec<StoredEntity>, StorageError> {
        let map = self.inner.read().await;
        Ok(map.values().filter(|v| v.entity_type == entity_type).cloned().collect())
    }

    async fn batch_put(&self, entities: Vec<(String, StoredEntity)>, _ctx: &StorageContext) -> Result<(), StorageError> {
        let mut map = self.inner.write().await;
        for (k, v) in entities {
            map.insert(k, v);
        }
        Ok(())
    }

    async fn get_stats(&self) -> Result<StorageStats, StorageError> {
        let map = self.inner.read().await;
        let mut by_type: HashMap<String, u64> = HashMap::new();
        for v in map.values() {
            *by_type.entry(v.entity_type.clone()).or_insert(0) += 1;
        }
        Ok(StorageStats {
            total_entities: map.len() as u64,
            entities_by_type: by_type,
            storage_size_bytes: 0,
            last_sync: None,
            pending_changes: 0,
        })
    }

    async fn export_data(&self, _ctx: &StorageContext) -> Result<Vec<u8>, StorageError> {
        Err(StorageError::BackendError { backend: "memory".to_string(), error: "export not implemented".to_string() })
    }

    async fn import_data(&mut self, _data: &[u8], _ctx: &StorageContext) -> Result<(), StorageError> {
        Err(StorageError::BackendError { backend: "memory".to_string(), error: "import not implemented".to_string() })
    }
}

impl StorageManager {
    /// Create a new storage manager (community version)
    pub fn new() -> Self {
        Self {
            adapters: {
                let mut m = HashMap::new();
                // Register in-memory adapter by default so desktop/Tauri runs
                // work out of the box when IndexedDB is not available.
                // Register in-memory adapter as a fallback
                m.insert("memory".to_string(), Box::new(MemoryAdapter::new()) as Box<dyn StorageAdapter>);

                // Always register a SQLite adapter by default. Use NODUS_SQLITE_DB env
                // to override the path; otherwise default to a local file `./nodus.sqlite`.
                let db_path = std::env::var("NODUS_SQLITE_DB").unwrap_or_else(|_| "./nodus.sqlite".to_string());
                let sqlite_adapter = super::sqlite_adapter::SqliteAdapter::new(db_path);
                m.insert("sqlite".to_string(), Box::new(sqlite_adapter) as Box<dyn StorageAdapter>);

                m
            },
            // Determine primary backend from env or default to memory
            primary_backend: if let Ok(backend) = std::env::var("NODUS_STORAGE_BACKEND") {
                backend
            } else if std::env::var("NODUS_SQLITE_DB").is_ok() {
                "sqlite".to_string()
            } else {
                "memory".to_string()
            },
            fallback_backends: vec!["memory".to_string()],
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
    
    /// Set primary backend
    pub fn set_primary_backend(&mut self, backend: String) -> Result<(), StorageError> {
        if !self.adapters.contains_key(&backend) {
            return Err(StorageError::BackendError {
                backend: backend.clone(),
                error: "Adapter not registered".to_string(),
            });
        }
        self.primary_backend = backend;
        Ok(())
    }
    
    /// Initialize all adapters
    pub async fn initialize(&mut self) -> Result<(), StorageError> {
        for (name, adapter) in &mut self.adapters {
            adapter.initialize().await.map_err(|e| StorageError::BackendError {
                backend: name.clone(),
                error: format!("Initialization failed: {}", e),
            })?;
        }
        Ok(())
    }
    
    /// Get an entity with caching and fallback
    pub async fn get(&self, key: &str, ctx: &StorageContext) -> Result<Option<StoredEntity>, StorageError> {
        self.metrics.operations_total.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        
        // Check cache first
        if let Some(entity) = self.get_from_cache(key).await {
            self.metrics.cache_hits.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            return Ok(Some(entity));
        }
        
        self.metrics.cache_misses.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        
        // Try primary backend first
        match self.get_from_backend(&self.primary_backend, key, ctx).await {
            Ok(Some(entity)) => {
                self.cache_entity(key, &entity).await;
                Ok(Some(entity))
            }
            Ok(None) => Ok(None),
            Err(e) => {
                println!("[StorageManager] Primary backend failed for key {}: {}", key, e);
                
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
    }
    
    /// Put an entity with sync
    pub async fn put(&self, key: &str, mut entity: StoredEntity, ctx: &StorageContext) -> Result<(), StorageError> {
        self.metrics.operations_total.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        
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
        
        println!("[StorageManager] Entity stored: {}", key);
        
        Ok(())
    }
    
    /// Delete an entity
    pub async fn delete(&self, key: &str, ctx: &StorageContext) -> Result<(), StorageError> {
        self.metrics.operations_total.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        
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
    }
    
    /// Query entities
    pub async fn query(&self, query: &StorageQuery, ctx: &StorageContext) -> Result<Vec<StoredEntity>, StorageError> {
        self.metrics.operations_total.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        
        // Query primary backend
        let adapter = self.adapters.get(&self.primary_backend)
            .ok_or_else(|| StorageError::BackendError {
                backend: self.primary_backend.clone(),
                error: "Adapter not found".to_string(),
            })?;
        
        let results = adapter.query(query, ctx).await?;
        
        Ok(results)
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
            primary_backend: "sqlite".to_string(),
            fallback_backends: vec!["memory".to_string()],
            cache_ttl_seconds: 300,
            max_cache_size: 1000,
            enable_compression: false,
            enable_encryption: false, // Simplified for community
        }
    }
}