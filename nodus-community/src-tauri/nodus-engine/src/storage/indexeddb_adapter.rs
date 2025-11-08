// src/storage/indexeddb_adapter.rs
// IndexedDB Adapter - Browser storage implementation (Community Version)
// Simplified version without enterprise observability

use std::collections::HashMap;
use async_trait::async_trait;
use serde_json::Value;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::*;
use chrono::{DateTime, Utc};

use super::{StorageAdapter, StorageError, StoredEntity, StorageContext, StorageQuery, StorageStats};

/// IndexedDB adapter with migration support (Community Version)
#[derive(Debug)]
pub struct IndexedDBAdapter {
    db_name: String,
    db_version: u32,
    db: Option<IdbDatabase>,
    stores: HashMap<String, StoreConfig>,
    migrations: Vec<Migration>,
    ready: bool,
}

/// Store configuration
#[derive(Debug, Clone)]
pub struct StoreConfig {
    pub key_path: String,
    pub auto_increment: bool,
    pub indexes: Vec<IndexConfig>,
}

/// Index configuration  
#[derive(Debug, Clone)]
pub struct IndexConfig {
    pub name: String,
    pub key_path: String,
    pub unique: bool,
    pub multi_entry: bool,
}

/// Migration definition (simplified for community)
#[derive(Debug, Clone)]
pub struct Migration {
    pub version: u32,
    pub description: String,
    // Simplified without function pointer for community version
}

impl IndexedDBAdapter {
    /// Create new IndexedDB adapter
    pub fn new(db_name: &str) -> Self {
        Self {
            db_name: db_name.to_string(),
            db_version: 1,
            db: None,
            stores: HashMap::new(),
            migrations: Vec::new(),
            ready: false,
        }
    }
    
    /// Add store configuration
    pub fn add_store(&mut self, name: &str, config: StoreConfig) {
        self.stores.insert(name.to_string(), config);
    }
    
    /// Add migration
    pub fn add_migration(&mut self, migration: Migration) {
        self.migrations.push(migration);
        self.db_version = migration.version;
    }
    
    /// Check if adapter is ready
    pub fn is_ready(&self) -> bool {
        self.ready
    }
}

#[async_trait]
impl StorageAdapter for IndexedDBAdapter {
    async fn initialize(&mut self) -> Result<(), StorageError> {
        println!("[IndexedDBAdapter] Initializing IndexedDB adapter: {}", self.db_name);
        
        let window = web_sys::window()
            .ok_or_else(|| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: "No window object available".to_string(),
            })?;
        
