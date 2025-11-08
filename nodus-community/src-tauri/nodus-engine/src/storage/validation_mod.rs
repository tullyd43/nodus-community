// src/validation/mod.rs
// Validation Layer - Input validation and security
// Ports ValidationLayer.js and validation-stack.js to Rust

use std::collections::HashMap;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use regex::Regex;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::security::{SecurityManager, SecurityError};
use crate::observability::instrument::instrument;

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

/// Validation context
#[derive(Debug, Clone)]
pub struct ValidationContext {
    pub user_id: String,
    pub session_id: Uuid,
    pub tenant_id: Option<String>,
    pub classification_level: String,
    pub operation: ValidationOperation,
    pub entity_type: String,
    pub strict_mode: bool,
}

#[derive(Debug, Clone)]
pub enum ValidationOperation {
    Create,
    Update,
    Delete,
    Query,
}

/// Field validator trait
#[async_trait]
pub trait FieldValidator: Send + Sync {
    async fn validate(&self, value: &Value, context: &ValidationContext) -> Result<(), ValidationError>;
    fn get_name(&self) -> &str;
    fn is_async(&self) -> bool { false }
}

/// Validation rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationRule {
    pub field: String,
    pub required: bool,
    pub validators: Vec<String>,
    pub conditions: Option<ValidationCondition>,
    pub error_message: Option<String>,
}

/// Validation condition (when to apply rule)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationCondition {
    pub field: String,
    pub operator: ConditionOperator,
    pub value: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConditionOperator {
    Equals,
    NotEquals,
    Contains,
    NotContains,
    GreaterThan,
    LessThan,
    In,
    NotIn,
}

/// Schema definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationSchema {
    pub entity_type: String,
    pub version: String,
    pub rules: Vec<ValidationRule>,
    pub cross_field_rules: Vec<CrossFieldRule>,
    pub business_rules: Vec<BusinessRule>,
    pub security_rules: Vec<SecurityRule>,
}

/// Cross-field validation rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossFieldRule {
    pub name: String,
    pub fields: Vec<String>,
    pub validator: String,
    pub error_message: String,
}

/// Business rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusinessRule {
    pub name: String,
    pub description: String,
    pub validator: String,
    pub severity: RuleSeverity,
    pub error_message: String,
}

/// Security rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityRule {
    pub name: String,
    pub field: String,
    pub classification_required: String,
    pub compartments_required: Vec<String>,
    pub error_message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RuleSeverity {
    Error,
    Warning,
    Info,
}

/// Validation result
#[derive(Debug, Clone)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<String>,
    pub sanitized_data: Option<Value>,
}

/// Main validation layer
pub struct ValidationLayer {
    schemas: HashMap<String, ValidationSchema>,
    validators: HashMap<String, Box<dyn FieldValidator>>,
    security_manager: Option<std::sync::Arc<SecurityManager>>,
    strict_mode: bool,
}

impl ValidationLayer {
    /// Create a new validation layer
    pub fn new() -> Self {
        let mut layer = Self {
            schemas: HashMap::new(),
            validators: HashMap::new(),
            security_manager: None,
            strict_mode: false,
        };
        
        // Register built-in validators
        layer.register_builtin_validators();
        
        layer
    }
    
    /// Set security manager for security validations
    pub fn with_security_manager(mut self, security_manager: std::sync::Arc<SecurityManager>) -> Self {
        self.security_manager = Some(security_manager);
        self
    }
    
    /// Enable strict validation mode
    pub fn with_strict_mode(mut self, strict: bool) -> Self {
        self.strict_mode = strict;
        self
    }
    
    /// Register a validation schema
    pub fn register_schema(&mut self, schema: ValidationSchema) {
        self.schemas.insert(schema.entity_type.clone(), schema);
    }
    
    /// Register a field validator
    pub fn register_validator(&mut self, name: String, validator: Box<dyn FieldValidator>) {
        self.validators.insert(name, validator);
    }
    
