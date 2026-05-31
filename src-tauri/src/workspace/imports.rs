use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use crate::workspace::source_accounts::documents_slug_for_account;
use crate::workspace::types::WorkspaceManifest;
use chrono::{NaiveDate, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvImportInput {
    pub workspace_root_path: String,
    pub source_account: String,
    pub source_file_name: String,
    pub csv_contents: String,
    pub mapping: Option<CsvSourceMappingInput>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvSourceMappingInput {
    pub posted_date_column: String,
    pub description_column: String,
    pub amount_column: Option<String>,
    pub debit_column: Option<String>,
    pub credit_column: Option<String>,
    /// When set together with `debit_type_value`, the value of this column in
    /// each row determines the sign of `amount_column`.  Rows whose type value
    /// matches `debit_type_value` (case-insensitive) are negated; all other
    /// rows keep their sign.  Ignored when `amount_column` is not set.
    pub transaction_type_column: Option<String>,
    /// The value in `transaction_type_column` that marks a row as a debit
    /// (money leaving the account).  Defaults to `"Debit"` when not specified.
    pub debit_type_value: Option<String>,
    pub memo_column: Option<String>,
    pub reference_id_column: Option<String>,
    pub payee_column: Option<String>,
    pub category_column: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvImportResult {
    pub source_account: String,
    pub imported_count: usize,
    pub skipped_duplicate_count: usize,
}

pub fn import_statement_rows(input: CsvImportInput) -> Result<CsvImportResult, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    ensure_app_created_workspace(root)?;
    ensure_source_account_exists(root, &input.source_account)?;

    let rows = parse_csv(&input.csv_contents)?;
    if rows.is_empty() {
        return Ok(CsvImportResult {
            source_account: input.source_account,
            imported_count: 0,
            skipped_duplicate_count: 0,
        });
    }

    let sqlite_path = root.join(".diurnum").join("diurnum.sqlite");
    let connection = Connection::open(sqlite_path)?;
    ensure_import_tables(&connection)?;
    let mapping = match input.mapping {
        Some(mapping) => {
            save_source_mapping(&connection, &input.source_account, &mapping)?;
            mapping
        }
        None => load_source_mapping(&connection, &input.source_account)?,
    };

    let mut imported_count = 0;
    let mut skipped_duplicate_count = 0;
    let now = Utc::now().to_rfc3339();

    for row in rows {
        let posted_date_raw = required_value(&row, &mapping.posted_date_column)?;
        let posted_date = normalize_posted_date(&posted_date_raw)?;
        let description = required_value(&row, &mapping.description_column)?;
        let source_amount = required_source_amount(&row, &mapping)?;
        let import_fingerprint = import_fingerprint(
            &input.source_account,
            &posted_date,
            &description,
            &source_amount,
        );
        if statement_row_exists(&connection, &input.source_account, &import_fingerprint)? {
            skipped_duplicate_count += 1;
            continue;
        }
        let raw_row_json =
            serde_json::to_string(&row).map_err(|error| WorkspaceError::io(error.to_string()))?;
        let supporting_fields_json = serde_json::to_string(&json!({
            "memo": optional_value(&row, mapping.memo_column.as_deref()),
            "referenceId": optional_value(&row, mapping.reference_id_column.as_deref()),
            "payee": optional_value(&row, mapping.payee_column.as_deref()),
            "category": optional_value(&row, mapping.category_column.as_deref()),
        }))
        .map_err(|error| WorkspaceError::io(error.to_string()))?;

        connection.execute(
            "
            insert into statement_rows (
              id,
              source_account,
              source_file_name,
              posted_date,
              description,
              source_amount,
              import_fingerprint,
              supporting_fields_json,
              raw_row_json,
              status,
              imported_at
            ) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10)
            ",
            params![
                Uuid::new_v4().to_string(),
                input.source_account,
                input.source_file_name,
                posted_date,
                description,
                source_amount,
                import_fingerprint,
                supporting_fields_json,
                raw_row_json,
                now
            ],
        )?;
        imported_count += 1;
    }

    auto_file_import_csv(root, &input.source_account, &input.source_file_name, &input.csv_contents)?;

    Ok(CsvImportResult {
        source_account: input.source_account,
        imported_count,
        skipped_duplicate_count,
    })
}

fn auto_file_import_csv(
    root: &Path,
    source_account: &str,
    source_file_name: &str,
    csv_contents: &str,
) -> Result<(), WorkspaceError> {
    let folder = root
        .join("documents")
        .join(documents_slug_for_account(source_account));
    fs::create_dir_all(&folder)?;
    let safe_name = sanitize_file_name(source_file_name, "import.csv");
    let dated_name = format!("{}_{}", Utc::now().format("%Y-%m-%d"), safe_name);
    fs::write(folder.join(dated_name), csv_contents)?;
    Ok(())
}

fn sanitize_file_name(file_name: &str, fallback: &str) -> String {
    let trimmed = Path::new(file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(fallback)
        .trim();
    let safe = trimmed
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '\0' => '-',
            _ => character,
        })
        .collect::<String>();
    if safe.is_empty() {
        fallback.to_string()
    } else {
        safe
    }
}