        let idb = window.indexed_db()
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("IndexedDB not supported: {:?}", e),
            })?
            .ok_or_else(|| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: "IndexedDB not available".to_string(),
            })?;
        
        // Open database
        let open_request = idb.open_with_u32(&self.db_name, self.db_version)
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Failed to open database: {:?}", e),
            })?;
        
        // Set up event handlers (simplified for community)
        let db_name = self.db_name.clone();
        let onupgradeneeded = Closure::wrap(Box::new(move |event: &Event| {
            println!("[IndexedDBAdapter] Database upgrade needed for: {}", db_name);
            // Simplified upgrade handling for community version
        }) as Box<dyn Fn(&Event)>);
        
        open_request.set_onupgradeneeded(Some(onupgradeneeded.as_ref().unchecked_ref()));
        
        // Wait for database to open
        let result = JsFuture::from(open_request).await
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Database open failed: {:?}", e),
            })?;
        
        self.db = Some(result.unchecked_into::<IdbDatabase>());
        self.ready = true;
        
        println!("[IndexedDBAdapter] IndexedDB adapter initialized successfully");
        
        // Prevent closure from being dropped
        onupgradeneeded.forget();
        
        Ok(())
    }
    
    async fn health_check(&self) -> Result<(), StorageError> {
        if self.ready && self.db.is_some() {
            Ok(())
        } else {
            Err(StorageError::DatabaseUnavailable {
                reason: "IndexedDB not initialized or not available".to_string(),
            })
        }
    }
    
    async fn get(&self, key: &str, _ctx: &StorageContext) -> Result<Option<StoredEntity>, StorageError> {
        println!("[IndexedDBAdapter] Getting entity: {}", key);
        
        let db = self.db.as_ref()
            .ok_or_else(|| StorageError::DatabaseUnavailable {
                reason: "Database not initialized".to_string(),
            })?;
        
        // Simplified get operation for community version
        let transaction = db.transaction_with_str_and_mode("entities", IdbTransactionMode::Readonly)
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Transaction failed: {:?}", e),
            })?;
        
        let store = transaction.object_store("entities")
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Object store access failed: {:?}", e),
            })?;
        
        let request = store.get(&JsValue::from_str(key))
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Get request failed: {:?}", e),
            })?;
        
        let result = JsFuture::from(request).await
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Get operation failed: {:?}", e),
            })?;
        
        if result.is_undefined() || result.is_null() {
            return Ok(None);
        }
        
        // Parse result (simplified for community)
        let entity_data = js_sys::JSON::stringify(&result)
            .map_err(|e| StorageError::SerializationError {
                error: format!("Failed to stringify result: {:?}", e),
            })?;
        
        let entity_str = entity_data.as_string()
            .ok_or_else(|| StorageError::SerializationError {
                error: "Failed to convert result to string".to_string(),
            })?;
        
        let entity: StoredEntity = serde_json::from_str(&entity_str)
            .map_err(|e| StorageError::SerializationError {
                error: format!("Failed to deserialize entity: {}", e),
            })?;
        
        Ok(Some(entity))
    }
    
    async fn put(&self, key: &str, entity: StoredEntity, _ctx: &StorageContext) -> Result<(), StorageError> {
        println!("[IndexedDBAdapter] Putting entity: {}", key);
        
        let db = self.db.as_ref()
            .ok_or_else(|| StorageError::DatabaseUnavailable {
                reason: "Database not initialized".to_string(),
            })?;
        
        // Serialize entity
        let entity_json = serde_json::to_string(&entity)
            .map_err(|e| StorageError::SerializationError {
                error: format!("Failed to serialize entity: {}", e),
            })?;
        
        let entity_value = js_sys::JSON::parse(&entity_json)
            .map_err(|e| StorageError::SerializationError {
                error: format!("Failed to parse JSON: {:?}", e),
            })?;
        
        // Store in IndexedDB (simplified)
        let transaction = db.transaction_with_str_and_mode("entities", IdbTransactionMode::Readwrite)
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Transaction failed: {:?}", e),
            })?;
        
        let store = transaction.object_store("entities")
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Object store access failed: {:?}", e),
            })?;
        
        let request = store.put_with_key(&entity_value, &JsValue::from_str(key))
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Put request failed: {:?}", e),
            })?;
        
        JsFuture::from(request).await
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Put operation failed: {:?}", e),
            })?;
        
        Ok(())
    }
    
    async fn delete(&self, key: &str, _ctx: &StorageContext) -> Result<(), StorageError> {
        println!("[IndexedDBAdapter] Deleting entity: {}", key);
        
        let db = self.db.as_ref()
            .ok_or_else(|| StorageError::DatabaseUnavailable {
                reason: "Database not initialized".to_string(),
            })?;
        
        // Simplified delete operation
        let transaction = db.transaction_with_str_and_mode("entities", IdbTransactionMode::Readwrite)
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Transaction failed: {:?}", e),
            })?;
        
        let store = transaction.object_store("entities")
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Object store access failed: {:?}", e),
            })?;
        
        let request = store.delete(&JsValue::from_str(key))
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Delete request failed: {:?}", e),
            })?;
        
        JsFuture::from(request).await
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Delete operation failed: {:?}", e),
            })?;
        
        Ok(())
    }
    
    async fn purge(&self, key: &str, ctx: &StorageContext) -> Result<(), StorageError> {
        // For IndexedDB, purge is the same as delete
        self.delete(key, ctx).await
    }
    
    async fn query(&self, _query: &StorageQuery, _ctx: &StorageContext) -> Result<Vec<StoredEntity>, StorageError> {
        println!("[IndexedDBAdapter] Querying entities (simplified for community)");
        
        // Simplified query implementation for community version
        // In a full implementation, this would handle complex queries
        Ok(vec![])
    }
    
    async fn get_by_type(&self, entity_type: &str, _ctx: &StorageContext) -> Result<Vec<StoredEntity>, StorageError> {
        println!("[IndexedDBAdapter] Getting entities by type: {}", entity_type);
        
        // Simplified implementation for community version
        Ok(vec![])
    }
    
    async fn batch_put(&self, entities: Vec<(String, StoredEntity)>, ctx: &StorageContext) -> Result<(), StorageError> {
        println!("[IndexedDBAdapter] Batch putting {} entities", entities.len());
        
        // Simple batch implementation - put entities one by one
        for (key, entity) in entities {
            self.put(&key, entity, ctx).await?;
        }
        
        Ok(())
    }
    
    async fn get_stats(&self) -> Result<StorageStats, StorageError> {
        println!("[IndexedDBAdapter] Getting storage stats (simplified for community)");
        
        // Simplified stats for community version
        Ok(StorageStats {
            total_entities: 0,
            entities_by_type: HashMap::new(),
            storage_size_bytes: 0,
            last_sync: None,
            pending_changes: 0,
        })
    }
    
    async fn export_data(&self, _ctx: &StorageContext) -> Result<Vec<u8>, StorageError> {
        println!("[IndexedDBAdapter] Exporting data (not implemented for community)");
        
        // Simplified for community version
        Ok(vec![])
    }
    
    async fn import_data(&mut self, _data: &[u8], _ctx: &StorageContext) -> Result<(), StorageError> {
        println!("[IndexedDBAdapter] Importing data (not implemented for community)");
        
        // Simplified for community version
        Ok(())
    }
}

