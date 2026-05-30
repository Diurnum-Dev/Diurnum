pub mod ai_adapter;
pub mod approval;
pub mod beancount;
pub mod categorization_rules;
pub mod create;
pub mod data_integrity;
pub mod errors;
pub mod imports;
pub mod ledger_editor;
pub mod open;
pub mod paths;
pub mod reports;
pub mod shell;
pub mod source_accounts;
pub mod types;
pub mod validation;

#[cfg(test)]
mod golden_path_validation;

pub use errors::{WorkspaceError, WorkspaceErrorCode};
pub use types::*;
