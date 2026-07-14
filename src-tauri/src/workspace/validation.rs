use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use crate::workspace::paths::validate_books_start_date;
use crate::workspace::types::{LedgerStatus, LedgerValidationSummary};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Unsaved editor buffers, keyed by workspace-relative path
/// (`transactions/2026-01.bean`). Validation reads through this overlay, so the
/// Ledger Editor can lint what you are typing rather than what was last written
/// to disk.
pub type LedgerOverlay = HashMap<String, String>;

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateLedgerBufferInput {
    pub workspace_root_path: String,
    pub relative_path: String,
    pub contents: String,
}

pub fn validate_workspace(
    path: impl AsRef<Path>,
) -> Result<LedgerValidationSummary, WorkspaceError> {
    validate_workspace_with_overlay(path, &LedgerOverlay::new())
}

/// Validates the Workspace as if `input.contents` were already saved to
/// `input.relative_path`, so the Ledger Editor can surface errors — an unbalanced
/// transaction, an undeclared account — while the buffer is still dirty.
pub fn validate_ledger_buffer(
    input: ValidateLedgerBufferInput,
) -> Result<LedgerValidationSummary, WorkspaceError> {
    let mut overlay = LedgerOverlay::new();
    overlay.insert(input.relative_path, input.contents);
    validate_workspace_with_overlay(input.workspace_root_path, &overlay)
}

pub fn validate_workspace_with_overlay(
    path: impl AsRef<Path>,
    overlay: &LedgerOverlay,
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
        let main = read_ledger_file(root, "main.bean", overlay)?;
        if !main.contains("include \"accounts.bean\"") {
            errors.push("main.bean: must include accounts.bean.".to_string());
        }
        if !main.contains("include \"opening-balances.bean\"") {
            errors.push("main.bean: must include opening-balances.bean.".to_string());
        }

        let accounts = read_ledger_file(root, "accounts.bean", overlay)?;
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

        let opening_balances = read_ledger_file(root, "opening-balances.bean", overlay)?;
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

        validate_transaction_accounts(root, &declared_accounts, overlay, &mut errors)?;
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
/// (the same rule the Beancount engine enforces) or whose name is malformed, and
/// flags transactions whose postings do not sum to zero.
fn validate_transaction_accounts(
    root: &Path,
    declared_accounts: &std::collections::HashSet<String>,
    overlay: &LedgerOverlay,
    errors: &mut Vec<String>,
) -> Result<(), WorkspaceError> {
    let transactions_dir = root.join("transactions");
    if !transactions_dir.is_dir() {
        return Ok(());
    }

    let mut file_names: Vec<String> = fs::read_dir(&transactions_dir)?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("bean"))
        .filter_map(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(str::to_string)
        })
        .collect();
    file_names.sort();

    for file_name in file_names {
        let relative = format!("transactions/{}", file_name);
        let contents = read_ledger_file(root, &relative, overlay)?;
        validate_transaction_file(&file_name, &contents, declared_accounts, errors);
    }

    Ok(())
}

fn read_ledger_file(
    root: &Path,
    relative: &str,
    overlay: &LedgerOverlay,
) -> Result<String, WorkspaceError> {
    match overlay.get(relative) {
        Some(contents) => Ok(contents.clone()),
        None => Ok(fs::read_to_string(root.join(relative))?),
    }
}