impl StoreConfig {
    /// Create new store config
    pub fn new(key_path: &str) -> Self {
        Self {
            key_path: key_path.to_string(),
            auto_increment: false,
            indexes: Vec::new(),
        }
    }
    
    /// Enable auto increment
    pub fn with_auto_increment(mut self) -> Self {
        self.auto_increment = true;
        self
    }
    
    /// Add index
    pub fn with_index(mut self, name: &str, key_path: &str, unique: bool) -> Self {
        self.indexes.push(IndexConfig {
            name: name.to_string(),
            key_path: key_path.to_string(),
            unique,
            multi_entry: false,
        });
        self
    }
}

impl Migration {
    /// Create new migration
    pub fn new(version: u32, description: &str) -> Self {
        Self {
            version,
            description: description.to_string(),
        }
    }
}


impl IndexedDBAdapter {
    /// Create a new IndexedDB adapter
    pub fn new(db_name: String, version: u32) -> Self {
        let mut stores = HashMap::new();
        
        // Default store configurations (matching your JS implementation)
        stores.insert("objects".to_string(), StoreConfig {
            key_path: "id".to_string(),
            auto_increment: false,
            indexes: vec![
                IndexConfig {
                    name: "entity_type".to_string(),
                    key_path: "entity_type".to_string(),
                    unique: false,
                    multi_entry: false,
                },
                IndexConfig {
                    name: "classification".to_string(),
                    key_path: "classification".to_string(),
                    unique: false,
                    multi_entry: false,
                },
                IndexConfig {
                    name: "updated_at".to_string(),
                    key_path: "updated_at".to_string(),
                    unique: false,
                    multi_entry: false,
                },
                IndexConfig {
                    name: "tenant_id".to_string(),
                    key_path: "tenant_id".to_string(),
                    unique: false,
                    multi_entry: false,
                },
            ],
        });
        
        stores.insert("objects_polyinstantiated".to_string(), StoreConfig {
            key_path: "id".to_string(),
            auto_increment: false,
            indexes: vec![
                IndexConfig {
                    name: "logical_id".to_string(),
                    key_path: "logical_id".to_string(),
                    unique: false,
                    multi_entry: false,
                },
                IndexConfig {
                    name: "classification_level".to_string(),
                    key_path: "classification_level".to_string(),
                    unique: false,
                    multi_entry: false,
                },
                IndexConfig {
                    name: "updated_at".to_string(),
                    key_path: "updated_at".to_string(),
                    unique: false,
                    multi_entry: false,
                },
            ],
        });
        
        stores.insert("system_settings".to_string(), StoreConfig {
            key_path: "id".to_string(),
            auto_increment: false,
            indexes: vec![],
        });
        
        stores.insert("audit_events".to_string(), StoreConfig {
            key_path: "id".to_string(),
            auto_increment: false,
            indexes: vec![
                IndexConfig {
                    name: "type".to_string(),
                    key_path: "type".to_string(),
                    unique: false,
                    multi_entry: false,
                },
                IndexConfig {
                    name: "timestamp".to_string(),
                    key_path: "timestamp".to_string(),
                    unique: false,
                    multi_entry: false,
                },
            ],
        });
        
        Self {
            db_name,
            db_version: version,
            db: None,
            stores,
            migrations: vec![],
            ready: false,
        }
    }
    