    /// Validate data against schema
    pub async fn validate(&self, data: &Value, context: &ValidationContext) -> ValidationResult {
        instrument("validation_validate", || async {
            let mut errors = Vec::new();
            let mut warnings = Vec::new();
            let mut sanitized_data = data.clone();
            
            // Get schema for entity type
            let schema = match self.schemas.get(&context.entity_type) {
                Some(schema) => schema,
                None => {
                    if self.strict_mode {
                        errors.push(ValidationError::CustomValidationFailed {
                            validator: "schema_lookup".to_string(),
                            reason: format!("No schema found for entity type: {}", context.entity_type),
                        });
                        return ValidationResult {
                            valid: false,
                            errors,
                            warnings,
                            sanitized_data: None,
                        };
                    } else {
                        // In non-strict mode, just do basic validation
                        return self.basic_validation(data, context).await;
                    }
                }
            };
            
            // Validate individual fields
            for rule in &schema.rules {
                if let Err(rule_errors) = self.validate_rule(rule, &sanitized_data, context).await {
                    errors.extend(rule_errors);
                }
            }
            
            // Validate cross-field rules
            for cross_rule in &schema.cross_field_rules {
                if let Err(e) = self.validate_cross_field_rule(cross_rule, &sanitized_data, context).await {
                    errors.push(e);
                }
            }
            
            // Validate business rules
            for business_rule in &schema.business_rules {
                match self.validate_business_rule(business_rule, &sanitized_data, context).await {
                    Ok(()) => {}
                    Err(e) => {
                        match business_rule.severity {
                            RuleSeverity::Error => errors.push(e),
                            RuleSeverity::Warning => warnings.push(e.to_string()),
                            RuleSeverity::Info => {} // Just log info-level issues
                        }
                    }
                }
            }
            
            // Validate security rules
            if let Some(ref security_manager) = self.security_manager {
                for security_rule in &schema.security_rules {
                    if let Err(e) = self.validate_security_rule(security_rule, &sanitized_data, context, security_manager).await {
                        errors.push(e);
                    }
                }
            }
            
            // Apply sanitization
            if errors.is_empty() {
                if let Ok(sanitized) = self.sanitize_data(&sanitized_data, schema, context).await {
                    sanitized_data = sanitized;
                }
            }
            
            let valid = errors.is_empty();
            
            ValidationResult {
                valid,
                errors,
                warnings,
                sanitized_data: if valid { Some(sanitized_data) } else { None },
            }
        }).await
    }
    
    // Built-in validators and helper methods implementation continues...
    
    fn register_builtin_validators(&mut self) {
        // Email validator
        self.register_validator("email".to_string(), Box::new(EmailValidator::new()));
        
        // String length validator
        self.register_validator("string_length".to_string(), Box::new(StringLengthValidator::new(1, 1000)));
        
        // Number range validator
        self.register_validator("number_range".to_string(), Box::new(NumberRangeValidator::new(0.0, 1000000.0)));
        
        // UUID validator
        self.register_validator("uuid".to_string(), Box::new(UuidValidator::new()));
        
        // Date validator
        self.register_validator("date".to_string(), Box::new(DateValidator::new()));
        
        // URL validator
        self.register_validator("url".to_string(), Box::new(UrlValidator::new()));
        
        // Phone validator
        self.register_validator("phone".to_string(), Box::new(PhoneValidator::new()));
        
        // Security validators
        self.register_validator("no_sql_injection".to_string(), Box::new(SqlInjectionValidator::new()));
        self.register_validator("no_xss".to_string(), Box::new(XssValidator::new()));
        self.register_validator("no_path_traversal".to_string(), Box::new(PathTraversalValidator::new()));
    }
    
    async fn basic_validation(&self, data: &Value, context: &ValidationContext) -> ValidationResult {
        let mut errors = Vec::new();
        
        // Basic type and format validation
        if let Value::Object(obj) = data {
            for (key, value) in obj {
                // Check for dangerous patterns
                if let Value::String(s) = value {
                    if self.contains_dangerous_patterns(s) {
                        errors.push(ValidationError::SecurityViolation {
                            field: key.clone(),
                            reason: "Contains dangerous patterns".to_string(),
                        });
                    }
                }
            }
        }
        
        ValidationResult {
            valid: errors.is_empty(),
            errors,
            warnings: vec![],
            sanitized_data: Some(data.clone()),
        }
    }
    
