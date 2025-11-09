use crate::storage::{StorageAdapter, StorageError, StoredEntity, StorageContext, StorageQuery, StorageStats};
use sqlx::{SqlitePool, Row};
use async_trait::async_trait;
use serde_json;
use std::collections::HashMap;

/// SQLite-backed adapter using `sqlx`. This adapter will initialize the
/// embedded schema from `src/core-migrations/nodus.sqlite` on first run and
/// provides a persistent key/value table (`kv_store`) used by the engine for
/// simple config and grid storage keys like `grid_config:nodus-grid`.
pub struct SqliteAdapter {
    pub pool: Option<SqlitePool>,
    pub db_path: String,
}

impl SqliteAdapter {
    pub fn new(db_path: impl Into<String>) -> Self {
        Self { pool: None, db_path: db_path.into() }
    }
}

#[async_trait]
impl StorageAdapter for SqliteAdapter {
    async fn initialize(&mut self) -> Result<(), StorageError> {
        // Ensure parent directory exists
        let db_path_buf = std::path::PathBuf::from(&self.db_path);
        if let Some(parent) = db_path_buf.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent).map_err(|e| StorageError::BackendError { backend: "sqlite".to_string(), error: format!("Failed to create db dir: {}", e) })?;
            }
        }

        // Normalize path for sqlite connection string. For absolute paths on
        // Windows (e.g. C:\path\to\db.sqlite) we must convert backslashes to
        // forward slashes and prefix with an extra slash: sqlite:///C:/path/db.sqlite
    let normalized = self.db_path.replace("\\", "/");
        let conn_str = if normalized.starts_with('/') || normalized.contains(':') {
            // absolute path -> ensure triple slash (Windows absolute paths like C:/... become sqlite:///C:/...)
            format!("sqlite:///{}", normalized)
        } else {
            // relative path
            format!("sqlite://{}", normalized)
        };

        let pool = SqlitePool::connect(&conn_str).await.map_err(|e| StorageError::BackendError { backend: "sqlite".to_string(), error: format!("Failed to connect: {}", e) })?;

        // Run migrations from embedded SQL file
        // Use include_str to embed the schema at compile time
        let sql = include_str!("../core-migrations/nodus.sqlite");
        // Split on semicolon and execute each statement
        for stmt in sql.split(';') {
            let stmt = stmt.trim();
            if stmt.is_empty() { continue; }
            // Execute statement; ignore statements that are only PRAGMA or comments
            if let Err(e) = sqlx::query(stmt).execute(&pool).await {
                // Some statements may fail if they already exist; log and continue
                tracing::warn!("SQLite migration statement failed (continuing): {}", e);
            }
        }

        // Ensure a simple kv_store table exists for engine key/value usage
        let kv_sql = r#"
            CREATE TABLE IF NOT EXISTS kv_store (
                key TEXT PRIMARY KEY,
                value TEXT,
                metadata TEXT,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        "#;
        sqlx::query(kv_sql).execute(&pool).await.map_err(|e| StorageError::BackendError { backend: "sqlite".to_string(), error: format!("Failed to create kv_store: {}", e) })?;

        self.pool = Some(pool);
        Ok(())
    }

    async fn health_check(&self) -> Result<(), StorageError> {
        if let Some(pool) = &self.pool {
            sqlx::query("SELECT 1").execute(pool).await.map_err(|e| StorageError::BackendError { backend: "sqlite".to_string(), error: format!("health check failed: {}", e) })?;
            Ok(())
        } else {
            Err(StorageError::DatabaseUnavailable { reason: "pool not initialized".to_string() })
        }
    }

    async fn get(&self, key: &str, _ctx: &StorageContext) -> Result<Option<StoredEntity>, StorageError> {
        let pool = self.pool.as_ref().ok_or(StorageError::DatabaseUnavailable { reason: "pool not initialized".to_string() })?;
        let row = sqlx::query("SELECT value FROM kv_store WHERE key = ?")
            .bind(key)
            .fetch_optional(pool).await.map_err(|e| StorageError::BackendError { backend: "sqlite".to_string(), error: format!("query failed: {}", e) })?;
        if let Some(r) = row {
            let value: String = r.get(0);
            // Deserialize into StoredEntity if possible; otherwise return NotFound
            match serde_json::from_str::<StoredEntity>(&value) {
                Ok(ent) => Ok(Some(ent)),
                Err(_) => Ok(None),
            }
        } else {
            Ok(None)
        }
    }

    async fn put(&self, key: &str, entity: StoredEntity, _ctx: &StorageContext) -> Result<(), StorageError> {
        let pool = self.pool.as_ref().ok_or(StorageError::DatabaseUnavailable { reason: "pool not initialized".to_string() })?;
        let value = serde_json::to_string(&entity).map_err(|e| StorageError::SerializationError { error: format!("serialize failed: {}", e) })?;
        sqlx::query("INSERT INTO kv_store(key, value, metadata, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, metadata = excluded.metadata, updated_at = datetime('now');")
            .bind(key)
            .bind(&value)
            .bind(serde_json::json!({}).to_string())
            .execute(pool).await.map_err(|e| StorageError::BackendError { backend: "sqlite".to_string(), error: format!("put failed: {}", e) })?;
        Ok(())
    }

    async fn delete(&self, key: &str, _ctx: &StorageContext) -> Result<(), StorageError> {
        let pool = self.pool.as_ref().ok_or(StorageError::DatabaseUnavailable { reason: "pool not initialized".to_string() })?;
        sqlx::query("UPDATE kv_store SET value = NULL, updated_at = datetime('now') WHERE key = ?")
            .bind(key)
            .execute(pool).await.map_err(|e| StorageError::BackendError { backend: "sqlite".to_string(), error: format!("delete failed: {}", e) })?;
        Ok(())
    }

    async fn purge(&self, key: &str, _ctx: &StorageContext) -> Result<(), StorageError> {
        let pool = self.pool.as_ref().ok_or(StorageError::DatabaseUnavailable { reason: "pool not initialized".to_string() })?;
        sqlx::query("DELETE FROM kv_store WHERE key = ?")
            .bind(key)
            .execute(pool).await.map_err(|e| StorageError::BackendError { backend: "sqlite".to_string(), error: format!("purge failed: {}", e) })?;
        Ok(())
    }

    async fn query(&self, _query: &StorageQuery, _ctx: &StorageContext) -> Result<Vec<StoredEntity>, StorageError> {
        // For KV-based usage we return all values; complex queries should use
        // the full schema tables implemented above (objects/events etc.).
        let pool = self.pool.as_ref().ok_or(StorageError::DatabaseUnavailable { reason: "pool not initialized".to_string() })?;
        let rows = sqlx::query("SELECT value FROM kv_store")
            .fetch_all(pool).await.map_err(|e| StorageError::BackendError { backend: "sqlite".to_string(), error: format!("query failed: {}", e) })?;
        let mut out = Vec::new();
        for r in rows {
            let v: String = r.get(0);
            if let Ok(ent) = serde_json::from_str::<StoredEntity>(&v) {
                out.push(ent);
            }
        }
        Ok(out)
    }

    async fn get_by_type(&self, entity_type: &str, _ctx: &StorageContext) -> Result<Vec<StoredEntity>, StorageError> {
        // Try to read from objects table if present (full schema); otherwise from kv_store
        let pool = self.pool.as_ref().ok_or(StorageError::DatabaseUnavailable { reason: "pool not initialized".to_string() })?;
        // Prefer objects table if it exists
        let row = sqlx::query("SELECT name FROM sqlite_master WHERE type='table' AND name='objects'")
            .fetch_optional(pool).await.map_err(|e| StorageError::BackendError { backend: "sqlite".to_string(), error: format!("metadata check failed: {}", e) })?;
        if row.is_some() {
            let rows = sqlx::query("SELECT data FROM objects WHERE type_name = ?")
                .bind(entity_type)
                .fetch_all(pool).await.map_err(|e| StorageError::BackendError { backend: "sqlite".to_string(), error: format!("objects query failed: {}", e) })?;
            let mut out = Vec::new();
            for r in rows {
                let v: String = r.get(0);
                if let Ok(ent) = serde_json::from_str::<StoredEntity>(&v) {
                    out.push(ent);
                }
            }
            return Ok(out);
        }

        // Fallback: read kv_store values which have matching entity_type prefix
        let rows = sqlx::query("SELECT value FROM kv_store WHERE key LIKE ?")
            .bind(format!("{}:%", entity_type))
            .fetch_all(pool).await.map_err(|e| StorageError::BackendError { backend: "sqlite".to_string(), error: format!("kv query failed: {}", e) })?;
        let mut out = Vec::new();
        for r in rows {
            let v: String = r.get(0);
            if let Ok(ent) = serde_json::from_str::<StoredEntity>(&v) {
                out.push(ent);
            }
        }
        Ok(out)
    }

    async fn batch_put(&self, entities: Vec<(String, StoredEntity)>, _ctx: &StorageContext) -> Result<(), StorageError> {
        let pool = self.pool.as_ref().ok_or(StorageError::DatabaseUnavailable { reason: "pool not initialized".to_string() })?;
        for (k, v) in entities {
            let value = serde_json::to_string(&v).map_err(|e| StorageError::SerializationError { error: format!("serialize failed: {}", e) })?;
            sqlx::query("INSERT INTO kv_store(key, value, metadata, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, metadata = excluded.metadata, updated_at = datetime('now');")
                .bind(k)
                .bind(value)
                .bind(serde_json::json!({}).to_string())
                .execute(pool).await.map_err(|e| StorageError::BackendError { backend: "sqlite".to_string(), error: format!("batch put failed: {}", e) })?;
        }
        Ok(())
    }

    async fn get_stats(&self) -> Result<StorageStats, StorageError> {
        let pool = self.pool.as_ref().ok_or(StorageError::DatabaseUnavailable { reason: "pool not initialized".to_string() })?;
        let row = sqlx::query("SELECT COUNT(*) as c FROM kv_store").fetch_one(pool).await.map_err(|e| StorageError::BackendError { backend: "sqlite".to_string(), error: format!("stats query failed: {}", e) })?;
        let c: i64 = row.get::<i64, _>(0);
        Ok(StorageStats { total_entities: c as u64, entities_by_type: HashMap::new(), storage_size_bytes: 0, last_sync: None, pending_changes: 0 })
    }

    async fn export_data(&self, _ctx: &StorageContext) -> Result<Vec<u8>, StorageError> {
        Err(StorageError::BackendError { backend: "sqlite".to_string(), error: "export not implemented".to_string() })
    }

    async fn import_data(&mut self, _data: &[u8], _ctx: &StorageContext) -> Result<(), StorageError> {
        Err(StorageError::BackendError { backend: "sqlite".to_string(), error: "import not implemented".to_string() })
    }
}