    /// Add a migration
    pub fn add_migration(&mut self, migration: Migration) {
        self.migrations.push(migration);
        self.migrations.sort_by_key(|m| m.version);
    }
    
    /// Get database connection
    fn get_db(&self) -> Result<&IdbDatabase, StorageError> {
        self.db.as_ref().ok_or_else(|| StorageError::DatabaseUnavailable {
            reason: "IndexedDB not initialized".to_string(),
        })
    }
    
    /// Create a transaction
    fn create_transaction(&self, store_names: &[&str], mode: IdbTransactionMode) -> Result<IdbTransaction, StorageError> {
        let db = self.get_db()?;
        
        let js_store_names = js_sys::Array::new();
        for name in store_names {
            js_store_names.push(&JsValue::from_str(name));
        }
        
        db.transaction_with_str_sequence_and_mode(&js_store_names, mode)
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Failed to create transaction: {:?}", e),
            })
    }
    
    /// Execute an async IndexedDB operation
    async fn execute_request<T>(&self, request: IdbRequest) -> Result<T, StorageError> 
    where
        T: wasm_bindgen::convert::FromWasmAbi + 'static,
    {
        let promise = js_sys::Promise::resolve(&JsFuture::from(request));
        let result = JsFuture::from(promise).await
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Request failed: {:?}", e),
            })?;
        
        result.unchecked_into::<T>()
            .map_err(|_| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: "Failed to convert result".to_string(),
            })
    }
    
    /// Convert StoredEntity to JsValue for storage
    fn entity_to_js_value(&self, entity: &StoredEntity) -> Result<JsValue, StorageError> {
        serde_wasm_bindgen::to_value(entity)
            .map_err(|e| StorageError::SerializationError {
                error: e.to_string(),
            })
    }
    
    /// Convert JsValue to StoredEntity
    fn js_value_to_entity(&self, value: JsValue) -> Result<StoredEntity, StorageError> {
        if value.is_null() || value.is_undefined() {
            return Err(StorageError::SerializationError {
                error: "Null or undefined value".to_string(),
            });
        }
        
        serde_wasm_bindgen::from_value(value)
            .map_err(|e| StorageError::SerializationError {
                error: e.to_string(),
            })
    }
}

#[async_trait]
impl StorageAdapter for IndexedDBAdapter {
    async fn initialize(&mut self) -> Result<(), StorageError> {
        // Community version: Simple logging instead of complex instrumentation
        println!("[IndexedDBAdapter] Initializing IndexedDB adapter");
        
        let window = web_sys::window()
            .ok_or_else(|| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: "No window object available".to_string(),
            })?;
            
