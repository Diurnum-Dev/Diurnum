use crate::workspace::ai_adapter::{invoke_adapter_raw, AiBusinessProfile, SimilarApprovedEntry};
use crate::workspace::categorization_rules::CategorizationRule;
use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use serde::{Deserialize, Serialize};

pub const AI_ASSIST_CHUNK_SIZE: usize = 40;
pub const NEEDS_EYE_CONFIDENCE_THRESHOLD: f64 = 0.6;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchSuggestionRequest {
    pub r#type: String,
    pub version: u32,
    pub shared_context: SharedContext,
    pub rows: Vec<BatchRow>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedContext {
    pub chart_of_accounts: Vec<String>,
    pub categorization_rules: Vec<CategorizationRule>,
    pub business_profile: AiBusinessProfile,
    pub recent_approved_entries: Vec<SimilarApprovedEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchRow {
    pub id: String,
    pub posted_date: String,
    pub description: String,
    pub source_account: String,
    pub source_amount: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchSuggestionResponse {
    #[serde(default)]
    pub suggestions: Vec<BatchSuggestion>,
    #[serde(default)]
    pub proposed_rules: Vec<ProposedRule>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchSuggestion {
    pub row_id: String,
    pub ledger_account: Option<String>,
    #[serde(default)]
    pub payee: Option<String>,
    #[serde(default)]
    pub narration: Option<String>,
    #[serde(default)]
    pub confidence: Option<f64>,
    #[serde(default)]
    pub explanation: Option<String>,
    #[serde(default)]
    pub needs_human_attention: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposedRule {
    pub match_text: String,
    pub source_account: String,
    pub ledger_account: String,
    #[serde(default)]
    pub matched_row_ids: Vec<String>,
}

pub(crate) fn invoke_batch_adapter(
    command: &str,
    request: &BatchSuggestionRequest,
) -> Result<BatchSuggestionResponse, WorkspaceError> {
    let payload =
        serde_json::to_vec(request).map_err(|error| WorkspaceError::io(error.to_string()))?;
    let stdout = invoke_adapter_raw(command, &payload)?;
    serde_json::from_slice::<BatchSuggestionResponse>(&stdout).map_err(|error| {
        WorkspaceError::io(format!(
            "BYO AI Adapter returned invalid batch JSON: {error}"
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    pub(crate) fn write_adapter_script(dir: &std::path::Path, response_json: &str) -> String {
        let adapter_path = dir.join("batch-adapter.sh");
        fs::write(
            &adapter_path,
            format!("#!/bin/sh\ncat > \"$0.received\"\nprintf '%s' '{response_json}'\n"),
        )
        .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&adapter_path).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&adapter_path, permissions).unwrap();
        }
        adapter_path.to_string_lossy().to_string()
    }

    #[test]
    fn batch_adapter_round_trips_versioned_envelope() {
        let tempdir = tempfile::tempdir().unwrap();
        let command = write_adapter_script(
            tempdir.path(),
            r#"{"suggestions":[{"rowId":"row-1","ledgerAccount":"Expenses:Software","payee":"Autobooks","narration":"Monthly fee","confidence":0.93,"explanation":"Matched vendor.","needsHumanAttention":false}],"proposedRules":[{"matchText":"WEB PMTS Autobooks","sourceAccount":"Assets:Bank:Checking","ledgerAccount":"Expenses:Software","matchedRowIds":["row-1"]}]}"#,
        );
        let request = BatchSuggestionRequest {
            r#type: "batchSuggestionRequest".to_string(),
            version: 1,
            shared_context: SharedContext {
                chart_of_accounts: vec!["Expenses:Software".to_string()],
                categorization_rules: vec![],
                business_profile: crate::workspace::ai_adapter::AiBusinessProfile {
                    name: "Acme".to_string(),
                    base_currency: "USD".to_string(),
                    books_start_date: "2026-01-01".to_string(),
                },
                recent_approved_entries: vec![],
            },
            rows: vec![BatchRow {
                id: "row-1".to_string(),
                posted_date: "2026-05-07".to_string(),
                description: "WEB PMTS Autobooks, Inc. WEB".to_string(),
                source_account: "Assets:Bank:Checking".to_string(),
                source_amount: "-0.50".to_string(),
            }],
        };

        let response = invoke_batch_adapter(&command, &request).unwrap();

        assert_eq!(response.suggestions.len(), 1);
        assert_eq!(response.suggestions[0].row_id, "row-1");
        assert_eq!(
            response.suggestions[0].ledger_account.as_deref(),
            Some("Expenses:Software")
        );
        assert_eq!(response.proposed_rules.len(), 1);
        let received = fs::read_to_string(format!("{command}.received")).unwrap();
        assert!(received.contains("\"type\":\"batchSuggestionRequest\""));
        assert!(received.contains("\"version\":1"));
        assert!(received.contains("\"chartOfAccounts\""));
    }

    #[test]
    fn batch_adapter_bad_json_is_an_error() {
        let tempdir = tempfile::tempdir().unwrap();
        let command = write_adapter_script(tempdir.path(), "not json");
        let request = BatchSuggestionRequest {
            r#type: "batchSuggestionRequest".to_string(),
            version: 1,
            shared_context: SharedContext {
                chart_of_accounts: vec![],
                categorization_rules: vec![],
                business_profile: crate::workspace::ai_adapter::AiBusinessProfile {
                    name: "Acme".to_string(),
                    base_currency: "USD".to_string(),
                    books_start_date: "2026-01-01".to_string(),
                },
                recent_approved_entries: vec![],
            },
            rows: vec![],
        };
        assert!(invoke_batch_adapter(&command, &request).is_err());
    }
}
