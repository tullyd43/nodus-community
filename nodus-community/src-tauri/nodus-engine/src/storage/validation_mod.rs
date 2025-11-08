// src/validation/mod.rs
// Validation Layer - Input validation and security (Community Version)
// Simplified validation without enterprise security dependencies

use std::collections::HashMap;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use regex::Regex;
use uuid::Uuid;

/// Validation errors
#[derive(Debug, thiserror::Error, Clone)]
pub enum ValidationError {
    #[error("Required field missing: {field}")]
    RequiredFieldMissing { field: String },
    
    #[error("Invalid format: {field} - {reason}")]
    InvalidFormat { field: String, reason: String },
    
    #[error("Value out of range: {field} - {value}")]
    OutOfRange { field: String, value: String },
    
    #[error("Invalid type: {field} - expected {expected}, got {actual}")]
    InvalidType { field: String, expected: String, actual: String },
    
    #[error("Security violation: {field} - {reason}")]
    SecurityViolation { field: String, reason: String },
    
    #[error("Business rule violation: {rule} - {reason}")]
    BusinessRuleViolation { rule: String, reason: String },
    
    #[error("Cross-field validation failed: {fields:?} - {reason}")]
    CrossFieldValidation { fields: Vec<String>, reason: String },
    
    #[error("Custom validation failed: {validator} - {reason}")]
    CustomValidationFailed { validator: String, reason: String },
}

/// Validation context (simplified for community)
#[derive(Debug, Clone)]
pub struct ValidationContext {
    pub user_id: String,
    pub session_id: Uuid,
    pub operation_id: Uuid,
    pub entity_type: Option<String>,
    pub validation_mode: ValidationMode,
    // Removed enterprise-specific fields:
    // - tenant_id, classification_level, compartments
}

/// Validation mode
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ValidationMode {
    /// Strict validation with all rules
    Strict,
    /// Lenient validation with basic rules only
    Lenient,
    /// Validation disabled (for system operations)
    Disabled,
}

/// Validation result
#[derive(Debug, Clone)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<String>,
    pub sanitized_data: Option<Value>,
    pub validation_time_ms: u64,
}

/// Field validation rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationRule {
    pub field_name: String,
    pub required: bool,
    pub data_type: DataType,
    pub constraints: Vec<Constraint>,
    pub custom_validators: Vec<String>,
}

/// Data types for validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DataType {
    String { min_length: Option<usize>, max_length: Option<usize> },
    Number { min: Option<f64>, max: Option<f64> },
    Integer { min: Option<i64>, max: Option<i64> },
    Boolean,
    Array { item_type: Box<DataType>, min_items: Option<usize>, max_items: Option<usize> },
    Object { schema: Option<String> },
    DateTime,
    Uuid,
    Email,
    Url,
    Custom { type_name: String },
}

/// Validation constraints
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Constraint {
    Regex { pattern: String, flags: String },
    Enum { values: Vec<String> },
    Range { min: f64, max: f64 },
    Length { min: usize, max: usize },
    UniqueIn { collection: String },
    Dependencies { fields: Vec<String> },
    Custom { name: String, config: Value },
}

/// Schema definition for complex validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationSchema {
    pub schema_name: String,
    pub version: String,
    pub description: String,
    pub rules: Vec<ValidationRule>,
    pub cross_field_rules: Vec<CrossFieldRule>,
    pub business_rules: Vec<BusinessRule>,
}

/// Cross-field validation rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossFieldRule {
    pub name: String,
    pub fields: Vec<String>,
    pub rule_type: CrossFieldRuleType,
    pub error_message: String,
}

/// Cross-field rule types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CrossFieldRuleType {
    /// All specified fields must be present together
    AllOrNone,
    /// Exactly one of the specified fields must be present
    ExactlyOne,
    /// At least one of the specified fields must be present
    AtLeastOne,
    /// Field values must match
    ValueMatch,
    /// Date range validation (start < end)
    DateRange,
    /// Custom cross-field validation
    Custom { validator: String },
}

/// Business rule definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusinessRule {
    pub name: String,
    pub description: String,
    pub rule_type: BusinessRuleType,
    pub severity: Severity,
    pub error_message: String,
}

/// Business rule types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BusinessRuleType {
    /// Maximum allowed values
    Quota { field: String, max_value: f64 },
    /// Time-based rules
    TimeWindow { start_field: String, end_field: String, max_duration_hours: i64 },
    /// Dependency validation
    Dependency { source_field: String, target_field: String, condition: String },
    /// Custom business logic
    Custom { validator: String, config: Value },
}