            let idb = window.indexed_db()
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("IndexedDB not available: {:?}", e),
                })?
                .ok_or_else(|| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: "IndexedDB not supported".to_string(),
                })?;
            
            let open_request = idb.open_with_u32(&self.db_name, self.db_version)
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("Failed to open database: {:?}", e),
                })?;
            
            // Set up upgrade handler for migrations
            let stores = self.stores.clone();
            let migrations = self.migrations.clone();
            
            let upgrade_callback = Closure::wrap(Box::new(move |event: web_sys::Event| {
                let target = event.target().unwrap();
                let request: IdbOpenDbRequest = target.dyn_into().unwrap();
                let db = request.result().unwrap().dyn_into::<IdbDatabase>().unwrap();
                let transaction = request.transaction().unwrap();
                
                // Create object stores
                for (store_name, store_config) in &stores {
                    if !db.object_store_names().contains(store_name) {
                        let mut options = IdbObjectStoreParameters::new();
                        options.key_path(Some(&JsValue::from_str(&store_config.key_path)));
                        options.auto_increment(store_config.auto_increment);
                        
                        let store = db.create_object_store_with_optional_parameters(
                            store_name,
                            &options,
                        ).unwrap();
                        
                        // Create indexes
                        for index_config in &store_config.indexes {
                            if !store.index_names().contains(&index_config.name) {
                                let mut index_options = IdbIndexParameters::new();
                                index_options.unique(index_config.unique);
                                index_options.multi_entry(index_config.multi_entry);
                                
                                store.create_index_with_str_and_optional_parameters(
                                    &index_config.name,
                                    &index_config.key_path,
                                    &index_options,
                                ).unwrap();
                            }
                        }
                    }
                }
                
                // Run migrations
                for migration in &migrations {
                    if let Err(e) = (migration.migrate)(&db, &transaction) {
                        web_sys::console::error_2(
                            &JsValue::from_str("Migration failed:"),
                            &e,
                        );
                    }
                }
            }) as Box<dyn FnMut(web_sys::Event)>);
            
            open_request.set_onupgradeneeded(Some(upgrade_callback.as_ref().unchecked_ref()));
            upgrade_callback.forget(); // Keep callback alive
            
            // Wait for database to open
            let result = JsFuture::from(open_request).await
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("Failed to open database: {:?}", e),
                })?;
            
            self.db = Some(result.dyn_into::<IdbDatabase>()
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("Invalid database object: {:?}", e),
                })?);
            
            self.ready = true;
            tracing::info!(db_name = %self.db_name, version = self.db_version, "IndexedDB initialized");
            
            Ok(())
        }).await
    }
    
    async fn health_check(&self) -> Result<(), StorageError> {
        if !self.ready || self.db.is_none() {
            return Err(StorageError::DatabaseUnavailable {
                reason: "IndexedDB not ready".to_string(),
            });
        }
        
        // Try a simple operation to verify health
        let transaction = self.create_transaction(&["system_settings"], IdbTransactionMode::Readonly)?;
        let store = transaction.object_store("system_settings")
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Failed to get store: {:?}", e),
            })?;
        
        // Just verify the store is accessible
        let _count_request = store.count()
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Health check failed: {:?}", e),
            })?;
        
        Ok(())
    }
    
    async fn get(&self, key: &str, _ctx: &StorageContext) -> Result<Option<StoredEntity>, StorageError> {
        instrument("indexeddb_get", || async {
            let transaction = self.create_transaction(&["objects"], IdbTransactionMode::Readonly)?;
            let store = transaction.object_store("objects")
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("Failed to get store: {:?}", e),
                })?;
            
            let request = store.get(&JsValue::from_str(key))
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("Failed to create get request: {:?}", e),
                })?;
            
            let result = JsFuture::from(request).await
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("Get request failed: {:?}", e),
                })?;
            
            if result.is_null() || result.is_undefined() {
                Ok(None)
            } else {
                let entity = self.js_value_to_entity(result)?;
                Ok(Some(entity))
            }
        }).await
    }
    
    async fn put(&self, _key: &str, entity: StoredEntity, _ctx: &StorageContext) -> Result<(), StorageError> {
        instrument("indexeddb_put", || async {
            let transaction = self.create_transaction(&["objects"], IdbTransactionMode::Readwrite)?;
            let store = transaction.object_store("objects")
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("Failed to get store: {:?}", e),
                })?;
            
            let js_entity = self.entity_to_js_value(&entity)?;
            let request = store.put(&js_entity)
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("Failed to create put request: {:?}", e),
                })?;
            
            JsFuture::from(request).await
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("Put request failed: {:?}", e),
                })?;
            
            Ok(())
        }).await
    }
    
    async fn delete(&self, key: &str, _ctx: &StorageContext) -> Result<(), StorageError> {
        instrument("indexeddb_delete", || async {
            let transaction = self.create_transaction(&["objects"], IdbTransactionMode::Readwrite)?;
            let store = transaction.object_store("objects")
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("Failed to get store: {:?}", e),
                })?;
            
            let request = store.delete(&JsValue::from_str(key))
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("Failed to create delete request: {:?}", e),
                })?;
            
            JsFuture::from(request).await
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("Delete request failed: {:?}", e),
                })?;
            
            Ok(())
        }).await
    }
    
    async fn purge(&self, key: &str, ctx: &StorageContext) -> Result<(), StorageError> {
        // For IndexedDB, purge is the same as delete
        self.delete(key, ctx).await
    }
    
    async fn query(&self, query: &StorageQuery, _ctx: &StorageContext) -> Result<Vec<StoredEntity>, StorageError> {
        instrument("indexeddb_query", || async {
            let transaction = self.create_transaction(&["objects"], IdbTransactionMode::Readonly)?;
            let store = transaction.object_store("objects")
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("Failed to get store: {:?}", e),
                })?;
            
            // Simple implementation - get all and filter in memory
            // In production, you'd want to use indexes for better performance
            let request = store.get_all()
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("Failed to create getAll request: {:?}", e),
                })?;
            
            let result = JsFuture::from(request).await
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("Query request failed: {:?}", e),
                })?;
            
            let js_array: js_sys::Array = result.dyn_into()
                .map_err(|e| StorageError::BackendError {
                    backend: "indexeddb".to_string(),
                    error: format!("Invalid result type: {:?}", e),
                })?;
            
            let mut entities = Vec::new();
            for i in 0..js_array.length() {
                let js_entity = js_array.get(i);
                if let Ok(entity) = self.js_value_to_entity(js_entity) {
                    // Apply filters
                    if self.matches_query(&entity, query) {
                        entities.push(entity);
                    }
                }
            }
            
            // Apply sorting and limiting
            self.sort_and_limit_results(&mut entities, query);
            
            Ok(entities)
        }).await
    }
    
    async fn get_by_type(&self, entity_type: &str, ctx: &StorageContext) -> Result<Vec<StoredEntity>, StorageError> {
        let mut query = StorageQuery {
            entity_type: Some(entity_type.to_string()),
            filters: HashMap::new(),
            sort: None,
            limit: None,
            offset: None,
            include_deleted: false,
        };
        
        self.query(&query, ctx).await
    }
    
    async fn batch_put(&self, entities: Vec<(String, StoredEntity)>, ctx: &StorageContext) -> Result<(), StorageError> {
        instrument("indexeddb_batch_put", || async {
            for (key, entity) in entities {
                self.put(&key, entity, ctx).await?;
            }
            Ok(())
        }).await
    }
    
    async fn get_stats(&self) -> Result<StorageStats, StorageError> {
        let transaction = self.create_transaction(&["objects"], IdbTransactionMode::Readonly)?;
        let store = transaction.object_store("objects")
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Failed to get store: {:?}", e),
            })?;
        
        let count_request = store.count()
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Failed to create count request: {:?}", e),
            })?;
        
        let result = JsFuture::from(count_request).await
            .map_err(|e| StorageError::BackendError {
                backend: "indexeddb".to_string(),
                error: format!("Count request failed: {:?}", e),
            })?;
        
        let total_entities = result.as_f64().unwrap_or(0.0) as u64;
        
        Ok(StorageStats {
            total_entities,
            entities_by_type: HashMap::new(), // Would need separate queries to populate
            storage_size_bytes: 0, // Not easily available in IndexedDB
            last_sync: None,
            pending_changes: 0,
        })
    }
    
    async fn migrate(&mut self, target_version: u32) -> Result<(), StorageError> {
        if target_version != self.db_version {
            self.db_version = target_version;
            self.db = None;
            self.ready = false;
            self.initialize().await?;
        }
        Ok(())
    }
    
    async fn export_data(&self, _ctx: &StorageContext) -> Result<Vec<u8>, StorageError> {
        // Simplified export - in production you'd want streaming
        let query = StorageQuery {
            entity_type: None,
            filters: HashMap::new(),
            sort: None,
            limit: None,
            offset: None,
            include_deleted: true,
        };
        
        let entities = self.query(&query, _ctx).await?;
        let json = serde_json::to_string(&entities)
            .map_err(|e| StorageError::SerializationError {
                error: e.to_string(),
            })?;
        
        Ok(json.into_bytes())
    }
    
    async fn import_data(&mut self, data: &[u8], ctx: &StorageContext) -> Result<(), StorageError> {
        let json = std::str::from_utf8(data)
            .map_err(|e| StorageError::SerializationError {
                error: e.to_string(),
            })?;
        
        let entities: Vec<StoredEntity> = serde_json::from_str(json)
            .map_err(|e| StorageError::SerializationError {
                error: e.to_string(),
            })?;
        
        let batch_data: Vec<(String, StoredEntity)> = entities
            .into_iter()
            .map(|e| (e.id.clone(), e))
            .collect();
        
        self.batch_put(batch_data, ctx).await
    }
}

