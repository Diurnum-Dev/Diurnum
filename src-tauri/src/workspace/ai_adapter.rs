use crate::workspace::categorization_rules::{
    ensure_categorization_rules_table, list_categorization_rules, CategorizationRule,
};
use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use crate::workspace::imports::ensure_import_tables;
use crate::workspace::types::WorkspaceManifest;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const ADAPTER_CONFIG_KEY: &str = "byo_ai_adapter_command";

/// Upper bound for a single adapter invocation. A wedged or interactive
/// adapter must never block the app indefinitely.
const ADAPTER_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAdapterConfig {
    pub command: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigureAiAdapterInput {
    pub workspace_root_path: String,
    pub command: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiContextDisclosure {
    pub adapter_configured: bool,
    pub fields_sent: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CuratedLedgerContext {
    pub statement_row: AiStatementRowContext,
    pub source_account: String,
    pub chart_of_accounts: Vec<String>,
    pub categorization_rules: Vec<CategorizationRule>,
    pub similar_approved_entries: Vec<SimilarApprovedEntry>,
    pub business_profile: AiBusinessProfile,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatementRowContext {
    pub posted_date: String,
    pub description: String,
    pub source_amount: String,
    pub source_file_name: String,
    pub import_fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimilarApprovedEntry {
    pub description: String,
    pub source_account: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiBusinessProfile {
    pub name: String,
    pub base_currency: String,
    pub books_start_date: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSuggestion {
    pub ledger_account: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_account: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_amount: Option<String>,
    pub payee: Option<String>,
    pub narration: Option<String>,
    pub confidence: Option<f64>,
    pub explanation: Option<String>,
    pub needs_human_attention: bool,
}

pub(crate) trait AiSuggestionRow {
    fn posted_date(&self) -> &str;
    fn description(&self) -> &str;
    fn source_account(&self) -> &str;
    fn source_amount(&self) -> &str;
    fn source_file_name(&self) -> &str;
    fn import_fingerprint(&self) -> &str;
}

pub fn get_ai_adapter_config(
    workspace_root_path: impl AsRef<Path>,
) -> Result<AiAdapterConfig, WorkspaceError> {
    let connection = open_connection(workspace_root_path.as_ref())?;
    ensure_ai_adapter_table(&connection)?;
    Ok(AiAdapterConfig {
        command: load_adapter_command(&connection)?,
    })
}

pub fn configure_ai_adapter(
    input: ConfigureAiAdapterInput,
) -> Result<AiAdapterConfig, WorkspaceError> {
    let connection = open_connection(Path::new(&input.workspace_root_path))?;
    ensure_ai_adapter_table(&connection)?;
    let command = input.command.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    match &command {
        Some(command) => {
            connection.execute(
                "
                insert into ai_adapter_config (key, value)
                values (?1, ?2)
                on conflict(key) do update set value = excluded.value
                ",
                params![ADAPTER_CONFIG_KEY, command],
            )?;
        }
        None => {
            connection.execute(
                "delete from ai_adapter_config where key = ?1",
                [ADAPTER_CONFIG_KEY],
            )?;
        }
    }
    Ok(AiAdapterConfig { command })
}

pub fn get_ai_context_disclosure(
    workspace_root_path: impl AsRef<Path>,
) -> Result<AiContextDisclosure, WorkspaceError> {
    let config = get_ai_adapter_config(workspace_root_path)?;
    Ok(AiContextDisclosure {
        adapter_configured: config.command.is_some(),
        fields_sent: vec![
            "Statement Row: posted date, description, source amount, source file name, import fingerprint".to_string(),
            "Source Account".to_string(),
            "Chart of Accounts".to_string(),
            "Categorization Rules".to_string(),
            "Similar approved entries".to_string(),
            "Business profile: name, base currency, books start date".to_string(),
        ],
    })
}

pub(crate) fn suggestion_for_row<T: AiSuggestionRow>(
    root: &Path,
    connection: &Connection,
    row: &T,
) -> Result<Option<AiSuggestion>, WorkspaceError> {
    ensure_ai_adapter_table(connection)?;
    ensure_import_tables(connection)?;
    let Some(command) = load_adapter_command(connection)? else {
        return Ok(None);
    };
    let context = build_curated_context(root, connection, row)?;
    invoke_adapter(&command, &context).map(Some)
}

fn build_curated_context<T: AiSuggestionRow>(
    root: &Path,
    connection: &Connection,
    row: &T,
) -> Result<CuratedLedgerContext, WorkspaceError> {
    ensure_categorization_rules_table(connection)?;
    let manifest = read_manifest(root)?;
    Ok(CuratedLedgerContext {
        statement_row: AiStatementRowContext {
            posted_date: row.posted_date().to_string(),
            description: row.description().to_string(),
            source_amount: row.source_amount().to_string(),
            source_file_name: row.source_file_name().to_string(),
            import_fingerprint: row.import_fingerprint().to_string(),
        },
        source_account: row.source_account().to_string(),
        chart_of_accounts: read_chart_of_accounts(root)?,
        categorization_rules: list_categorization_rules(root)?,
        similar_approved_entries: load_similar_approved_entries(
            connection,
            row.source_account(),
            row.description(),
        )?,
        business_profile: AiBusinessProfile {
            name: manifest.business.name,
            base_currency: manifest.business.base_currency,
            books_start_date: manifest.business.books_start_date,
        },
    })
}

pub(crate) fn invoke_adapter_raw(command: &str, payload: &[u8]) -> Result<Vec<u8>, WorkspaceError> {
    invoke_adapter_raw_with_timeout(command, payload, ADAPTER_TIMEOUT)
}

fn invoke_adapter_raw_with_timeout(
    command: &str,
    payload: &[u8],
    timeout: Duration,
) -> Result<Vec<u8>, WorkspaceError> {
    let parts = split_command(command)?;
    let Some((program, args)) = parts.split_first() else {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "BYO AI Adapter command cannot be empty.",
        ));
    };
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| WorkspaceError::io(format!("BYO AI Adapter failed to start: {error}")))?;

    // The pipes are pumped on helper threads so a full pipe buffer can never
    // deadlock the child while we poll for exit.
    let mut stdin = child.stdin.take().ok_or_else(|| {
        WorkspaceError::io("BYO AI Adapter stdin was not available.".to_string())
    })?;
    let payload = payload.to_vec();
    let stdin_writer = thread::spawn(move || stdin.write_all(&payload));

    let mut stdout = child.stdout.take().ok_or_else(|| {
        WorkspaceError::io("BYO AI Adapter stdout was not available.".to_string())
    })?;
    let stdout_reader = thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stdout.read_to_end(&mut buffer);
        buffer
    });

    let mut stderr = child.stderr.take().ok_or_else(|| {
        WorkspaceError::io("BYO AI Adapter stderr was not available.".to_string())
    })?;
    let stderr_reader = thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stderr.read_to_end(&mut buffer);
        buffer
    });

    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdin_writer.join();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err(WorkspaceError::io(format!(
                "BYO AI Adapter did not finish within {} seconds and was stopped.",
                timeout.as_secs()
            )));
        }
        thread::sleep(Duration::from_millis(10));
    };

    let _ = stdin_writer.join();
    let stdout = stdout_reader
        .join()
        .map_err(|_| WorkspaceError::io("BYO AI Adapter stdout reader failed.".to_string()))?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| WorkspaceError::io("BYO AI Adapter stderr reader failed.".to_string()))?;
    if !status.success() {
        return Err(WorkspaceError::io(format!(
            "BYO AI Adapter exited unsuccessfully: {}",
            String::from_utf8_lossy(&stderr)
        )));
    }
    Ok(stdout)
}