fn ensure_app_created_workspace(root: &Path) -> Result<WorkspaceManifest, WorkspaceError> {
    let manifest_path = root.join(".diurnum").join("workspace.json");
    let manifest: WorkspaceManifest = serde_json::from_str(&fs::read_to_string(manifest_path)?)
        .map_err(|_| {
            WorkspaceError::new(
                WorkspaceErrorCode::NotAppCreatedWorkspace,
                "Workspace manifest is unreadable.",
            )
        })?;
    if !manifest.app_created {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::NotAppCreatedWorkspace,
            "Only App-Created Workspaces are supported in the MVP.",
        ));
    }
    Ok(manifest)
}

fn ensure_source_account_exists(root: &Path, source_account: &str) -> Result<(), WorkspaceError> {
    let accounts = fs::read_to_string(root.join("accounts.bean"))?;
    if accounts
        .lines()
        .any(|line| line.split_whitespace().nth(2) == Some(source_account))
    {
        return Ok(());
    }

    Err(WorkspaceError::new(
        WorkspaceErrorCode::InvalidLedger,
        "CSV Import must be tied to an existing Source Account.",
    ))
}

pub(crate) fn ensure_import_tables(connection: &Connection) -> Result<(), WorkspaceError> {
    connection.execute_batch(
        "
        create table if not exists source_mappings (
          source_account text primary key,
          mapping_json text not null,
          updated_at text not null
        );

        create table if not exists statement_rows (
          id text primary key,
          source_account text not null,
          source_file_name text not null,
          posted_date text not null,
          description text not null,
          source_amount text not null,
          import_fingerprint text not null,
          supporting_fields_json text not null,
          raw_row_json text not null,
          status text not null,
          imported_at text not null,
          diurnum_entry_id text,
          ledger_entry_file text,
          unique(source_account, import_fingerprint)
        );
        ",
    )?;
    Ok(())
}

