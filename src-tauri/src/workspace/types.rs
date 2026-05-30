use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceInput {
    pub business_name: String,
    pub base_currency: String,
    pub books_start_date: String,
    pub parent_directory: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBusiness {
    pub name: String,
    pub base_currency: String,
    pub books_start_date: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLayout {
    pub main_file: String,
    pub accounts_file: String,
    pub opening_balances_file: String,
    pub transactions_directory: String,
    pub documents_directory: String,
    pub imports_directory: String,
    pub app_directory: String,
    pub sqlite_file: String,
}

impl Default for WorkspaceLayout {
    fn default() -> Self {
        Self {
            main_file: "main.bean".to_string(),
            accounts_file: "accounts.bean".to_string(),
            opening_balances_file: "opening-balances.bean".to_string(),
            transactions_directory: "transactions".to_string(),
            documents_directory: "documents".to_string(),
            imports_directory: "imports".to_string(),
            app_directory: ".diurnum".to_string(),
            sqlite_file: ".diurnum/diurnum.sqlite".to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceManifest {
    pub schema_version: u8,
    pub app_created: bool,
    pub business: WorkspaceBusiness,
    pub layout: WorkspaceLayout,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub editor_session: Option<LedgerEditorSession>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEditorSession {
    pub open_tabs: Vec<LedgerEditorTabSession>,
    pub active_tab: String,
    #[serde(default)]
    pub recently_closed_tabs: Vec<LedgerEditorTabSession>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEditorTabSession {
    pub relative_path: String,
    pub cursor: usize,
    pub scroll_top: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub root_path: String,
    pub business_name: String,
    pub base_currency: String,
    pub books_start_date: String,
    pub ledger_status: LedgerStatus,
    pub ledger_validation: LedgerValidationSummary,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LedgerStatus {
    Valid,
    Invalid,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerValidationSummary {
    pub status: LedgerStatus,
    pub errors: Vec<String>,
}