    fn contains_dangerous_patterns(&self, input: &str) -> bool {
        let dangerous_patterns = [
            "<script",
            "javascript:",
            "onload=",
            "onerror=",
            "'; DROP TABLE",
            "UNION SELECT",
            "../",
            "..\\",
        ];
        
        let input_lower = input.to_lowercase();
        dangerous_patterns.iter().any(|pattern| input_lower.contains(pattern))
    }
    
    // Additional helper methods would continue here...
    async fn validate_rule(&self, rule: &ValidationRule, data: &Value, context: &ValidationContext) -> Result<(), Vec<ValidationError>> {
        // Implementation continues...
        Ok(())
    }
    
    async fn validate_cross_field_rule(&self, rule: &CrossFieldRule, data: &Value, context: &ValidationContext) -> Result<(), ValidationError> {
        // Implementation continues...
        Ok(())
    }
    
    async fn validate_business_rule(&self, rule: &BusinessRule, data: &Value, context: &ValidationContext) -> Result<(), ValidationError> {
        // Implementation continues...
        Ok(())
    }
    
    async fn validate_security_rule(&self, rule: &SecurityRule, data: &Value, context: &ValidationContext, security_manager: &SecurityManager) -> Result<(), ValidationError> {
        // Implementation continues...
        Ok(())
    }
    
    async fn sanitize_data(&self, data: &Value, schema: &ValidationSchema, context: &ValidationContext) -> Result<Value, ValidationError> {
        // Implementation continues...
        Ok(data.clone())
    }
}

// Built-in validator implementations

#[derive(Debug)]
struct EmailValidator {
    regex: Regex,
}

impl EmailValidator {
    fn new() -> Self {
        Self {
            regex: Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap(),
        }
    }
}

#[async_trait]
impl FieldValidator for EmailValidator {
    async fn validate(&self, value: &Value, _context: &ValidationContext) -> Result<(), ValidationError> {
        match value {
            Value::String(s) => {
                if self.regex.is_match(s) {
                    Ok(())
                } else {
                    Err(ValidationError::InvalidFormat {
                        field: "email".to_string(),
                        reason: "Invalid email format".to_string(),
                    })
                }
            }
            _ => Err(ValidationError::InvalidType {
                field: "email".to_string(),
                expected: "string".to_string(),
                actual: format!("{:?}", value),
            })
        }
    }
    
    fn get_name(&self) -> &str {
        "email"
    }
}

#[derive(Debug)]
struct StringLengthValidator {
    min_length: usize,
    max_length: usize,
}

impl StringLengthValidator {
    fn new(min_length: usize, max_length: usize) -> Self {
        Self { min_length, max_length }
    }
}

#[async_trait]
impl FieldValidator for StringLengthValidator {
    async fn validate(&self, value: &Value, _context: &ValidationContext) -> Result<(), ValidationError> {
        match value {
            Value::String(s) => {
                let len = s.len();
                if len < self.min_length {
                    Err(ValidationError::OutOfRange {
                        field: "string_length".to_string(),
                        value: format!("Length {} is below minimum {}", len, self.min_length),
                    })
                } else if len > self.max_length {
                    Err(ValidationError::OutOfRange {
                        field: "string_length".to_string(),
                        value: format!("Length {} exceeds maximum {}", len, self.max_length),
                    })
                } else {
                    Ok(())
                }
            }
            _ => Err(ValidationError::InvalidType {
                field: "string_length".to_string(),
                expected: "string".to_string(),
                actual: format!("{:?}", value),
            })
        }
    }
    
    fn get_name(&self) -> &str {
        "string_length"
    }
}

#[derive(Debug)]
struct NumberRangeValidator {
    min_value: f64,
    max_value: f64,
}

impl NumberRangeValidator {
    fn new(min_value: f64, max_value: f64) -> Self {
        Self { min_value, max_value }
    }
}