fn statement_row_exists(
    connection: &Connection,
    source_account: &str,
    import_fingerprint: &str,
) -> Result<bool, WorkspaceError> {
    let count: i64 = connection.query_row(
        "select count(*) from statement_rows where source_account = ?1 and import_fingerprint = ?2",
        params![source_account, import_fingerprint],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

fn save_source_mapping(
    connection: &Connection,
    source_account: &str,
    mapping: &CsvSourceMappingInput,
) -> Result<(), WorkspaceError> {
    let mapping_json =
        serde_json::to_string(mapping).map_err(|error| WorkspaceError::io(error.to_string()))?;
    connection.execute(
        "
        insert into source_mappings (source_account, mapping_json, updated_at)
        values (?1, ?2, ?3)
        on conflict(source_account) do update set
          mapping_json = excluded.mapping_json,
          updated_at = excluded.updated_at
        ",
        params![source_account, mapping_json, Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

fn load_source_mapping(
    connection: &Connection,
    source_account: &str,
) -> Result<CsvSourceMappingInput, WorkspaceError> {
    let mapping_json: String = connection
        .query_row(
            "select mapping_json from source_mappings where source_account = ?1",
            [source_account],
            |row| row.get(0),
        )
        .map_err(|_| {
            WorkspaceError::new(
                WorkspaceErrorCode::InvalidLedger,
                "CSV Import needs a Source Mapping before it can reuse one.",
            )
        })?;
    serde_json::from_str(&mapping_json).map_err(|error| WorkspaceError::io(error.to_string()))
}

fn parse_csv(contents: &str) -> Result<Vec<HashMap<String, String>>, WorkspaceError> {
    let mut lines = contents.lines().filter(|line| !line.trim().is_empty());
    let Some(header_line) = lines.next() else {
        return Ok(Vec::new());
    };
    let headers = parse_csv_line(header_line);
    let mut rows = Vec::new();

    for line in lines {
        let values = parse_csv_line(line);
        let mut row = HashMap::new();
        for (index, header) in headers.iter().enumerate() {
            row.insert(
                header.clone(),
                values.get(index).cloned().unwrap_or_default(),
            );
        }
        rows.push(row);
    }

    Ok(rows)
}

fn parse_csv_line(line: &str) -> Vec<String> {
    line.split(',')
        .map(|value| value.trim().trim_matches('"').to_string())
        .collect()
}

fn required_value(row: &HashMap<String, String>, column: &str) -> Result<String, WorkspaceError> {
    row.get(column)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            WorkspaceError::new(
                WorkspaceErrorCode::InvalidLedger,
                format!("CSV Import is missing required column value {column}."),
            )
        })
}

fn required_source_amount(
    row: &HashMap<String, String>,
    mapping: &CsvSourceMappingInput,
) -> Result<String, WorkspaceError> {
    if let Some(amount_column) = mapping.amount_column.as_deref() {
        let raw = required_value(row, amount_column)?;
        let amount: f64 = raw.parse().map_err(|_| {
            WorkspaceError::new(
                WorkspaceErrorCode::InvalidLedger,
                format!("CSV Import amount column {amount_column} must contain numeric values."),
            )
        })?;

        // If a transaction type column is configured, use it to determine the
        // sign.  "Debit" rows (money leaving the account) become negative.
        let signed = match (
            mapping.transaction_type_column.as_deref(),
            mapping
                .debit_type_value
                .as_deref()
                .or(Some("Debit")),
        ) {
            (Some(type_col), Some(debit_val)) => {
                let row_type = optional_value(row, Some(type_col)).unwrap_or_default();
                if row_type.trim().eq_ignore_ascii_case(debit_val.trim()) {
                    -amount
                } else {
                    amount
                }
            }
            _ => amount,
        };

        return Ok(format_source_amount(signed));
    }

    let debit_column = mapping.debit_column.as_deref().ok_or_else(|| {
        WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "CSV Import needs either an amount column or debit and credit columns.",
        )
    })?;
    let credit_column = mapping.credit_column.as_deref().ok_or_else(|| {
        WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "CSV Import needs either an amount column or debit and credit columns.",
        )
    })?;

    let debit = optional_amount(row, debit_column)?;
    let credit = optional_amount(row, credit_column)?;
    match (debit, credit) {
        (Some(_), Some(_)) => Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "CSV Import debit and credit columns cannot both contain values for one Statement Row.",
        )),
        (Some(amount), None) => Ok(format_source_amount(-amount)),
        (None, Some(amount)) => Ok(format_source_amount(amount)),
        (None, None) => Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "CSV Import needs either a debit or credit value for each Statement Row.",
        )),
    }
}

