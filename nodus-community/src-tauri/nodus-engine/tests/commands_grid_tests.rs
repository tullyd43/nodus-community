use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;
use serde_json::json;

use nodus::commands_grid::{self};
use nodus::state_mod::{self, AppConfig};
use nodus::storage::{StorageAdapter, StorageContext, StoredEntity, StorageError, StorageQuery, StorageStats};
use nodus::license_mod::LicenseManager;
use nodus::universal_plugin_system::UniversalPluginSystem;
use nodus::action_dispatcher::ActionDispatcher;
use nodus::async_orchestrator::AsyncOrchestrator;

use tokio::sync::RwLock as TokioRwLock;

// Simple in-memory storage adapter for tests
struct InMemoryAdapter {
    store: Arc<TokioRwLock<HashMap<String, StoredEntity>>>,
}

impl InMemoryAdapter {
    fn new() -> Self {
        Self { store: Arc::new(TokioRwLock::new(HashMap::new())) }
    }
}

#[async_trait::async_trait]
impl StorageAdapter for InMemoryAdapter {
    async fn initialize(&mut self) -> Result<(), StorageError> { Ok(()) }
    async fn health_check(&self) -> Result<(), StorageError> { Ok(()) }

    async fn get(&self, key: &str, _ctx: &StorageContext) -> Result<Option<StoredEntity>, StorageError> {
        let store = self.store.read().await;
        Ok(store.get(key).cloned())
    }

    async fn put(&self, key: &str, entity: StoredEntity, _ctx: &StorageContext) -> Result<(), StorageError> {
        let mut store = self.store.write().await;
        store.insert(key.to_string(), entity);
        Ok(())
    }

    async fn delete(&self, key: &str, _ctx: &StorageContext) -> Result<(), StorageError> {
        let mut store = self.store.write().await;
        store.remove(key);
        Ok(())
    }

    async fn purge(&self, key: &str, _ctx: &StorageContext) -> Result<(), StorageError> { self.delete(key, _ctx).await }

    async fn query(&self, query: &StorageQuery, _ctx: &StorageContext) -> Result<Vec<StoredEntity>, StorageError> {
        let store = self.store.read().await;
        let mut out = Vec::new();
        for (_k, v) in store.iter() {
            if let Some(ref et) = query.entity_type {
                if &v.entity_type == et { out.push(v.clone()); }
            } else {
                out.push(v.clone());
            }
        }
        Ok(out)
    }

    async fn get_by_type(&self, entity_type: &str, _ctx: &StorageContext) -> Result<Vec<StoredEntity>, StorageError> {
        let store = self.store.read().await;
        Ok(store.values().filter(|e| e.entity_type == entity_type).cloned().collect())
    }

    async fn batch_put(&self, entities: Vec<(String, StoredEntity)>, _ctx: &StorageContext) -> Result<(), StorageError> {
        let mut store = self.store.write().await;
        for (k, v) in entities { store.insert(k, v); }
        Ok(())
    }

    async fn get_stats(&self) -> Result<StorageStats, StorageError> {
        let store = self.store.read().await;
        let total = store.len() as u64;
        let mut by_type: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
        let mut size: u64 = 0;
        for (_k, v) in store.iter() {
            *by_type.entry(v.entity_type.clone()).or_insert(0) += 1;
            if let Ok(bytes) = serde_json::to_vec(&v.data) { size += bytes.len() as u64; }
        }
        Ok(StorageStats { total_entities: total, entities_by_type: by_type, storage_size_bytes: size, last_sync: None, pending_changes: 0 })
    }

    async fn export_data(&self, _ctx: &StorageContext) -> Result<Vec<u8>, StorageError> {
        let store = self.store.read().await;
        let vec: Vec<_> = store.values().cloned().collect();
        serde_json::to_vec(&vec).map_err(|e| StorageError::SerializationError { error: e.to_string() })
    }

    async fn import_data(&mut self, data: &[u8], _ctx: &StorageContext) -> Result<(), StorageError> {
        let entities: Vec<StoredEntity> = serde_json::from_slice(data).map_err(|e| StorageError::SerializationError { error: e.to_string() })?;
        let mut store = self.store.write().await;
        for ent in entities { store.insert(ent.id.clone(), ent); }
        Ok(())
    }
}

async fn build_test_state() -> Arc<RwLock<state_mod::AppState>> {
    // License manager and plugin system
    let license_manager = LicenseManager::new().await.unwrap();
    let license_tier = license_manager.get_tier().await;
    let plugin_access_mode = license_manager.get_plugin_access_mode().await;
    let plugin_system = UniversalPluginSystem::new(license_tier, plugin_access_mode).await;

    // Storage manager with in-memory adapter
    let mut storage = nodus::storage::StorageManager::new();
    let adapter = InMemoryAdapter::new();
    storage.register_adapter("memory".to_string(), Box::new(adapter));
    let _ = storage.set_primary_backend("memory".to_string());

    // Action dispatcher and orchestrator
    let action_dispatcher = ActionDispatcher::new().await.unwrap();
    let async_orchestrator = AsyncOrchestrator::new().await.unwrap();

    // App config
    let config = AppConfig { app_name: "nodus-test".to_string(), version: "0.1".to_string(), license_tier: "Community".to_string(), plugin_access_mode: "UnsignedAllowed".to_string() };

    let app_state = state_mod::AppState {
        license_manager: Arc::new(license_manager),
        initialized: false,
        config,
        sessions: Arc::new(RwLock::new(HashMap::new())),
        plugin_system: Arc::new(plugin_system),
        storage: Arc::new(storage),
        action_dispatcher: Arc::new(action_dispatcher),
        async_orchestrator: Arc::new(async_orchestrator),
        active_async_operations: Arc::new(RwLock::new(HashMap::new())),
        active_async_operation_starts: Arc::new(RwLock::new(HashMap::new())),
        completed_operations_count: Arc::new(RwLock::new(0)),
    };

    Arc::new(RwLock::new(app_state))
}

#[tokio::test]
async fn test_add_block_persists_and_returns_id() {
    let state = build_test_state().await;

    // Prepare payload
    let payload = json!({
        "blockConfig": {
            "type": "html",
            "title": "Test Block",
            "x": 0,
            "y": 0,
            "w": 1,
            "h": 1,
            "config": {},
        },
        "containerId": "test_grid"
    });

    // Dispatch add action
    let res = commands_grid::dispatch_action("grid.block.add".to_string(), payload.clone(), state.clone()).await;
    assert!(res.is_ok());
    let v = res.unwrap();
    let block_id = v.get("blockId").and_then(|b| b.as_str()).expect("blockId missing");

    // Verify storage contains the block
    let config = commands_grid::get_grid_config(state.clone(), "test_grid".to_string()).await.unwrap();
    assert_eq!(config.blocks.len(), 1);
    assert_eq!(config.blocks[0].id, block_id.to_string());
    assert_eq!(config.blocks[0].title.as_deref(), Some("Test Block"));
}

#[tokio::test]
async fn test_get_grid_config_returns_default_when_missing() {
    let state = build_test_state().await;
    let cfg = commands_grid::get_grid_config(state.clone(), "nonexistent_grid".to_string()).await.unwrap();
    assert_eq!(cfg.config_id, "nonexistent_grid".to_string());
    assert_eq!(cfg.blocks.len(), 0);
}