fn invoke_adapter(
    command: &str,
    context: &CuratedLedgerContext,
) -> Result<AiSuggestion, WorkspaceError> {
    let payload =
        serde_json::to_vec(context).map_err(|error| WorkspaceError::io(error.to_string()))?;
    let stdout = invoke_adapter_raw(command, &payload)?;
    serde_json::from_slice::<AiSuggestion>(&stdout).map_err(|error| {
        WorkspaceError::io(format!("BYO AI Adapter returned invalid JSON: {error}"))
    })
}

pub(crate) fn split_command(command: &str) -> Result<Vec<String>, WorkspaceError> {
    let parts = command
        .split_whitespace()
        .map(str::to_string)
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "BYO AI Adapter command cannot be empty.",
        ));
    }
    Ok(parts)
}

pub(crate) fn read_manifest(root: &Path) -> Result<WorkspaceManifest, WorkspaceError> {
    serde_json::from_str(&fs::read_to_string(
        root.join(".diurnum").join("workspace.json"),
    )?)
    .map_err(|error| WorkspaceError::io(error.to_string()))
}

pub(crate) fn read_chart_of_accounts(root: &Path) -> Result<Vec<String>, WorkspaceError> {
    let accounts = fs::read_to_string(root.join("accounts.bean"))?;
    Ok(accounts
        .lines()
        .filter_map(|line| {
            let parts = line.split_whitespace().collect::<Vec<_>>();
            if parts.len() == 4 && parts[1] == "open" {
                Some(parts[2].to_string())
            } else {
                None
            }
        })
        .collect())
}