fn optional_amount(
    row: &HashMap<String, String>,
    column: &str,
) -> Result<Option<f64>, WorkspaceError> {
    let Some(value) = row.get(column).map(|value| value.trim()) else {
        return Ok(None);
    };
    if value.is_empty() {
        return Ok(None);
    }
    value.parse::<f64>().map(Some).map_err(|_| {
        WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            format!("CSV Import amount column {column} must contain numeric values."),
        )
    })
}

fn format_source_amount(amount: f64) -> String {
    format!("{amount:.2}")
}

fn optional_value(row: &HashMap<String, String>, column: Option<&str>) -> Option<String> {
    column.and_then(|column| row.get(column).map(|value| value.trim().to_string()))
}

/// Normalise a bank-statement date string to ISO 8601 (`YYYY-MM-DD`).
///
/// Supported input formats:
/// - `MM/DD/YY`   — two-digit year (e.g. Capital One)   → century assumed 2000
/// - `MM/DD/YYYY` — four-digit year (e.g. Chase, BofA)
/// - `YYYY-MM-DD` — ISO 8601 (pass-through)
///
/// We use structural detection (component count + length) rather than a
/// trial-and-error format list because `chrono`'s `%Y` directive greedily
/// parses any number of digits — `05/05/26` with `%m/%d/%Y` would be
/// interpreted as May 5th of year 26 CE, not 2026.
fn normalize_posted_date(raw: &str) -> Result<String, WorkspaceError> {
    let s = raw.trim();
    let unsupported = || {
        WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            format!("CSV Import date '{s}' is not in a recognised format (expected MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD)."),
        )
    };

    let parsed: NaiveDate = if s.contains('/') {
        let parts: Vec<&str> = s.splitn(3, '/').collect();
        match parts.as_slice() {
            [_m, _d, y] if y.len() == 4 => {
                NaiveDate::parse_from_str(s, "%m/%d/%Y").map_err(|_| unsupported())?
            }
            [_m, _d, y] if y.len() == 2 => {
                NaiveDate::parse_from_str(s, "%m/%d/%y").map_err(|_| unsupported())?
            }
            _ => return Err(unsupported()),
        }
    } else if s.contains('-') {
        let parts: Vec<&str> = s.splitn(3, '-').collect();
        match parts.as_slice() {
            [y, _m, _d] if y.len() == 4 => {
                NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| unsupported())?
            }
            _ => return Err(unsupported()),
        }
    } else {
        return Err(unsupported());
    };

    Ok(parsed.format("%Y-%m-%d").to_string())
}

fn import_fingerprint(
    source_account: &str,
    posted_date: &str,
    description: &str,
    source_amount: &str,
) -> String {
    let input = format!("{source_account}\n{posted_date}\n{description}\n{source_amount}");
    format!("{:016x}", fnv1a64(input.as_bytes()))
}

fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[cfg(test)]
mod tests {
    use crate::workspace::create::create_workspace;
    use crate::workspace::imports::{import_statement_rows, CsvImportInput, CsvSourceMappingInput};
    use crate::workspace::source_accounts::{
        add_source_account, AddSourceAccountInput, SourceAccountKind,
    };
    use crate::workspace::types::CreateWorkspaceInput;
    use rusqlite::Connection;

    #[test]
    fn imports_statement_rows_into_staging_with_source_mapping() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            kind: SourceAccountKind::Bank,
            name: "Operating Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();

