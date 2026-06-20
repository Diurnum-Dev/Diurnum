use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use crate::workspace::paths::validate_books_start_date;
use crate::workspace::types::{LedgerStatus, LedgerValidationSummary};
use std::fs;
use std::path::Path;

pub fn validate_workspace(
    path: impl AsRef<Path>,
) -> Result<LedgerValidationSummary, WorkspaceError> {
    let root = path.as_ref();
    let mut errors = Vec::new();

    let main_path = root.join("main.bean");
    let accounts_path = root.join("accounts.bean");
    let opening_balances_path = root.join("opening-balances.bean");

    if !main_path.exists() {
        errors.push("main.bean: Missing file.".to_string());
    }
    if !accounts_path.exists() {
        errors.push("accounts.bean: Missing file.".to_string());
    }
    if !opening_balances_path.exists() {
        errors.push("opening-balances.bean: Missing file.".to_string());
    }

    if errors.is_empty() {
        let main = fs::read_to_string(&main_path)?;
        if !main.contains("include \"accounts.bean\"") {
            errors.push("main.bean: must include accounts.bean.".to_string());
        }
        if !main.contains("include \"opening-balances.bean\"") {
            errors.push("main.bean: must include opening-balances.bean.".to_string());
        }

        let accounts = fs::read_to_string(&accounts_path)?;
        let mut declared_accounts = std::collections::HashSet::new();
        for (line_number, line) in accounts.lines().enumerate() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with(';') {
                continue;
            }

            let parts = trimmed.split_whitespace().collect::<Vec<_>>();
            if parts.len() != 4 || parts[1] != "open" {
                errors.push(format!(
                    "accounts.bean:{} {}",
                    line_number + 1,
                    diagnose_open_directive(&parts)
                ));
                continue;
            }
            if validate_books_start_date(parts[0]).is_err() {
                errors.push(format!(
                    "accounts.bean:{} Invalid date '{}' — expected YYYY-MM-DD.",
                    line_number + 1,
                    parts[0]
                ));
            }
            if let Some(reason) = account_name_error(parts[2]) {
                errors.push(format!(
                    "accounts.bean:{} Invalid account name '{}': {}",
                    line_number + 1,
                    parts[2],
                    reason
                ));
            } else {
                declared_accounts.insert(parts[2].to_string());
            }
            if parts[3] != "USD" {
                errors.push(format!(
                    "accounts.bean:{} Invalid currency '{}' — only USD is supported.",
                    line_number + 1,
                    parts[3]
                ));
            }
        }

        let opening_balances = fs::read_to_string(&opening_balances_path)?;
        for (line_number, line) in opening_balances.lines().enumerate() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with(';') {
                continue;
            }

            let parts = trimmed.split_whitespace().collect::<Vec<_>>();
            if parts.len() != 5 || parts[1] != "balance" {
                errors.push(format!(
                    "opening-balances.bean:{} {}",
                    line_number + 1,
                    diagnose_balance_directive(&parts)
                ));
                continue;
            }
            if validate_books_start_date(parts[0]).is_err() {
                errors.push(format!(
                    "opening-balances.bean:{} Invalid date '{}' — expected YYYY-MM-DD.",
                    line_number + 1,
                    parts[0]
                ));
            }
            if let Some(reason) = account_name_error(parts[2]) {
                errors.push(format!(
                    "opening-balances.bean:{} Invalid account name '{}': {}",
                    line_number + 1,
                    parts[2],
                    reason
                ));
            }
            if parts[3].parse::<f64>().is_err() {
                errors.push(format!(
                    "opening-balances.bean:{} Invalid balance amount '{}' — expected a number.",
                    line_number + 1,
                    parts[3]
                ));
            }
            if parts[4] != "USD" {
                errors.push(format!(
                    "opening-balances.bean:{} Invalid currency '{}' — only USD is supported.",
                    line_number + 1,
                    parts[4]
                ));
            }
        }

        validate_transaction_accounts(root, &declared_accounts, &mut errors)?;
    }

    Ok(LedgerValidationSummary {
        status: if errors.is_empty() {
            LedgerStatus::Valid
        } else {
            LedgerStatus::Invalid
        },
        errors,
    })
}