fn load_similar_approved_entries(
    connection: &Connection,
    source_account: &str,
    description: &str,
) -> Result<Vec<SimilarApprovedEntry>, WorkspaceError> {
    let keyword = description
        .split_whitespace()
        .next()
        .unwrap_or(description)
        .to_lowercase();
    let mut statement = connection.prepare(
        "
        select description, source_account
        from statement_rows
        where status = 'accounted'
          and source_account = ?1
        order by posted_date desc
        limit 8
        ",
    )?;
    let rows = statement
        .query_map([source_account], |row| {
            Ok(SimilarApprovedEntry {
                description: row.get(0)?,
                source_account: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows
        .into_iter()
        .filter(|row| row.description.to_lowercase().contains(&keyword))
        .collect())
}

pub(crate) fn ensure_ai_adapter_table(connection: &Connection) -> Result<(), WorkspaceError> {
    connection.execute_batch(
        "
        create table if not exists ai_adapter_config (
          key text primary key,
          value text not null
        );
        ",
    )?;
    Ok(())
}

pub(crate) fn load_adapter_command(
    connection: &Connection,
) -> Result<Option<String>, WorkspaceError> {
    connection
        .query_row(
            "select value from ai_adapter_config where key = ?1",
            [ADAPTER_CONFIG_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(WorkspaceError::from)
}

pub(crate) fn open_connection(root: &Path) -> Result<Connection, WorkspaceError> {
    Ok(Connection::open(
        root.join(".diurnum").join("diurnum.sqlite"),
    )?)
}

#[cfg(test)]
mod tests {
    use crate::workspace::ai_adapter::{
        configure_ai_adapter, get_ai_adapter_config, get_ai_context_disclosure,
        invoke_adapter_raw_with_timeout, suggestion_for_row, AiSuggestionRow,
        ConfigureAiAdapterInput,
    };
    use crate::workspace::create::create_workspace;
    use crate::workspace::types::CreateWorkspaceInput;
    use rusqlite::Connection;
    use std::fs;
    use std::path::Path;
    use std::time::{Duration, Instant};

    struct TestRow;

    #[test]
    fn unresponsive_adapter_is_killed_after_timeout() {
        let started = Instant::now();
        let error = invoke_adapter_raw_with_timeout("sleep 30", b"{}", Duration::from_millis(200))
            .unwrap_err();

        assert!(error.message.contains("did not finish"));
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    impl AiSuggestionRow for TestRow {
        fn posted_date(&self) -> &str {
            "2026-01-04"
        }

        fn description(&self) -> &str {
            "Software"
        }

        fn source_account(&self) -> &str {
            "Assets:Bank:Operating-Checking"
        }

        fn source_amount(&self) -> &str {
            "-29.99"
        }

        fn source_file_name(&self) -> &str {
            "checking.csv"
        }

        fn import_fingerprint(&self) -> &str {
            "fingerprint-1"
        }
    }

    #[test]
    fn adapter_is_optional_by_default() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        let connection = Connection::open(
            Path::new(&created.root_path)
                .join(".diurnum")
                .join("diurnum.sqlite"),
        )
        .unwrap();

        assert_eq!(
            get_ai_adapter_config(&created.root_path).unwrap().command,
            None
        );
        assert!(
            suggestion_for_row(Path::new(&created.root_path), &connection, &TestRow)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn stores_config_and_discloses_sent_context() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();

        let config = configure_ai_adapter(ConfigureAiAdapterInput {
            workspace_root_path: created.root_path.clone(),
            command: Some("adapter --json".to_string()),
        })
        .unwrap();
        let disclosure = get_ai_context_disclosure(&created.root_path).unwrap();

        assert_eq!(config.command.as_deref(), Some("adapter --json"));
        assert!(disclosure.adapter_configured);
        assert!(disclosure
            .fields_sent
            .iter()
            .any(|field| field.contains("Statement Row")));
    }

    #[test]
    fn invokes_configured_adapter_with_curated_context() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        let adapter_path = tempdir.path().join("adapter.sh");
        fs::write(
            &adapter_path,
            "#!/bin/sh\ncat >/dev/null\nprintf '%s' '{\"ledgerAccount\":\"Expenses:Software\",\"payee\":\"Vendor\",\"narration\":\"Software\",\"confidence\":0.91,\"explanation\":\"Matched software vendor.\",\"needsHumanAttention\":false}'\n",
        )
        .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&adapter_path).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&adapter_path, permissions).unwrap();
        }
        configure_ai_adapter(ConfigureAiAdapterInput {
            workspace_root_path: created.root_path.clone(),
            command: Some(adapter_path.to_string_lossy().to_string()),
        })
        .unwrap();
        let connection = Connection::open(
            Path::new(&created.root_path)
                .join(".diurnum")
                .join("diurnum.sqlite"),
        )
        .unwrap();

        let suggestion = suggestion_for_row(Path::new(&created.root_path), &connection, &TestRow)
            .unwrap()
            .unwrap();

        assert_eq!(
            suggestion.ledger_account.as_deref(),
            Some("Expenses:Software")
        );
        assert_eq!(suggestion.confidence, Some(0.91));
        assert!(!suggestion.needs_human_attention);
    }
}
