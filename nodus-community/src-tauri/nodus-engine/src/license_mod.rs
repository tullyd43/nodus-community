// src-tauri/src/license/mod.rs
// License Management - 3-Tier Apache Model Strategy Implementation + Defense Fork
// Aligns with the "Compliance-Native Platform" business strategy
// Tiers: Community (open source) -> Pro -> Team -> Enterprise
// Defense tier is handled as a separate build fork

use base64::{engine::general_purpose, Engine as _};
use chrono::{DateTime, Utc};
use ring::hmac;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

/// Nodus 3-Tier License System - Apache Model
/// Defense tier is a separate classified fork, not part of main distribution
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum LicenseTier {
    Community = 0,  // Open source - full app, unsigned plugins allowed
    Pro = 1,        // Professional - community + AI features
    Team = 2,       // Team/small business - pro + collaboration
    Enterprise = 3, // Enterprise - team + signed plugins only + compliance
}

impl LicenseTier {
    pub fn from_string(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "community" | "free" | "open" | "opensource" => Some(Self::Community),
            "pro" | "professional" | "individual" => Some(Self::Pro),
            "team" | "small_business" | "startup" => Some(Self::Team),
            "enterprise" | "business" | "corporate" => Some(Self::Enterprise),
            _ => None,
        }
    }
    
    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Community => "Community",
            Self::Pro => "Professional", 
            Self::Team => "Team",
            Self::Enterprise => "Enterprise",
        }
    }

    /// Check if this tier includes features from another tier
    pub fn includes_tier(&self, other: &LicenseTier) -> bool {
        self >= other
    }
}

/// License status
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum LicenseStatus {
    Valid,
    Expired,
    Invalid,
    Revoked,
    Pending,
}

/// Complete license information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseInfo {
    pub license_id: Uuid,
    pub tier: LicenseTier,
    pub status: LicenseStatus,
    pub customer_name: String,
    pub issued_to: String,
    pub issued_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub max_users: Option<u32>,
    pub max_nodes: Option<u32>,
    pub allowed_deployments: Vec<String>,
    pub features: HashSet<String>,
    pub limits: LicenseLimits,
    pub signature: String,
    pub verification_key: String,
}

/// License limits based on tier
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LicenseLimits {
    pub max_users: Option<u32>,
    pub max_storage_gb: Option<u32>,
    pub max_operations_per_hour: Option<u32>,
    pub max_api_calls_per_day: Option<u32>,
    pub max_concurrent_sessions: Option<u32>,
    pub max_tenants: Option<u32>,
}

/// Feature definitions for each tier - Apache Model Implementation
pub struct LicenseFeatures;

impl LicenseFeatures {
    /// Community tier features - THE FULL FUNCTIONAL APP
    /// This is NOT "limited" - it's the complete productivity platform
    pub fn community_features() -> HashSet<String> {
        vec![
            // CORE APPLICATION FEATURES (Full functionality)
            "forensic_logging".to_string(),           // Basic implementation
            "observability".to_string(),              // Basic metrics
            "security_framework".to_string(),         // Basic security
            "entity_management".to_string(),          // Full entity system
            "workflows".to_string(),                  // Full workflow system
            "data_storage".to_string(),               // Full storage
            "ui_framework".to_string(),               // Full UI system
            "grid_system".to_string(),                // Full grid system
            "relationship_system".to_string(),        // Full relationships
            "custom_fields".to_string(),              // Full custom fields
            "search_system".to_string(),              // Full search
            "export_import".to_string(),              // Full data portability
            "configuration".to_string(),              // Full configuration
            
            // COMMUNITY PLUGIN ECOSYSTEM (THE KEY DIFFERENCE)
            "plugin_system".to_string(),              // Same feature name as Enterprise
            "unsigned_plugins_allowed".to_string(),   // THE APACHE MODEL HOOK
            "community_plugin_marketplace".to_string(), // Access to community plugins
            
            // COMMUNITY OBSERVABILITY (Basic but functional)
            "audit_logging".to_string(),              // Basic audit trail
            "performance_metrics".to_string(),        // Basic metrics
            "error_tracking".to_string(),             // Basic error handling
            
            // COMMUNITY SECURITY (Basic but functional)
            "user_authentication".to_string(),        // Basic auth
            "user_authorization".to_string(),         // Basic permissions
            "data_encryption".to_string(),            // Basic encryption
            "session_management".to_string(),         // Basic sessions
        ]
        .into_iter()
        .collect()
    }