pub fn ensure_valid_workspace(
    path: impl AsRef<Path>,
) -> Result<LedgerValidationSummary, WorkspaceError> {
    let summary = validate_workspace(path)?;
    if summary.status == LedgerStatus::Invalid {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            summary.errors.join(" "),
        ));
    }
    Ok(summary)
}

/// Scans every `transactions/*.bean` file and flags posting lines that reference
/// an account which was never declared with an `open` directive in accounts.bean
/// (the same rule the Beancount engine enforces), or whose name is malformed.
fn validate_transaction_accounts(
    root: &Path,
    declared_accounts: &std::collections::HashSet<String>,
    errors: &mut Vec<String>,
) -> Result<(), WorkspaceError> {
    let transactions_dir = root.join("transactions");
    if !transactions_dir.is_dir() {
        return Ok(());
    }

    let mut bean_files: Vec<_> = fs::read_dir(&transactions_dir)?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("bean"))
        .collect();
    bean_files.sort();

    for file_path in bean_files {
        let file_name = file_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
        let contents = fs::read_to_string(&file_path)?;
        for (line_number, line) in contents.lines().enumerate() {
            let Some(account) = posting_account(line) else {
                continue;
            };
            if let Some(reason) = account_name_error(account) {
                errors.push(format!(
                    "transactions/{}:{} Invalid account name '{}': {}",
                    file_name,
                    line_number + 1,
                    account,
                    reason
                ));
            } else if !declared_accounts.contains(account) {
                errors.push(format!(
                    "transactions/{}:{} Account '{}' is not declared. Add an 'open' directive for it in accounts.bean.",
                    file_name,
                    line_number + 1,
                    account
                ));
            }
        }
    }

    Ok(())
}

/// Returns the account referenced by a posting line, or None for transaction
/// headers, metadata (`key: "value"`), comments, and blank lines. A posting's
/// first token is the account: it contains a colon but — unlike a metadata key —
/// does not end with one.
fn posting_account(line: &str) -> Option<&str> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with(';') {
        return None;
    }
    let first = trimmed.split_whitespace().next()?;
    if first.ends_with(':') || !first.contains(':') {
        return None;
    }
    Some(first)
}

fn diagnose_open_directive(parts: &[&str]) -> String {
    if parts.len() == 3 && parts.get(1) == Some(&"open") {
        format!(
            "Missing currency in 'open' directive for '{}' — expected: YYYY-MM-DD open AccountName USD.",
            parts[2]
        )
    } else if parts.len() >= 2 && parts[1] != "open" {
        format!(
            "Expected 'open' directive but found '{}' — expected: YYYY-MM-DD open AccountName USD.",
            parts[1]
        )
    } else {
        format!(
            "Invalid 'open' directive — expected: YYYY-MM-DD open AccountName USD. Got: '{}'.",
            parts.join(" ")
        )
    }
}

fn diagnose_balance_directive(parts: &[&str]) -> String {
    if parts.len() == 4 && parts.get(1) == Some(&"balance") {
        format!(
            "Missing currency in 'balance' directive for '{}' — expected: YYYY-MM-DD balance AccountName Amount USD.",
            parts[2]
        )
    } else if parts.len() == 3 && parts.get(1) == Some(&"balance") {
        format!(
            "Missing amount and currency in 'balance' directive for '{}' — expected: YYYY-MM-DD balance AccountName Amount USD.",
            parts[2]
        )
    } else if parts.len() >= 2 && parts[1] != "balance" {
        format!(
            "Expected 'balance' directive but found '{}' — expected: YYYY-MM-DD balance AccountName Amount USD.",
            parts[1]
        )
    } else {
        format!(
            "Invalid 'balance' directive — expected: YYYY-MM-DD balance AccountName Amount USD. Got: '{}'.",
            parts.join(" ")
        )
    }
}