/// Validation severity levels
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Severity {
    Error,
    Warning,
    Info,
}

/// Validation statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationStats {
    pub total_validations: u64,
    pub successful_validations: u64,
    pub failed_validations: u64,
    pub average_validation_time_ms: f64,
    pub schema_cache_hits: u64,
    pub schema_cache_misses: u64,
}

/// Main validation manager (simplified for community)
pub struct ValidationManager {
    schemas: Arc<RwLock<HashMap<String, ValidationSchema>>>,
    custom_validators: Arc<RwLock<HashMap<String, Box<dyn CustomValidator>>>>,
    compiled_regex: Arc<RwLock<HashMap<String, Regex>>>,
    stats: Arc<RwLock<ValidationStats>>,
}

use std::sync::Arc;
use tokio::sync::RwLock;

impl std::fmt::Debug for ValidationManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ValidationManager")
            .field("schemas_count", &self.schemas.try_read().map(|s| s.len()).unwrap_or(0))
            .field("validators_count", &self.custom_validators.try_read().map(|v| v.len()).unwrap_or(0))
            .finish()
    }
}

/// Custom validator trait
#[async_trait]
pub trait CustomValidator: Send + Sync {
    async fn validate(&self, value: &Value, context: &ValidationContext) -> Result<ValidationResult, ValidationError>;
    fn name(&self) -> &str;
}

impl ValidationManager {
    /// Create a new validation manager
    pub fn new() -> Self {
        Self {
            schemas: Arc::new(RwLock::new(HashMap::new())),
            custom_validators: Arc::new(RwLock::new(HashMap::new())),
            compiled_regex: Arc::new(RwLock::new(HashMap::new())),
            stats: Arc::new(RwLock::new(ValidationStats {
                total_validations: 0,
                successful_validations: 0,
                failed_validations: 0,
                average_validation_time_ms: 0.0,
                schema_cache_hits: 0,
                schema_cache_misses: 0,
            })),
        }
    }
    
    /// Register a validation schema
    pub async fn register_schema(&self, schema: ValidationSchema) -> Result<(), ValidationError> {
        println!("[ValidationManager] Registering schema: {}", schema.schema_name);
        
        let mut schemas = self.schemas.write().await;
        schemas.insert(schema.schema_name.clone(), schema);
        
        Ok(())
    }
    
    /// Register a custom validator
    pub async fn register_validator(&self, validator: Box<dyn CustomValidator>) -> Result<(), ValidationError> {
        println!("[ValidationManager] Registering validator: {}", validator.name());
        
        let mut validators = self.custom_validators.write().await;
        validators.insert(validator.name().to_string(), validator);
        
        Ok(())
    }
    