    /// Pro tier features - Community + Individual Productivity AI
    pub fn pro_features() -> HashSet<String> {
        let mut features = Self::community_features();

        // PRO: AI and Advanced Individual Features
        features.insert("ai_embedding".to_string());
        features.insert("ai_search".to_string());
        features.insert("ai_suggestions".to_string());
        features.insert("local_llm".to_string());
        features.insert("smart_categorization".to_string());
        features.insert("advanced_storage".to_string());
        features.insert("browser_integration".to_string());
        features.insert("offline_sync".to_string());
        features.insert("advanced_export".to_string());
        features.insert("performance_optimization".to_string());
        
        // PRO: Enhanced Individual Workflows
        features.insert("workflow_automation".to_string());
        features.insert("smart_templates".to_string());
        features.insert("advanced_filtering".to_string());
        features.insert("bulk_operations".to_string());

        features
    }

    /// Team tier features - Pro + Team Collaboration
    pub fn team_features() -> HashSet<String> {
        let mut features = Self::pro_features();

        // TEAM: Collaboration Features
        features.insert("team_workspaces".to_string());
        features.insert("shared_projects".to_string());
        features.insert("team_permissions".to_string());
        features.insert("collaboration_tools".to_string());
        features.insert("team_analytics".to_string());
        features.insert("shared_templates".to_string());
        features.insert("team_sync".to_string());
        features.insert("comment_system".to_string());
        features.insert("activity_feeds".to_string());
        features.insert("team_notifications".to_string());
        
        // TEAM: Simple Audit (but still community-level implementation)
        features.insert("team_audit_trail".to_string());
        features.insert("basic_compliance_reporting".to_string());

        features
    }

    /// Enterprise tier features - THE "GREAT DIVIDE" 
    /// Same feature names as Community, but ENTERPRISE IMPLEMENTATIONS
    pub fn enterprise_features() -> HashSet<String> {
        let mut features = Self::team_features();

        // REMOVE COMMUNITY PLUGIN ACCESS (THE GATE)
        features.remove("unsigned_plugins_allowed");
        features.remove("community_plugin_marketplace");

        // ADD ENTERPRISE PLUGIN CONTROL (THE MOAT)
        features.insert("signed_plugins_only".to_string());        // THE KEY GATE
        features.insert("unsigned_plugins_blocked".to_string());   // Enforcement
        features.insert("enterprise_plugin_marketplace".to_string()); // Curated plugins
        features.insert("plugin_signature_validation".to_string()); // Crypto validation
        features.insert("plugin_certification".to_string());       // Certified implementations

        // ENTERPRISE: "Total System Control Platform" Features
        features.insert("compliance_reporting".to_string());       // SOX/HIPAA/GDPR
        features.insert("sox_reporting".to_string());
        features.insert("hipaa_reporting".to_string());
        features.insert("gdpr_reporting".to_string());
        features.insert("pci_reporting".to_string());
        features.insert("soc2_reporting".to_string());
        
        // ENTERPRISE: Advanced Observability (Same names, enterprise implementation)
        features.insert("cryptographic_integrity".to_string());    // Hash chains
        features.insert("tamper_detection".to_string());           // Integrity verification
        features.insert("performance_sla_monitoring".to_string()); // <5ms guarantees
        features.insert("automatic_instrumentation".to_string());  // Zero-friction observability
        features.insert("forensic_chain_validation".to_string());  // Audit trail integrity
        
        // ENTERPRISE: Multi-Tenancy and Scale
        features.insert("multi_tenant_isolation".to_string());
        features.insert("tenant_administration".to_string());
        features.insert("enterprise_api_gateway".to_string());
        features.insert("enterprise_dashboard".to_string());
        features.insert("role_based_access_control".to_string());
        features.insert("enterprise_analytics".to_string());
        
        // ENTERPRISE: Database Upgrade (THE TECHNICAL MOAT)
        features.insert("enterprise_database_schema".to_string()); // Forensic tables
        features.insert("polyinstantiation_tables".to_string());   // Enterprise schema
        features.insert("compliance_data_retention".to_string());  // 7-year retention
        features.insert("immutable_audit_storage".to_string());    // Tamper-proof storage

        features
    }

    /// Get features for a license tier
    pub fn features_for_tier(tier: &LicenseTier) -> HashSet<String> {
        match tier {
            LicenseTier::Community => Self::community_features(),
            LicenseTier::Pro => Self::pro_features(),
            LicenseTier::Team => Self::team_features(),
            LicenseTier::Enterprise => Self::enterprise_features(),
        }
    }