        let result = import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "checking.csv".to_string(),
            csv_contents: "Date,Description,Amount,Memo\n2026-01-03,Client payment,1500.00,Invoice 42\n2026-01-04,Software,-29.99,Subscription\n".to_string(),
            mapping: Some(CsvSourceMappingInput {
                posted_date_column: "Date".to_string(),
                description_column: "Description".to_string(),
                amount_column: Some("Amount".to_string()),
                debit_column: None,
                credit_column: None,
                memo_column: Some("Memo".to_string()),
                reference_id_column: None,
                payee_column: None,
                category_column: None,
                transaction_type_column: None,
                debit_type_value: None,
            }),
        })
        .unwrap();

        assert_eq!(result.imported_count, 2);
        assert_eq!(result.source_account, "Assets:Bank:Operating-Checking");

        let connection = Connection::open(
            std::path::Path::new(&created.root_path)
                .join(".diurnum")
                .join("diurnum.sqlite"),
        )
        .unwrap();
        let row_count: i64 = connection
            .query_row("select count(*) from statement_rows", [], |row| row.get(0))
            .unwrap();
        assert_eq!(row_count, 2);

        let saved_mapping_count: i64 = connection
            .query_row("select count(*) from source_mappings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(saved_mapping_count, 1);

        let source_amount: String = connection
            .query_row(
                "select source_amount from statement_rows where description = 'Software'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(source_amount, "-29.99");
        let autofiled_csv = std::fs::read_dir(
            std::path::Path::new(&created.root_path).join("documents/operating-checking"),
        )
        .unwrap()
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .find(|name| name.ends_with("_checking.csv"))
        .unwrap();
        assert!(autofiled_csv.starts_with("20"));
        let autofiled_contents = std::fs::read_to_string(
            std::path::Path::new(&created.root_path)
                .join("documents/operating-checking")
                .join(autofiled_csv),
        )
        .unwrap();
        assert!(autofiled_contents.contains("Client payment"));

        let reused = import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "checking-next.csv".to_string(),
            csv_contents: "Date,Description,Amount,Memo\n2026-01-05,Refund,12.00,Returned fee\n"
                .to_string(),
            mapping: None,
        })
        .unwrap();

        assert_eq!(reused.imported_count, 1);
    }

    #[test]
    fn skips_duplicate_statement_rows_for_same_source_account() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            kind: SourceAccountKind::Bank,
            name: "Operating Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();

        let input = CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "checking.csv".to_string(),
            csv_contents: "Date,Description,Amount\n2026-01-03,Client payment,1500.00\n2026-01-04,Software,-29.99\n".to_string(),
            mapping: Some(CsvSourceMappingInput {
                posted_date_column: "Date".to_string(),
                description_column: "Description".to_string(),
                amount_column: Some("Amount".to_string()),
                debit_column: None,
                credit_column: None,
                memo_column: None,
                reference_id_column: None,
                payee_column: None,
                category_column: None,
                transaction_type_column: None,
                debit_type_value: None,
            }),
        };

        let first = import_statement_rows(input.clone()).unwrap();
        assert_eq!(first.imported_count, 2);
        assert_eq!(first.skipped_duplicate_count, 0);

        let second = import_statement_rows(CsvImportInput {
            source_file_name: "checking-again.csv".to_string(),
            mapping: None,
            ..input
        })
        .unwrap();
        assert_eq!(second.imported_count, 0);
        assert_eq!(second.skipped_duplicate_count, 2);

        let connection = Connection::open(
            std::path::Path::new(&created.root_path)
                .join(".diurnum")
                .join("diurnum.sqlite"),
        )
        .unwrap();
        connection
            .execute(
                "update statement_rows set status = 'accounted' where description = 'Software'",
                [],
            )
            .unwrap();

        let third = import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "checking-overlap.csv".to_string(),
            csv_contents:
                "Date,Description,Amount\n2026-01-04,Software,-29.99\n2026-01-05,Refund,12.00\n"
                    .to_string(),
            mapping: None,
        })
        .unwrap();
        assert_eq!(third.imported_count, 1);
        assert_eq!(third.skipped_duplicate_count, 1);
    }

    #[test]
    fn imports_debit_credit_statement_rows_as_source_amounts() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            kind: SourceAccountKind::Bank,
            name: "Operating Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();

        let result = import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "checking.csv".to_string(),
            csv_contents: "Date,Description,Debit,Credit\n2026-01-03,Client payment,,1500.00\n2026-01-04,Software,29.99,\n".to_string(),
            mapping: Some(CsvSourceMappingInput {
                posted_date_column: "Date".to_string(),
                description_column: "Description".to_string(),
                amount_column: None,
                debit_column: Some("Debit".to_string()),
                credit_column: Some("Credit".to_string()),
                memo_column: None,
                reference_id_column: None,
                payee_column: None,
                category_column: None,
                transaction_type_column: None,
                debit_type_value: None,
            }),
        })
        .unwrap();

        assert_eq!(result.imported_count, 2);

        let connection = Connection::open(
            std::path::Path::new(&created.root_path)
                .join(".diurnum")
                .join("diurnum.sqlite"),
        )
        .unwrap();
        let payment_amount: String = connection
            .query_row(
                "select source_amount from statement_rows where description = 'Client payment'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(payment_amount, "1500.00");

        let software_amount: String = connection
            .query_row(
                "select source_amount from statement_rows where description = 'Software'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(software_amount, "-29.99");
    }

    #[test]
    fn imports_transaction_type_column_rows_with_correct_sign() {
        // Simulates a Capital One-style statement where amounts are always
        // positive and a "Transaction Type" column indicates Debit/Credit.
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            kind: SourceAccountKind::Bank,
            name: "Operating Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();

        let result = import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "capital-one.csv".to_string(),
            csv_contents: "Transaction Date,Transaction Description,Transaction Type,Transaction Amount\n\
2026-01-03,Client payment,Credit,1500.00\n\
2026-01-04,Software subscription,Debit,29.99\n"
                .to_string(),
            mapping: Some(CsvSourceMappingInput {
                posted_date_column: "Transaction Date".to_string(),
                description_column: "Transaction Description".to_string(),
                amount_column: Some("Transaction Amount".to_string()),
                transaction_type_column: Some("Transaction Type".to_string()),
                debit_type_value: Some("Debit".to_string()),
                debit_column: None,
                credit_column: None,
                memo_column: None,
                reference_id_column: None,
                payee_column: None,
                category_column: None,
            }),
        })
        .unwrap();

        assert_eq!(result.imported_count, 2);

        let connection = Connection::open(
            std::path::Path::new(&created.root_path)
                .join(".diurnum")
                .join("diurnum.sqlite"),
        )
        .unwrap();

        let payment_amount: String = connection
            .query_row(
                "select source_amount from statement_rows where description = 'Client payment'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(payment_amount, "1500.00");

        let software_amount: String = connection
            .query_row(
                "select source_amount from statement_rows where description = 'Software subscription'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(software_amount, "-29.99");
    }

    #[test]
    fn normalizes_various_date_formats_to_iso_on_import() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            kind: SourceAccountKind::Bank,
            name: "Operating Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();

        // Mix of MM/DD/YY (Capital One), MM/DD/YYYY (Chase/BofA), and
        // YYYY-MM-DD (ISO — should pass through unchanged).
        import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "mixed-dates.csv".to_string(),
            csv_contents: "Date,Description,Amount\n\
05/05/26,Capital One row,100.00\n\
05/06/2026,US four-digit row,200.00\n\
2026-05-07,ISO row,300.00\n"
                .to_string(),
            mapping: Some(CsvSourceMappingInput {
                posted_date_column: "Date".to_string(),
                description_column: "Description".to_string(),
                amount_column: Some("Amount".to_string()),
                debit_column: None,
                credit_column: None,
                transaction_type_column: None,
                debit_type_value: None,
                memo_column: None,
                reference_id_column: None,
                payee_column: None,
                category_column: None,
            }),
        })
        .unwrap();

        let connection = Connection::open(
            std::path::Path::new(&created.root_path)
                .join(".diurnum")
                .join("diurnum.sqlite"),
        )
        .unwrap();

        let q = |desc: &str| -> String {
            connection
                .query_row(
                    "select posted_date from statement_rows where description = ?1",
                    [desc],
                    |row| row.get(0),
                )
                .unwrap()
        };

        assert_eq!(q("Capital One row"),    "2026-05-05");
        assert_eq!(q("US four-digit row"),  "2026-05-06");
        assert_eq!(q("ISO row"),            "2026-05-07");
    }
}