#[async_trait]
impl FieldValidator for NumberRangeValidator {
    async fn validate(&self, value: &Value, _context: &ValidationContext) -> Result<(), ValidationError> {
        match value {
            Value::Number(n) => {
                let num = n.as_f64().unwrap_or(0.0);
                if num < self.min_value {
                    Err(ValidationError::OutOfRange {
                        field: "number_range".to_string(),
                        value: format!("{} is below minimum {}", num, self.min_value),
                    })
                } else if num > self.max_value {
                    Err(ValidationError::OutOfRange {
                        field: "number_range".to_string(),
                        value: format!("{} exceeds maximum {}", num, self.max_value),
                    })
                } else {
                    Ok(())
                }
            }
            _ => Err(ValidationError::InvalidType {
                field: "number_range".to_string(),
                expected: "number".to_string(),
                actual: format!("{:?}", value),
            })
        }
    }
    
    fn get_name(&self) -> &str {
        "number_range"
    }
}

#[derive(Debug)]
struct UuidValidator;

impl UuidValidator {
    fn new() -> Self {
        Self
    }
}

#[async_trait]
impl FieldValidator for UuidValidator {
    async fn validate(&self, value: &Value, _context: &ValidationContext) -> Result<(), ValidationError> {
        match value {
            Value::String(s) => {
                if Uuid::parse_str(s).is_ok() {
                    Ok(())
                } else {
                    Err(ValidationError::InvalidFormat {
                        field: "uuid".to_string(),
                        reason: "Invalid UUID format".to_string(),
                    })
                }
            }
            _ => Err(ValidationError::InvalidType {
                field: "uuid".to_string(),
                expected: "string".to_string(),
                actual: format!("{:?}", value),
            })
        }
    }
    
    fn get_name(&self) -> &str {
        "uuid"
    }
}

#[derive(Debug)]
struct DateValidator;

impl DateValidator {
    fn new() -> Self {
        Self
    }
}

#[async_trait]
impl FieldValidator for DateValidator {
    async fn validate(&self, value: &Value, _context: &ValidationContext) -> Result<(), ValidationError> {
        match value {
            Value::String(s) => {
                if DateTime::parse_from_rfc3339(s).is_ok() {
                    Ok(())
                } else {
                    Err(ValidationError::InvalidFormat {
                        field: "date".to_string(),
                        reason: "Invalid date format (expected RFC3339)".to_string(),
                    })
                }
            }
            _ => Err(ValidationError::InvalidType {
                field: "date".to_string(),
                expected: "string".to_string(),
                actual: format!("{:?}", value),
            })
        }
    }
    
    fn get_name(&self) -> &str {
        "date"
    }
}

#[derive(Debug)]
struct UrlValidator {
    regex: Regex,
}

impl UrlValidator {
    fn new() -> Self {
        Self {
            regex: Regex::new(r"^https?://[^\s/$.?#].[^\s]*$").unwrap(),
        }
    }
}

#[async_trait]
impl FieldValidator for UrlValidator {
    async fn validate(&self, value: &Value, _context: &ValidationContext) -> Result<(), ValidationError> {
        match value {
            Value::String(s) => {
                if self.regex.is_match(s) {
                    Ok(())
                } else {
                    Err(ValidationError::InvalidFormat {
                        field: "url".to_string(),
                        reason: "Invalid URL format".to_string(),
                    })
                }
            }
            _ => Err(ValidationError::InvalidType {
                field: "url".to_string(),
                expected: "string".to_string(),
                actual: format!("{:?}", value),
            })
        }
    }
    
    fn get_name(&self) -> &str {
        "url"
    }
}

#[derive(Debug)]
struct PhoneValidator {
    regex: Regex,
}

impl PhoneValidator {
    fn new() -> Self {
        Self {
            regex: Regex::new(r"^\+?[1-9]\d{1,14}$").unwrap(),
        }
    }
}