    /// Check if a feature requires a specific minimum tier
    pub fn minimum_tier_for_feature(feature: &str) -> LicenseTier {
        match feature {
            // Community features (available to all)
            "forensic_logging" | "observability" | "security_framework" 
            | "entity_management" | "workflows" | "data_storage" | "ui_framework"
            | "plugin_system" | "unsigned_plugins_allowed" => LicenseTier::Community,
            
            // Pro features
            "ai_embedding" | "ai_search" | "local_llm" | "advanced_storage" 
            | "browser_integration" | "offline_sync" => LicenseTier::Pro,
            
            // Team features
            "team_workspaces" | "shared_projects" | "team_permissions"
            | "collaboration_tools" | "team_sync" => LicenseTier::Team,
            
            // Enterprise features (THE GATE)
            "signed_plugins_only" | "unsigned_plugins_blocked" | "compliance_reporting"
            | "sox_reporting" | "hipaa_reporting" | "cryptographic_integrity"
            | "enterprise_database_schema" | "multi_tenant_isolation" => LicenseTier::Enterprise,
            
            // Unknown features default to Enterprise (safe default)
            _ => LicenseTier::Enterprise,
        }
    }

    /// Get the plugin access mode for a tier (THE CRITICAL DIFFERENTIATOR)
    pub fn plugin_access_mode(tier: &LicenseTier) -> PluginAccessMode {
        match tier {
            LicenseTier::Community => PluginAccessMode::UnsignedAllowed,
            LicenseTier::Pro => PluginAccessMode::UnsignedAllowed,       // Pro still allows community plugins
            LicenseTier::Team => PluginAccessMode::UnsignedAllowed,      // Team still allows community plugins  
            LicenseTier::Enterprise => PluginAccessMode::SignedOnly,     // THE GATE
        }
    }
}

/// Plugin access control mode (THE COMPETITIVE MOAT)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum PluginAccessMode {
    UnsignedAllowed,    // Community/Pro/Team: Load any plugins
    SignedOnly,         // Enterprise: Only cryptographically signed plugins
}

/// License manager for validation and feature checking
#[derive(Debug)]
pub struct LicenseManager {
    current_license: Option<LicenseInfo>,
    verification_keys: HashMap<String, String>,
    feature_cache: HashMap<String, bool>,
}

impl LicenseManager {
    /// Create new license manager
    pub async fn new() -> Result<Self, LicenseError> {
        let mut manager = Self {
            current_license: None,
            verification_keys: HashMap::new(),
            feature_cache: HashMap::new(),
        };

        // Load verification keys (in production, these would be embedded or from secure storage)
        manager.load_verification_keys().await?;

        // Detect and validate current license
        manager.detect_license().await?;

        Ok(manager)
    }

    /// Detect current license from environment/file/registry
    async fn detect_license(&mut self) -> Result<(), LicenseError> {
        // Check for license file first
        if let Ok(license_data) = std::fs::read_to_string("license.json") {
            if let Ok(license) = serde_json::from_str::<LicenseInfo>(&license_data) {
                self.validate_and_set_license(license).await?;
                return Ok(());
            }
        }

        // Check environment variable
        if let Ok(license_str) = std::env::var("NODUS_LICENSE") {
            if let Ok(license_data) = general_purpose::STANDARD.decode(&license_str) {
                if let Ok(license_str) = String::from_utf8(license_data) {
                    if let Ok(license) = serde_json::from_str::<LicenseInfo>(&license_str) {
                        self.validate_and_set_license(license).await?;
                        return Ok(());
                    }
                }
            }
        }

        // No license found - default to Community (Apache Model)
        tracing::info!("🌍 No license found, defaulting to Community tier (full app, unsigned plugins allowed)");
        self.set_community_license();
        Ok(())
    }

    /// Set default community license (Apache Model - full app)
    fn set_community_license(&mut self) {
        let community_license = LicenseInfo {
            license_id: Uuid::new_v4(),
            tier: LicenseTier::Community,
            status: LicenseStatus::Valid,
            customer_name: "Community User".to_string(),
            issued_to: "community@nodus.dev".to_string(),
            issued_at: Utc::now(),
            expires_at: None, // Community never expires
            max_users: None,  // No limits for community
            max_nodes: None,
            allowed_deployments: vec!["any".to_string()],
            features: LicenseFeatures::community_features(),
            limits: LicenseLimits::default(), // No limits for community (Apache Model)
            signature: "community-default".to_string(),
            verification_key: "community".to_string(),
        };

        self.current_license = Some(community_license);
        self.rebuild_feature_cache();
    }