impl IndexedDBAdapter {
    /// Check if entity matches query filters
    fn matches_query(&self, entity: &StoredEntity, query: &StorageQuery) -> bool {
        // Check entity type filter
        if let Some(ref entity_type) = query.entity_type {
            if entity.entity_type != *entity_type {
                return false;
            }
        }
        
        // Check deleted filter
        if !query.include_deleted && entity.deleted_at.is_some() {
            return false;
        }
        
        // Check custom filters
        for (field, expected_value) in &query.filters {
            // This is simplified - in production you'd want more sophisticated filtering
            if let Some(actual_value) = entity.data.get(field) {
                if actual_value != expected_value {
                    return false;
                }
            }
        }
        
        true
    }
    
    /// Sort and limit query results
    fn sort_and_limit_results(&self, entities: &mut Vec<StoredEntity>, query: &StorageQuery) {
        // Apply sorting
        if let Some(ref sort_criteria) = query.sort {
            entities.sort_by(|a, b| {
                for criteria in sort_criteria {
                    let result = match criteria.field.as_str() {
                        "created_at" => a.created_at.cmp(&b.created_at),
                        "updated_at" => a.updated_at.cmp(&b.updated_at),
                        "entity_type" => a.entity_type.cmp(&b.entity_type),
                        _ => std::cmp::Ordering::Equal,
                    };
                    
                    if result != std::cmp::Ordering::Equal {
                        return match criteria.direction {
                            super::SortDirection::Asc => result,
                            super::SortDirection::Desc => result.reverse(),
                        };
                    }
                }
                std::cmp::Ordering::Equal
            });
        }
        
        // Apply offset and limit
        let start = query.offset.unwrap_or(0);
        let end = if let Some(limit) = query.limit {
            std::cmp::min(start + limit, entities.len())
        } else {
            entities.len()
        };
        
        if start < entities.len() {
            entities.drain(..start);
            entities.truncate(end - start);
        } else {
            entities.clear();
        }
    }
}