fn account_name_error(value: &str) -> Option<String> {
    const ROOTS: &[&str] = &["Assets", "Liabilities", "Equity", "Income", "Expenses"];
    let mut parts = value.split(':');
    let root = parts.next().unwrap_or("");
    if !ROOTS.contains(&root) {
        return Some(format!(
            "'{}' is not a valid root account. Must be one of: {}.",
            root,
            ROOTS.join(", ")
        ));
    }
    let sub_parts: Vec<&str> = parts.collect();
    if sub_parts.is_empty() {
        return Some("account name must have at least one sub-account after the root (e.g. Income:Donations).".to_string());
    }
    for part in &sub_parts {
        if part.is_empty() {
            return Some("account name contains an empty segment (double colon).".to_string());
        }
        if let Some(bad) = part.chars().find(|c| !c.is_ascii_alphanumeric() && *c != '-') {
            return Some(format!(
                "segment '{}' contains invalid character '{}'. Only letters, digits, and hyphens are allowed.",
                part, bad
            ));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::create::create_workspace;
    use crate::workspace::types::CreateWorkspaceInput;

    #[test]
    fn generated_workspace_validates() {
        let tempdir = tempfile::tempdir().unwrap();
        let summary = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();

        let validation = validate_workspace(summary.root_path).unwrap();
        assert_eq!(validation.status, LedgerStatus::Valid);
        assert!(validation.errors.is_empty());
    }

    #[test]
    fn missing_accounts_file_is_invalid() {
        let tempdir = tempfile::tempdir().unwrap();
        let summary = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        fs::remove_file(Path::new(&summary.root_path).join("accounts.bean")).unwrap();

        let validation = validate_workspace(summary.root_path).unwrap();
        assert_eq!(validation.status, LedgerStatus::Invalid);
        assert!(validation
            .errors
            .iter()
            .any(|error| error.contains("accounts.bean")));
    }

    #[test]
    fn corrupted_account_directive_is_invalid() {
        let tempdir = tempfile::tempdir().unwrap();
        let summary = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        fs::write(
            Path::new(&summary.root_path).join("accounts.bean"),
            "2026-01-01 nope Assets:Bank:Checking USD\n",
        )
        .unwrap();

        let validation = validate_workspace(summary.root_path).unwrap();
        assert_eq!(validation.status, LedgerStatus::Invalid);
    }

    #[test]
    fn undeclared_transaction_account_is_invalid() {
        let tempdir = tempfile::tempdir().unwrap();
        let summary = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        let transactions_dir = Path::new(&summary.root_path).join("transactions");
        fs::write(
            transactions_dir.join("2026-01.bean"),
            "2026-01-05 * \"Deposit\"\n    Assets:Bank:Nonexistent  200.00 USD\n    Income:Sales  -200.00 USD\n",
        )
        .unwrap();

        let validation = validate_workspace(summary.root_path).unwrap();
        assert_eq!(validation.status, LedgerStatus::Invalid);
        assert!(validation.errors.iter().any(|error| error
            .contains("transactions/2026-01.bean:2")
            && error.contains("Assets:Bank:Nonexistent")
            && error.contains("not declared")));
    }

    #[test]
    fn declared_transaction_accounts_validate() {
        let tempdir = tempfile::tempdir().unwrap();
        let summary = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        let transactions_dir = Path::new(&summary.root_path).join("transactions");
        fs::write(
            transactions_dir.join("2026-01.bean"),
            "2026-01-05 * \"Deposit\"\n    source_account: \"Assets:Bank:Madeup\"\n    Assets:Bank:Checking  200.00 USD\n    Income:Sales  -200.00 USD\n",
        )
        .unwrap();

        let validation = validate_workspace(summary.root_path).unwrap();
        assert_eq!(validation.status, LedgerStatus::Valid, "errors: {:?}", validation.errors);
        assert!(validation.errors.is_empty());
    }

    #[test]
    fn corrupted_opening_balances_file_is_invalid() {
        let tempdir = tempfile::tempdir().unwrap();
        let summary = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        fs::write(
            Path::new(&summary.root_path).join("opening-balances.bean"),
            "this is not a valid opening balance directive\n",
        )
        .unwrap();

        let validation = validate_workspace(summary.root_path).unwrap();
        assert_eq!(validation.status, LedgerStatus::Invalid);
        assert!(validation
            .errors
            .iter()
            .any(|error| error.contains("opening-balances.bean:1")));
    }
}
