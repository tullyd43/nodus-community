// src/storage/mod.rs
// Storage module for Nodus Community Version
// Simplified storage without enterprise dependencies

pub mod sqlite_adapter;
pub mod storage_mod;
pub mod sync_mod;
pub mod validation_mod; // Register sqlite_adapter module

// IndexedDB adapter only available on wasm32
#[cfg(target_arch = "wasm32")]
pub mod indexeddb_adapter;

// Re-export main types and traits
pub use storage_mod::{
    SortCriteria,
    SortDirection,
    StorageAdapter,
    // expose sqlite adapter type
    // SqliteAdapter is provided as a separate module for clarity
    StorageConfig,
    StorageContext,
    StorageError,
    StorageManager,
    StorageQuery,
    StorageStats,
    StoredEntity,
    SyncStatus,
};

// Re-export sqlite adapter type so callers can construct/register it easily
pub use sqlite_adapter::SqliteAdapter;

// Re-export sync types if needed
pub use sync_mod::{
    SyncError,
    // Add other sync exports as needed
    SyncManager,
};

// Re-export validation types if needed
pub use validation_mod::{
    ValidationError,
    // Add other validation exports as needed
    ValidationResult,
};
