// src/storage/mod.rs
// Storage module for Nodus Community Version
// Simplified storage without enterprise dependencies

pub mod storage_mod;
pub mod sync_mod;
pub mod validation_mod;

// IndexedDB adapter only available on wasm32
#[cfg(target_arch = "wasm32")]
pub mod indexeddb_adapter;

// Re-export main types and traits
pub use storage_mod::{
    StorageManager,
    StorageAdapter, 
    StorageError,
    StorageQuery,
    StorageContext,
    StoredEntity,
    StorageStats,
    StorageConfig,
    SortCriteria,
    SortDirection,
    SyncStatus,
};

// Re-export sync types if needed
pub use sync_mod::{
    SyncManager,
    SyncError,
    // Add other sync exports as needed
};

// Re-export validation types if needed  
pub use validation_mod::{
    ValidationResult,
    ValidationError,
    // Add other validation exports as needed
};