    /// Validate data against schema
    pub async fn validate(&self, 
        data: &Value, 
        schema_name: &str, 
        context: &ValidationContext
    ) -> Result<ValidationResult, ValidationError> {
        let start_time = std::time::Instant::now();
        
        // Update stats
        {
            let mut stats = self.stats.write().await;
            stats.total_validations += 1;
        }
        
        println!("[ValidationManager] Validating with schema: {}", schema_name);
        
        // Check validation mode
        if matches!(context.validation_mode, ValidationMode::Disabled) {
            return Ok(ValidationResult {
                is_valid: true,
                errors: vec![],
                warnings: vec![],
                sanitized_data: Some(data.clone()),
                validation_time_ms: start_time.elapsed().as_millis() as u64,
            });
        }
        
        // Get schema
        let schema = {
            let schemas = self.schemas.read().await;
            match schemas.get(schema_name) {
                Some(schema) => {
                    let mut stats = self.stats.write().await;
                    stats.schema_cache_hits += 1;
                    schema.clone()
                },
                None => {
                    let mut stats = self.stats.write().await;
                    stats.schema_cache_misses += 1;
                    return Err(ValidationError::CustomValidationFailed {
                        validator: "schema_lookup".to_string(),
                        reason: format!("Schema '{}' not found", schema_name),
                    });
                }
            }
        };
        
        // Perform validation
        let mut errors = Vec::new();
        let mut warnings = Vec::new();
        let sanitized_data = data.clone();
        
        // Basic field validation
        for rule in &schema.rules {
            if let Err(err) = self.validate_field(&sanitized_data, rule, context).await {
                if matches!(context.validation_mode, ValidationMode::Strict) {
                    errors.push(err);
                } else {
                    warnings.push(format!("Field validation warning: {}", err));
                }
            }
        }
        
        // Cross-field validation
        for rule in &schema.cross_field_rules {
            if let Err(err) = self.validate_cross_field(&sanitized_data, rule, context).await {
                errors.push(err);
            }
        }
        
        // Business rules validation
        for rule in &schema.business_rules {
            if let Err(err) = self.validate_business_rule(&sanitized_data, rule, context).await {
                match rule.severity {
                    Severity::Error => errors.push(err),
                    Severity::Warning => warnings.push(format!("Business rule warning: {}", err)),
                    Severity::Info => warnings.push(format!("Business rule info: {}", err)),
                }
            }
        }
        
        let is_valid = errors.is_empty();
        let validation_time_ms = start_time.elapsed().as_millis() as u64;
        
        // Update stats
        {
            let mut stats = self.stats.write().await;
            if is_valid {
                stats.successful_validations += 1;
            } else {
                stats.failed_validations += 1;
            }
            
            // Update average validation time
            let total = stats.total_validations as f64;
            stats.average_validation_time_ms = 
                (stats.average_validation_time_ms * (total - 1.0) + validation_time_ms as f64) / total;
        }
        
        println!("[ValidationManager] Validation completed: {} ({}ms)", 
            if is_valid { "VALID" } else { "INVALID" }, validation_time_ms);
        
        Ok(ValidationResult {
            is_valid,
            errors,
            warnings,
            sanitized_data: if is_valid { Some(sanitized_data) } else { None },
            validation_time_ms,
        })
    }
    
    /// Get validation statistics
    pub async fn get_stats(&self) -> ValidationStats {
        self.stats.read().await.clone()
    }
    
    /// Clear all cached schemas and validators
    pub async fn clear_cache(&self) -> Result<(), ValidationError> {
        println!("[ValidationManager] Clearing validation cache");
        
        let mut schemas = self.schemas.write().await;
        let mut validators = self.custom_validators.write().await;
        let mut regex_cache = self.compiled_regex.write().await;
        
        schemas.clear();
        validators.clear();
        regex_cache.clear();
        
        Ok(())
    }
    
    // Private validation methods
    
    async fn validate_field(&self, data: &Value, rule: &ValidationRule, _context: &ValidationContext) -> Result<(), ValidationError> {
        // Extract field value
        let field_value = if rule.field_name.contains('.') {
            // Handle nested field access (simplified)
            data.get(&rule.field_name)
        } else {
            data.get(&rule.field_name)
        };
        
        // Check required fields
        if rule.required && (field_value.is_none() || field_value == Some(&Value::Null)) {
            return Err(ValidationError::RequiredFieldMissing {
                field: rule.field_name.clone(),
            });
        }
        
        // If field is not present and not required, skip validation
        let value = match field_value {
            Some(val) if val != &Value::Null => val,
            _ => return Ok(()),
        };
        
        // Validate data type
        self.validate_data_type(value, &rule.data_type, &rule.field_name)?;
        
        // Validate constraints
        for constraint in &rule.constraints {
            self.validate_constraint(value, constraint, &rule.field_name).await?;
        }
        
        Ok(())
    }
    
