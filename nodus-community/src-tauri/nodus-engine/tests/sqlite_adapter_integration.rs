use uuid::Uuid;
use chrono::Utc;

use nodus::storage::{SqliteAdapter, StorageContext, StoredEntity, SyncStatus, StorageAdapter};

// Integration test: initialize (runs migrations), batch_put and query
#[tokio::test]
async fn test_sqlite_adapter_migrations_and_batch_put() {
    if std::env::var("NODUS_SQLITE_TEST").is_err() {
        println!("Skipping sqlite integration test; set NODUS_SQLITE_TEST=1 to run it");
        return;
    }

    let path = format!("nodus_integ_{}.sqlite", Uuid::new_v4());
    let _ = std::fs::remove_file(&path);

    let mut adapter = SqliteAdapter::new(path.clone());
    adapter.initialize().await.expect("initialize failed");

    // Create several entities and batch put
    let mut entities = Vec::new();
    for i in 0..5 {
        let ent = StoredEntity {
            id: format!("obj{}", i),
            entity_type: "object".to_string(),
            data: serde_json::json!({"i": i}),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            created_by: "tester".to_string(),
            updated_by: "tester".to_string(),
            version: 1,
            deleted_at: None,
            sync_status: SyncStatus::Local,
        };
        entities.push((format!("object:{}", ent.id), ent));
    }

    adapter.batch_put(entities.clone(), &StorageContext { user_id: "test".to_string(), session_id: Uuid::new_v4(), operation_id: Uuid::new_v4() }).await.expect("batch_put failed");

    // Query back
    let results = adapter.query(&nodus::storage::StorageQuery { entity_type: Some("object".to_string()), filters: std::collections::HashMap::new(), sort: None, limit: None, offset: None, include_deleted: false }, &StorageContext { user_id: "test".to_string(), session_id: Uuid::new_v4(), operation_id: Uuid::new_v4() }).await.expect("query failed");

    // Expect at least the ones we inserted (depending on migration tables presence)
    assert!(results.len() >= 5, "expected >=5 objects, got {}", results.len());

    let _ = std::fs::remove_file(&path);
}
