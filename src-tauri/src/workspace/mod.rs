pub mod ai_adapter;
pub mod ai_assist;
pub mod approval;
pub mod beancount;
pub mod categorization_rules;
pub mod create;
pub mod data_integrity;
pub mod documents;
pub mod errors;
pub mod git;
pub mod imports;
pub mod ledger_editor;
pub mod open;
pub mod paths;
pub mod rename_account;
pub mod reports;
pub mod settings;
pub mod shell;
pub mod source_accounts;
pub mod types;
pub mod validation;
pub mod view;

#[cfg(test)]
mod golden_path_validation;

pub use errors::{WorkspaceError, WorkspaceErrorCode};
pub use types::*;