    fn validate_data_type(&self, value: &Value, data_type: &DataType, field_name: &str) -> Result<(), ValidationError> {
        match data_type {
            DataType::String { min_length, max_length } => {
                if let Some(s) = value.as_str() {
                    if let Some(min) = min_length {
                        if s.len() < *min {
                            return Err(ValidationError::OutOfRange {
                                field: field_name.to_string(),
                                value: format!("length {} < {}", s.len(), min),
                            });
                        }
                    }
                    if let Some(max) = max_length {
                        if s.len() > *max {
                            return Err(ValidationError::OutOfRange {
                                field: field_name.to_string(),
                                value: format!("length {} > {}", s.len(), max),
                            });
                        }
                    }
                } else {
                    return Err(ValidationError::InvalidType {
                        field: field_name.to_string(),
                        expected: "string".to_string(),
                        actual: format!("{:?}", value),
                    });
                }
            },
            DataType::Number { min, max } => {
                if let Some(n) = value.as_f64() {
                    if let Some(min_val) = min {
                        if n < *min_val {
                            return Err(ValidationError::OutOfRange {
                                field: field_name.to_string(),
                                value: format!("{} < {}", n, min_val),
                            });
                        }
                    }
                    if let Some(max_val) = max {
                        if n > *max_val {
                            return Err(ValidationError::OutOfRange {
                                field: field_name.to_string(),
                                value: format!("{} > {}", n, max_val),
                            });
                        }
                    }
                } else {
                    return Err(ValidationError::InvalidType {
                        field: field_name.to_string(),
                        expected: "number".to_string(),
                        actual: format!("{:?}", value),
                    });
                }
            },
            DataType::Boolean => {
                if !value.is_boolean() {
                    return Err(ValidationError::InvalidType {
                        field: field_name.to_string(),
                        expected: "boolean".to_string(),
                        actual: format!("{:?}", value),
                    });
                }
            },
            DataType::Array { .. } => {
                if !value.is_array() {
                    return Err(ValidationError::InvalidType {
                        field: field_name.to_string(),
                        expected: "array".to_string(),
                        actual: format!("{:?}", value),
                    });
                }
            },
            DataType::Object { .. } => {
                if !value.is_object() {
                    return Err(ValidationError::InvalidType {
                        field: field_name.to_string(),
                        expected: "object".to_string(),
                        actual: format!("{:?}", value),
                    });
                }
            },
            DataType::Email => {
                if let Some(s) = value.as_str() {
                    if !s.contains('@') || !s.contains('.') {
                        return Err(ValidationError::InvalidFormat {
                            field: field_name.to_string(),
                            reason: "Invalid email format".to_string(),
                        });
                    }
                } else {
                    return Err(ValidationError::InvalidType {
                        field: field_name.to_string(),
                        expected: "email string".to_string(),
                        actual: format!("{:?}", value),
                    });
                }
            },
            DataType::Uuid => {
                if let Some(s) = value.as_str() {
                    if Uuid::parse_str(s).is_err() {
                        return Err(ValidationError::InvalidFormat {
                            field: field_name.to_string(),
                            reason: "Invalid UUID format".to_string(),
                        });
                    }
                } else {
                    return Err(ValidationError::InvalidType {
                        field: field_name.to_string(),
                        expected: "UUID string".to_string(),
                        actual: format!("{:?}", value),
                    });
                }
            },
            _ => {
                // Other types - simplified validation
            }
        }
        
        Ok(())
    }
    
    async fn validate_constraint(&self, value: &Value, constraint: &Constraint, field_name: &str) -> Result<(), ValidationError> {
        match constraint {
            Constraint::Regex { pattern, .. } => {
                if let Some(s) = value.as_str() {
                    // Get compiled regex or compile it
                    let regex = {
                        let mut regex_cache = self.compiled_regex.write().await;
                        match regex_cache.get(pattern) {
                            Some(r) => r.clone(),
                            None => {
                                let compiled = Regex::new(pattern)
                                    .map_err(|e| ValidationError::InvalidFormat {
                                        field: field_name.to_string(),
                                        reason: format!("Invalid regex pattern: {}", e),
                                    })?;
                                regex_cache.insert(pattern.clone(), compiled.clone());
                                compiled
                            }
                        }
                    };
                    
                    if !regex.is_match(s) {
                        return Err(ValidationError::InvalidFormat {
                            field: field_name.to_string(),
                            reason: format!("Value does not match pattern: {}", pattern),
                        });
                    }
                }
            },
            Constraint::Enum { values } => {
                if let Some(s) = value.as_str() {
                    if !values.contains(&s.to_string()) {
                        return Err(ValidationError::OutOfRange {
                            field: field_name.to_string(),
                            value: format!("'{}' not in allowed values: {:?}", s, values),
                        });
                    }
                }
            },
            _ => {
                // Other constraints - simplified handling
            }
        }
        
        Ok(())
    }
    
    async fn validate_cross_field(&self, _data: &Value, rule: &CrossFieldRule, _context: &ValidationContext) -> Result<(), ValidationError> {
        // Simplified cross-field validation
        println!("[ValidationManager] Cross-field validation: {}", rule.name);
        Ok(())
    }
    
    async fn validate_business_rule(&self, _data: &Value, rule: &BusinessRule, _context: &ValidationContext) -> Result<(), ValidationError> {
        // Simplified business rule validation
        println!("[ValidationManager] Business rule validation: {}", rule.name);
        Ok(())
    }
}

impl Default for ValidationManager {
    fn default() -> Self {
        Self::new()
    }
}