#[async_trait]
impl FieldValidator for PhoneValidator {
    async fn validate(&self, value: &Value, _context: &ValidationContext) -> Result<(), ValidationError> {
        match value {
            Value::String(s) => {
                let cleaned = s.replace([' ', '-', '(', ')', '.'], "");
                if self.regex.is_match(&cleaned) {
                    Ok(())
                } else {
                    Err(ValidationError::InvalidFormat {
                        field: "phone".to_string(),
                        reason: "Invalid phone number format".to_string(),
                    })
                }
            }
            _ => Err(ValidationError::InvalidType {
                field: "phone".to_string(),
                expected: "string".to_string(),
                actual: format!("{:?}", value),
            })
        }
    }
    
    fn get_name(&self) -> &str {
        "phone"
    }
}

#[derive(Debug)]
struct SqlInjectionValidator;

impl SqlInjectionValidator {
    fn new() -> Self {
        Self
    }
}

#[async_trait]
impl FieldValidator for SqlInjectionValidator {
    async fn validate(&self, value: &Value, _context: &ValidationContext) -> Result<(), ValidationError> {
        match value {
            Value::String(s) => {
                let dangerous_patterns = [
                    "'; DROP TABLE",
                    "' OR '1'='1",
                    "UNION SELECT",
                    "INSERT INTO",
                    "DELETE FROM",
                    "UPDATE SET",
                    "EXEC(",
                    "sp_",
                    "xp_",
                    "--",
                    "/*",
                    "*/",
                ];
                
                let input_upper = s.to_uppercase();
                for pattern in &dangerous_patterns {
                    if input_upper.contains(pattern) {
                        return Err(ValidationError::SecurityViolation {
                            field: "sql_injection".to_string(),
                            reason: format!("Contains potential SQL injection pattern: {}", pattern),
                        });
                    }
                }
                Ok(())
            }
            _ => Ok(()), // Non-strings can't contain SQL injection
        }
    }
    
    fn get_name(&self) -> &str {
        "no_sql_injection"
    }
}

#[derive(Debug)]
struct XssValidator;

impl XssValidator {
    fn new() -> Self {
        Self
    }
}

#[async_trait]
impl FieldValidator for XssValidator {
    async fn validate(&self, value: &Value, _context: &ValidationContext) -> Result<(), ValidationError> {
        match value {
            Value::String(s) => {
                let dangerous_patterns = [
                    "<script",
                    "</script>",
                    "javascript:",
                    "onload=",
                    "onerror=",
                    "onclick=",
                    "onmouseover=",
                    "onfocus=",
                    "onblur=",
                    "onchange=",
                    "onsubmit=",
                    "vbscript:",
                    "data:text/html",
                ];
                
                let input_lower = s.to_lowercase();
                for pattern in &dangerous_patterns {
                    if input_lower.contains(pattern) {
                        return Err(ValidationError::SecurityViolation {
                            field: "xss".to_string(),
                            reason: format!("Contains potential XSS pattern: {}", pattern),
                        });
                    }
                }
                Ok(())
            }
            _ => Ok(()), // Non-strings can't contain XSS
        }
    }
    
    fn get_name(&self) -> &str {
        "no_xss"
    }
}

#[derive(Debug)]
struct PathTraversalValidator;

impl PathTraversalValidator {
    fn new() -> Self {
        Self
    }
}

#[async_trait]
impl FieldValidator for PathTraversalValidator {
    async fn validate(&self, value: &Value, _context: &ValidationContext) -> Result<(), ValidationError> {
        match value {
            Value::String(s) => {
                let dangerous_patterns = [
                    "../",
                    "..\\",
                    "..%2f",
                    "..%5c",
                    "%2e%2e%2f",
                    "%2e%2e%5c",
                ];
                
                let input_lower = s.to_lowercase();
                for pattern in &dangerous_patterns {
                    if input_lower.contains(pattern) {
                        return Err(ValidationError::SecurityViolation {
                            field: "path_traversal".to_string(),
                            reason: format!("Contains potential path traversal pattern: {}", pattern),
                        });
                    }
                }
                Ok(())
            }
            _ => Ok(()), // Non-strings can't contain path traversal
        }
    }
    
    fn get_name(&self) -> &str {
        "no_path_traversal"
    }
}