    /// Validate and set license with cryptographic verification
    async fn validate_and_set_license(&mut self, license: LicenseInfo) -> Result<(), LicenseError> {
        // Check expiration
        if let Some(expires_at) = license.expires_at {
            if Utc::now() > expires_at {
                return Err(LicenseError::Expired);
            }
        }

        // Verify signature for non-community licenses
        if license.tier != LicenseTier::Community {
            self.verify_license_signature(&license)?;
        }

        // Check status
        if license.status != LicenseStatus::Valid {
            return Err(LicenseError::Invalid);
        }

        self.current_license = Some(license);
        self.rebuild_feature_cache();

        Ok(())
    }

    /// Verify license signature using HMAC
    fn verify_license_signature(&self, license: &LicenseInfo) -> Result<(), LicenseError> {
        let verification_key = self
            .verification_keys
            .get(&license.verification_key)
            .ok_or(LicenseError::InvalidSignature)?;

        // Create message to verify; clone the tier to avoid moving out of a borrowed `license`
        let message = format!(
            "{}:{}:{}:{}",
            license.license_id,
            license.tier.clone() as u8,
            license.customer_name,
            license.issued_at.timestamp()
        );

        // Verify HMAC signature
        let key = hmac::Key::new(hmac::HMAC_SHA256, verification_key.as_bytes());
        let expected_signature =
            general_purpose::STANDARD.encode(hmac::sign(&key, message.as_bytes()).as_ref());

        if expected_signature != license.signature {
            return Err(LicenseError::InvalidSignature);
        }

        Ok(())
    }

    /// Load verification keys
    async fn load_verification_keys(&mut self) -> Result<(), LicenseError> {
        // In production, these would be embedded in the binary
        self.verification_keys.insert(
            "pro_key_v1".to_string(),
            "pro_verification_key_2024".to_string(),
        );
        self.verification_keys.insert(
            "team_key_v1".to_string(),
            "team_verification_key_2024".to_string(),
        );
        self.verification_keys.insert(
            "enterprise_key_v1".to_string(),
            "enterprise_verification_key_2024".to_string(),
        );

        Ok(())
    }

    /// Rebuild feature cache for fast lookups
    fn rebuild_feature_cache(&mut self) {
        self.feature_cache.clear();

        if let Some(ref license) = self.current_license {
            for feature in &license.features {
                self.feature_cache.insert(feature.clone(), true);
            }
        }
    }

    /// Check if a feature is available (replaces JS license.hasFeature)
    pub async fn has_feature(&self, feature: &str) -> bool {
        self.feature_cache.get(feature).copied().unwrap_or(false)
    }

    /// Get current license tier
    pub async fn get_tier(&self) -> LicenseTier {
        self.current_license
            .as_ref()
            .map(|l| l.tier.clone())
            .unwrap_or(LicenseTier::Community)
    }

    /// Get current license info
    pub async fn get_license_info(&self) -> Option<&LicenseInfo> {
        self.current_license.as_ref()
    }

    /// Check if within usage limits
    pub async fn check_limit(&self, limit_type: &str, current_usage: u32) -> bool {
        // If there is no current license, default to allowing the operation (community default)
        let limits = if let Some(ref lic) = self.current_license {
            &lic.limits
        } else {
            return true;
        };

        match limit_type {
            "users" => limits.max_users.map_or(true, |max| current_usage <= max),
            "storage_gb" => limits
                .max_storage_gb
                .map_or(true, |max| current_usage <= max),
            "operations_per_hour" => limits
                .max_operations_per_hour
                .map_or(true, |max| current_usage <= max),
            "api_calls_per_day" => limits
                .max_api_calls_per_day
                .map_or(true, |max| current_usage <= max),
            "concurrent_sessions" => limits
                .max_concurrent_sessions
                .map_or(true, |max| current_usage <= max),
            "tenants" => limits.max_tenants.map_or(true, |max| current_usage <= max),
            _ => true, // Unknown limits default to allowed
        }
    }

    /// Validate enterprise feature access (for ESLint rule compliance)
    pub async fn validate_enterprise_access(&self, feature: &str) -> Result<(), LicenseError> {
        if self.has_feature(feature).await {
            Ok(())
        } else {
            Err(LicenseError::FeatureNotAvailable(feature.to_string()))
        }
    }

    /// Get plugin access mode (THE COMPETITIVE MOAT ENFORCEMENT)
    pub async fn get_plugin_access_mode(&self) -> PluginAccessMode {
        let tier = self.get_tier().await;
        LicenseFeatures::plugin_access_mode(&tier)
    }