fn validate_transaction_file(
    file_name: &str,
    contents: &str,
    declared_accounts: &std::collections::HashSet<String>,
    errors: &mut Vec<String>,
) {
    for block in transaction_blocks(contents) {
        let mut postings = Vec::new();
        for (line_number, line) in block {
            let Some((account, rest)) = split_posting(line) else {
                continue;
            };
            if let Some(reason) = account_name_error(account) {
                errors.push(format!(
                    "transactions/{}:{} Invalid account name '{}': {}",
                    file_name, line_number, account, reason
                ));
            } else if !declared_accounts.contains(account) {
                errors.push(format!(
                    "transactions/{}:{} Account '{}' is not declared. Add an 'open' directive for it in accounts.bean.",
                    file_name, line_number, account
                ));
            }

            let amount = posting_amount(rest);
            if let PostingAmount::MissingCurrency(_, raw) = &amount {
                errors.push(format!(
                    "transactions/{}:{} Posting amount '{}' is missing a currency — expected '{} USD'.",
                    file_name, line_number, raw, raw
                ));
            }
            postings.push((line_number, amount));
        }

        push_balance_errors(file_name, &postings, errors);
    }
}

/// A transaction that leaves one posting's amount elided balances by
/// construction (Beancount infers the residual), and one whose amounts we cannot
/// parse — a cost, a price, a non-USD currency — is not ours to judge, so in
/// both cases we stay quiet rather than raise a false "does not balance".
fn push_balance_errors(
    file_name: &str,
    postings: &[(usize, PostingAmount)],
    errors: &mut Vec<String>,
) {
    if postings.is_empty() {
        return;
    }
    let mut sum = 0.0;
    for (_, amount) in postings {
        match amount {
            PostingAmount::Value(value) | PostingAmount::MissingCurrency(value, _) => sum += value,
            PostingAmount::Elided | PostingAmount::Unsupported => return,
        }
    }

    let residual = round_cents(sum);
    if residual == 0.0 {
        return;
    }
    for (line_number, _) in postings {
        errors.push(format!(
            "transactions/{}:{} Transaction does not balance: postings sum to {:.2} USD, expected 0.00.",
            file_name, line_number, residual
        ));
    }
}

/// Groups a transaction file into blocks, each yielding the 1-based line numbers
/// and text of the lines indented beneath one `YYYY-MM-DD * "Payee"` header.
/// Non-transaction directives at column 0 (`balance`, `open`, …) start no block,
/// so their operands are never mistaken for postings.
fn transaction_blocks(contents: &str) -> Vec<Vec<(usize, &str)>> {
    let mut blocks: Vec<Vec<(usize, &str)>> = Vec::new();
    let mut in_transaction = false;

    for (index, line) in contents.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') {
            continue;
        }
        if !line.starts_with(char::is_whitespace) {
            in_transaction = is_transaction_header(trimmed);
            if in_transaction {
                blocks.push(Vec::new());
            }
            continue;
        }
        if in_transaction {
            if let Some(block) = blocks.last_mut() {
                block.push((index + 1, line));
            }
        }
    }

    blocks
}

fn is_transaction_header(trimmed: &str) -> bool {
    let mut parts = trimmed.split_whitespace();
    let Some(date) = parts.next() else {
        return false;
    };
    if validate_books_start_date(date).is_err() {
        return false;
    }
    matches!(parts.next(), Some("*") | Some("!") | Some("txn"))
}

/// Splits a posting into its account and the amount text that follows, or None
/// for metadata (`key: "value"`) and comments. A posting's first token is the
/// account: it contains a colon but — unlike a metadata key — does not end with one.
fn split_posting(line: &str) -> Option<(&str, &str)> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with(';') {
        return None;
    }
    let account = trimmed.split_whitespace().next()?;
    if account.ends_with(':') || !account.contains(':') {
        return None;
    }
    Some((account, trimmed[account.len()..].trim()))
}

enum PostingAmount {
    /// `Assets:Bank:Checking  66.00 USD`
    Value(f64),
    /// `Assets:Bank:Checking  66.00` — parses, but Beancount needs the currency
    /// and our reports drop any posting without one.
    MissingCurrency(f64, String),
    /// `Assets:Bank:Checking` — Beancount infers this posting from the others.
    Elided,
    /// A cost, a price, or anything else we do not model.
    Unsupported,
}

