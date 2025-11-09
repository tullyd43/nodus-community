use uuid::Uuid;
use chrono::Utc;

use nodus::storage::{SqliteAdapter, StorageContext, StoredEntity, SyncStatus, StorageAdapter};

#[tokio::test]
async fn test_sqlite_adapter_put_get_purge() {
    // This test requires the environment to allow creating/opening a sqlite file.
    // To avoid spurious failures on systems where sqlite or permissions are missing,
    // only run the test when the caller sets `NODUS_SQLITE_TEST=1`.
    if std::env::var("NODUS_SQLITE_TEST").is_err() {
        println!("Skipping sqlite adapter test; set NODUS_SQLITE_TEST=1 to run it");
        return;
    }

    // Use a relative test DB filename (avoids platform-specific absolute path parsing)
    let path = format!("nodus_test_{}.sqlite", Uuid::new_v4());
    // Ensure no pre-existing file
    let _ = std::fs::remove_file(&path);

    let mut adapter = SqliteAdapter::new(path.clone());
    adapter.initialize().await.expect("initialize failed");

    let ctx = StorageContext { user_id: "test-user".to_string(), session_id: Uuid::new_v4(), operation_id: Uuid::new_v4() };

    let ent = StoredEntity {
        id: "k1".to_string(),
        entity_type: "test_entity".to_string(),
        data: serde_json::json!({"value": 42}),
        created_at: Utc::now(),
        updated_at: Utc::now(),
        created_by: "tester".to_string(),
        updated_by: "tester".to_string(),
        version: 1,
        deleted_at: None,
        sync_status: SyncStatus::Local,
    };

    adapter.put("test:k1", ent.clone(), &ctx).await.expect("put failed");

    let got = adapter.get("test:k1", &ctx).await.expect("get failed").expect("not found");
    assert_eq!(got.id, ent.id);

    adapter.purge("test:k1", &ctx).await.expect("purge failed");

    let got2 = adapter.get("test:k1", &ctx).await.expect("get after purge failed");
    assert!(got2.is_none());

    // Cleanup temp file
    let _ = std::fs::remove_file(&path);
}