    /// Get all available features for current tier
    pub async fn get_available_features(&self) -> Vec<String> {
        self.feature_cache.keys().cloned().collect()
    }

    /// Get plugin list for current tier
    pub async fn get_available_plugins(&self) -> Vec<String> {
        if let Some(ref license) = self.current_license {
            license
                .features
                .iter()
                .filter(|f| f.ends_with("_forensic_plugin"))
                .cloned()
                .collect()
        } else {
            Vec::new()
        }
    }
}

/// License validation errors
#[derive(Debug, thiserror::Error)]
pub enum LicenseError {
    #[error("License has expired")]
    Expired,

    #[error("Invalid license signature")]
    InvalidSignature,

    #[error("License is invalid or revoked")]
    Invalid,

    #[error("Feature not available in current license: {0}")]
    FeatureNotAvailable(String),

    #[error("License limit exceeded: {0}")]
    LimitExceeded(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

// Default implementation derived above

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_apache_model_community_features() {
        let features = LicenseFeatures::community_features();
        
        // Community should have FULL app features
        assert!(features.contains("forensic_logging"));        // Not "basic_" - full feature
        assert!(features.contains("observability"));           // Not "basic_" - full feature
        assert!(features.contains("entity_management"));       // Full entity system
        assert!(features.contains("workflows"));               // Full workflows
        
        // Community should allow unsigned plugins (Apache Model)
        assert!(features.contains("unsigned_plugins_allowed"));
        assert!(features.contains("plugin_system"));
        
        // Community should NOT have enterprise plugin control
        assert!(!features.contains("signed_plugins_only"));
        assert!(!features.contains("unsigned_plugins_blocked"));
    }

    #[test]
    fn test_enterprise_plugin_gate() {
        let enterprise_features = LicenseFeatures::enterprise_features();
        
        // Enterprise should have the plugin gate activated
        assert!(enterprise_features.contains("signed_plugins_only"));
        assert!(enterprise_features.contains("unsigned_plugins_blocked"));
        
        // Enterprise should NOT allow unsigned plugins
        assert!(!enterprise_features.contains("unsigned_plugins_allowed"));
        
        // But should have same core features as community
        assert!(enterprise_features.contains("forensic_logging"));    // Same name
        assert!(enterprise_features.contains("observability"));       // Same name
        assert!(enterprise_features.contains("entity_management"));   // Same name
    }

    #[test]
    fn test_plugin_access_modes() {
        assert_eq!(
            LicenseFeatures::plugin_access_mode(&LicenseTier::Community),
            PluginAccessMode::UnsignedAllowed
        );
        assert_eq!(
            LicenseFeatures::plugin_access_mode(&LicenseTier::Enterprise),
            PluginAccessMode::SignedOnly
        );
    }

    #[test]
    fn test_tier_feature_inheritance() {
        let community = LicenseFeatures::community_features();
        let pro = LicenseFeatures::pro_features();
        let enterprise = LicenseFeatures::enterprise_features();
        
        // Pro should include community features
        for feature in &community {
            if feature != "unsigned_plugins_allowed" && feature != "community_plugin_marketplace" {
                assert!(pro.contains(feature), "Pro missing community feature: {}", feature);
            }
        }
        
        // Enterprise should include team features (which include pro features)
        let team = LicenseFeatures::team_features();
        for feature in &team {
            if feature != "unsigned_plugins_allowed" && feature != "community_plugin_marketplace" {
                assert!(enterprise.contains(feature), "Enterprise missing team feature: {}", feature);
            }
        }
    }

    #[test]
    fn test_license_limits_apache_model() {
        let limits = LicenseLimits::default();
        
        // Apache Model: Community has no limits
        assert_eq!(limits.max_users, None);
        assert_eq!(limits.max_storage_gb, None);
        assert_eq!(limits.max_operations_per_hour, None);
        assert_eq!(limits.max_api_calls_per_day, None);
        assert_eq!(limits.max_concurrent_sessions, None);
        assert_eq!(limits.max_tenants, None);
    }

    #[tokio::test]
    async fn test_license_manager_community_default() {
        // Test that license manager defaults to community with full features
        let manager = LicenseManager::new().await.unwrap();
        assert_eq!(manager.get_tier().await, LicenseTier::Community);
        assert!(manager.has_feature("forensic_logging").await);
        assert!(manager.has_feature("unsigned_plugins_allowed").await);
        assert!(!manager.has_feature("signed_plugins_only").await);
    }
}