fn posting_amount(rest: &str) -> PostingAmount {
    if rest.is_empty() {
        return PostingAmount::Elided;
    }
    if rest.contains('@') || rest.contains('{') {
        return PostingAmount::Unsupported;
    }
    let parts = rest.split_whitespace().collect::<Vec<_>>();
    let Some(value) = parts.first().and_then(|raw| parse_amount(raw)) else {
        return PostingAmount::Unsupported;
    };
    match parts.len() {
        1 => PostingAmount::MissingCurrency(value, parts[0].to_string()),
        2 if parts[1] == "USD" => PostingAmount::Value(value),
        _ => PostingAmount::Unsupported,
    }
}

fn parse_amount(raw: &str) -> Option<f64> {
    raw.replace(',', "").parse::<f64>().ok()
}

fn round_cents(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
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
        if let Some(bad) = part
            .chars()
            .find(|c| !c.is_ascii_alphanumeric() && *c != '-')
        {
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
        assert!(validation
            .errors
            .iter()
            .any(|error| error.contains("transactions/2026-01.bean:2")
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
        assert_eq!(
            validation.status,
            LedgerStatus::Valid,
            "errors: {:?}",
            validation.errors
        );
        assert!(validation.errors.is_empty());
    }

    /// Writes a workspace whose accounts.bean declares the accounts used by the
    /// balance tests, then drops `transactions` into transactions/2026-01.bean.
    fn workspace_with_transactions(transactions: &str) -> (tempfile::TempDir, String) {
        let tempdir = tempfile::tempdir().unwrap();
        let summary = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        let root = Path::new(&summary.root_path);
        let accounts = fs::read_to_string(root.join("accounts.bean")).unwrap();
        fs::write(
            root.join("accounts.bean"),
            format!(
                "{accounts}2026-01-01 open Assets:Bank:Checking USD\n2026-01-01 open Income:Sales USD\n2026-01-01 open Expenses:Events USD\n"
            ),
        )
        .unwrap();
        fs::write(root.join("transactions/2026-01.bean"), transactions).unwrap();
        (tempdir, summary.root_path)
    }

    #[test]
    fn unbalanced_transaction_is_invalid_on_every_posting_line() {
        let (_tempdir, root) = workspace_with_transactions(
            "2026-01-05 * \"Test\"\n  Assets:Bank:Checking  66.00 USD\n  Expenses:Events  -77.00 USD\n",
        );

        let validation = validate_workspace(&root).unwrap();
        assert_eq!(validation.status, LedgerStatus::Invalid);
        let unbalanced: Vec<_> = validation
            .errors
            .iter()
            .filter(|error| error.contains("does not balance"))
            .collect();
        assert_eq!(
            unbalanced.len(),
            2,
            "both posting lines should be flagged: {:?}",
            validation.errors
        );
        assert!(unbalanced[0].starts_with("transactions/2026-01.bean:2"));
        assert!(unbalanced[1].starts_with("transactions/2026-01.bean:3"));
        assert!(
            unbalanced[0].contains("-11.00 USD"),
            "message should name the residual: {}",
            unbalanced[0]
        );
    }

    #[test]
    fn balanced_transaction_is_valid() {
        let (_tempdir, root) = workspace_with_transactions(
            "2026-01-05 * \"Test\"\n  Assets:Bank:Checking  77.00 USD\n  Expenses:Events  -77.00 USD\n",
        );

        let validation = validate_workspace(&root).unwrap();
        assert_eq!(
            validation.status,
            LedgerStatus::Valid,
            "errors: {:?}",
            validation.errors
        );
    }

    #[test]
    fn metadata_and_comments_do_not_count_as_postings() {
        let (_tempdir, root) = workspace_with_transactions(
            "2026-01-05 * \"Test\"\n  diurnum_entry_id: \"abc\"\n  pending_at_import: TRUE\n  ; a note\n  Assets:Bank:Checking  77.00 USD\n  Expenses:Events  -77.00 USD\n",
        );

        let validation = validate_workspace(&root).unwrap();
        assert_eq!(
            validation.status,
            LedgerStatus::Valid,
            "errors: {:?}",
            validation.errors
        );
    }

    #[test]
    fn elided_amount_absorbs_the_residual_and_balances() {
        let (_tempdir, root) = workspace_with_transactions(
            "2026-01-05 * \"Test\"\n  Assets:Bank:Checking  77.00 USD\n  Expenses:Events\n",
        );

        let validation = validate_workspace(&root).unwrap();
        assert_eq!(
            validation.status,
            LedgerStatus::Valid,
            "errors: {:?}",
            validation.errors
        );
    }

    #[test]
    fn posting_amount_without_currency_is_invalid() {
        let (_tempdir, root) = workspace_with_transactions(
            "2026-01-05 * \"Test\"\n  Assets:Bank:Checking  77.00\n  Expenses:Events  -77.00 USD\n",
        );

        let validation = validate_workspace(&root).unwrap();
        assert_eq!(validation.status, LedgerStatus::Invalid);
        assert!(
            validation
                .errors
                .iter()
                .any(|error| error.starts_with("transactions/2026-01.bean:2")
                    && error.contains("missing a currency")),
            "errors: {:?}",
            validation.errors
        );
    }

    #[test]
    fn amount_without_currency_still_counts_toward_the_balance() {
        // The bare amounts balance, so the only complaint should be the missing
        // currency — not a spurious "does not balance".
        let (_tempdir, root) = workspace_with_transactions(
            "2026-01-05 * \"Test\"\n  Assets:Bank:Checking  77.00\n  Expenses:Events  -77.00\n",
        );

        let validation = validate_workspace(&root).unwrap();
        assert!(
            !validation
                .errors
                .iter()
                .any(|error| error.contains("does not balance")),
            "errors: {:?}",
            validation.errors
        );
    }

    #[test]
    fn balance_directives_are_not_balance_checked() {
        let (_tempdir, root) = workspace_with_transactions(
            "2026-01-31 balance Assets:Bank:Checking  77.00 USD\n\n2026-01-05 * \"Test\"\n  Assets:Bank:Checking  77.00 USD\n  Expenses:Events  -77.00 USD\n",
        );

        let validation = validate_workspace(&root).unwrap();
        assert_eq!(
            validation.status,
            LedgerStatus::Valid,
            "errors: {:?}",
            validation.errors
        );
    }

    #[test]
    fn rounding_residual_within_a_cent_still_balances() {
        let (_tempdir, root) = workspace_with_transactions(
            "2026-01-05 * \"Test\"\n  Assets:Bank:Checking  33.33 USD\n  Assets:Bank:Checking  33.33 USD\n  Expenses:Events  -66.66 USD\n",
        );

        let validation = validate_workspace(&root).unwrap();
        assert_eq!(
            validation.status,
            LedgerStatus::Valid,
            "errors: {:?}",
            validation.errors
        );
    }

    #[test]
    fn buffer_validation_lints_unsaved_contents_not_the_file_on_disk() {
        let (_tempdir, root) = workspace_with_transactions(
            "2026-01-05 * \"Test\"\n  Assets:Bank:Checking  77.00 USD\n  Expenses:Events  -77.00 USD\n",
        );
        assert_eq!(
            validate_workspace(&root).unwrap().status,
            LedgerStatus::Valid
        );

        let validation = validate_ledger_buffer(ValidateLedgerBufferInput {
            workspace_root_path: root,
            relative_path: "transactions/2026-01.bean".to_string(),
            contents: "2026-01-05 * \"Test\"\n  Assets:Bank:Checking  66.00 USD\n  Expenses:Events  -77.00 USD\n".to_string(),
        })
        .unwrap();

        assert_eq!(validation.status, LedgerStatus::Invalid);
        assert!(
            validation
                .errors
                .iter()
                .any(|error| error.contains("does not balance") && error.contains("-11.00 USD")),
            "errors: {:?}",
            validation.errors
        );
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
