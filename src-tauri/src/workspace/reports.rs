use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use crate::workspace::types::LedgerStatus;
use crate::workspace::validation::validate_workspace;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportsInput {
    pub workspace_root_path: String,
    pub period_start: String,
    pub period_end: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MvpReports {
    pub period_start: String,
    pub period_end: String,
    pub income_statement: IncomeStatementReport,
    pub expense_breakdown: Vec<AccountAmount>,
    pub source_account_balances: Vec<AccountAmount>,
    pub balance_sheet: BalanceSheetReport,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomeStatementReport {
    pub income: Vec<AccountAmount>,
    pub expenses: Vec<AccountAmount>,
    pub total_income: f64,
    pub total_expenses: f64,
    pub net_income: f64,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceSheetReport {
    pub assets: Vec<AccountAmount>,
    pub liabilities: Vec<AccountAmount>,
    pub equity: Vec<AccountAmount>,
    pub retained_earnings: f64,
    pub total_assets: f64,
    pub total_liabilities: f64,
    pub total_equity: f64,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountAmount {
    pub account: String,
    pub amount: f64,
}

#[derive(Debug, Clone)]
struct Posting {
    date: String,
    account: String,
    amount: f64,
}

pub fn get_mvp_reports(input: ReportsInput) -> Result<MvpReports, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let validation = validate_workspace(root)?;
    if validation.status == LedgerStatus::Invalid {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "MVP Reports are blocked while the Workspace is in Invalid Ledger State.",
        ));
    }

    let all_postings = load_postings(root)?;
    let period_postings = all_postings
        .iter()
        .filter(|posting| posting.date >= input.period_start && posting.date <= input.period_end)
        .cloned()
        .collect::<Vec<_>>();

    let income = account_amounts(&period_postings, "Income", true);
    let expenses = account_amounts(&period_postings, "Expenses", false);
    let total_income = rounded_sum(&income);
    let total_expenses = rounded_sum(&expenses);
    let net_income = round_money(total_income - total_expenses);
    let source_account_balances = source_balances(&all_postings);
    let balance_sheet = balance_sheet(&all_postings, net_income);

    Ok(MvpReports {
        period_start: input.period_start,
        period_end: input.period_end,
        income_statement: IncomeStatementReport {
            income,
            expenses: expenses.clone(),
            total_income,
            total_expenses,
            net_income,
        },
        expense_breakdown: expenses,
        source_account_balances,
        balance_sheet,
    })
}

fn load_postings(root: &Path) -> Result<Vec<Posting>, WorkspaceError> {
    let mut postings = Vec::new();
    postings.extend(parse_opening_balances(root)?);
    for include in transaction_includes(root)? {
        postings.extend(parse_transaction_file(root.join(include))?);
    }
    Ok(postings)
}

fn parse_opening_balances(root: &Path) -> Result<Vec<Posting>, WorkspaceError> {
    let contents = fs::read_to_string(root.join("opening-balances.bean"))?;
    let mut postings = Vec::new();
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') {
            continue;
        }
        let parts = trimmed.split_whitespace().collect::<Vec<_>>();
        if parts.len() == 5 && parts[1] == "balance" {
            postings.push(Posting {
                date: parts[0].to_string(),
                account: parts[2].to_string(),
                amount: parts[3].parse::<f64>().unwrap_or(0.0),
            });
        }
    }
    Ok(postings)
}

fn transaction_includes(root: &Path) -> Result<Vec<String>, WorkspaceError> {
    let main = fs::read_to_string(root.join("main.bean"))?;
    Ok(main
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if !trimmed.starts_with("include \"transactions/") {
                return None;
            }
            trimmed
                .strip_prefix("include \"")
                .and_then(|value| value.strip_suffix('"'))
                .map(str::to_string)
        })
        .collect())
}

fn parse_transaction_file(path: impl AsRef<Path>) -> Result<Vec<Posting>, WorkspaceError> {
    let contents = fs::read_to_string(path)?;
    let mut postings = Vec::new();
    let mut current_date: Option<String> = None;

    for line in contents.lines() {
        if line.trim().is_empty() {
            continue;
        }
        if !line.starts_with(' ') {
            current_date = line.split_whitespace().next().map(str::to_string);
            continue;
        }
        let trimmed = line.trim();
        if trimmed.contains(':') && trimmed.ends_with('"') {
            continue;
        }
        let parts = trimmed.split_whitespace().collect::<Vec<_>>();
        if parts.len() == 3 && parts[2] == "USD" {
            if let Some(date) = current_date.clone() {
                postings.push(Posting {
                    date,
                    account: parts[0].to_string(),
                    amount: parts[1].parse::<f64>().unwrap_or(0.0),
                });
            }
        }
    }

    Ok(postings)
}

fn account_amounts(postings: &[Posting], root: &str, invert: bool) -> Vec<AccountAmount> {
    let mut totals = BTreeMap::<String, f64>::new();
    for posting in postings
        .iter()
        .filter(|posting| account_root(&posting.account) == root)
    {
        let amount = if invert {
            -posting.amount
        } else {
            posting.amount
        };
        *totals.entry(posting.account.clone()).or_default() += amount;
    }
    totals
        .into_iter()
        .filter_map(|(account, amount)| {
            let amount = round_money(amount);
            if amount.abs() < 0.005 {
                None
            } else {
                Some(AccountAmount { account, amount })
            }
        })
        .collect()
}

fn source_balances(postings: &[Posting]) -> Vec<AccountAmount> {
    let mut balances = BTreeMap::<String, f64>::new();
    for posting in postings.iter().filter(|posting| {
        posting.account.starts_with("Assets:Bank:")
            || posting.account.starts_with("Liabilities:CreditCards:")
    }) {
        *balances.entry(posting.account.clone()).or_default() += posting.amount;
    }
    balances
        .into_iter()
        .map(|(account, amount)| AccountAmount {
            account,
            amount: round_money(amount),
        })
        .collect()
}

fn balance_sheet(postings: &[Posting], retained_earnings: f64) -> BalanceSheetReport {
    let assets = account_amounts(postings, "Assets", false);
    let liabilities = account_amounts(postings, "Liabilities", true);
    let equity = account_amounts(postings, "Equity", true);
    let total_assets = rounded_sum(&assets);
    let total_liabilities = rounded_sum(&liabilities);
    let total_equity = round_money(rounded_sum(&equity) + retained_earnings);

    BalanceSheetReport {
        assets,
        liabilities,
        equity,
        retained_earnings,
        total_assets,
        total_liabilities,
        total_equity,
    }
}

fn rounded_sum(amounts: &[AccountAmount]) -> f64 {
    round_money(amounts.iter().map(|amount| amount.amount).sum())
}

fn round_money(amount: f64) -> f64 {
    (amount * 100.0).round() / 100.0
}

fn account_root(account: &str) -> &str {
    account.split(':').next().unwrap_or(account)
}

#[cfg(test)]
mod tests {
    use crate::workspace::approval::{
        approve_suggested_entry, approve_transfer_entry, get_suggested_entries,
        ApproveSuggestedEntryInput, ApproveTransferEntryInput,
    };
    use crate::workspace::create::create_workspace;
    use crate::workspace::imports::{import_statement_rows, CsvImportInput, CsvSourceMappingInput};
    use crate::workspace::reports::{get_mvp_reports, ReportsInput};
    use crate::workspace::source_accounts::{
        add_source_account, AddSourceAccountInput, SourceAccountKind,
    };
    use crate::workspace::types::CreateWorkspaceInput;
    use std::fs;
    use std::path::Path;

    #[test]
    fn renders_mvp_reports_from_validated_ledger_files() {
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
            opening_balance: Some("500.00".to_string()),
        })
        .unwrap();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            kind: SourceAccountKind::CreditCard,
            name: "Business Card".to_string(),
            opening_balance: None,
        })
        .unwrap();
        import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "checking.csv".to_string(),
            csv_contents:
                "Date,Description,Amount\n2026-01-04,Client payment,1200.00\n2026-01-05,Software,-29.99\n"
                    .to_string(),
            mapping: Some(mapping()),
        })
        .unwrap();
        let entries = get_suggested_entries(&created.root_path).unwrap();
        for entry in entries {
            let account = if entry.description == "Client payment" {
                "Income:Services"
            } else {
                "Expenses:Software"
            };
            approve_suggested_entry(ApproveSuggestedEntryInput {
                workspace_root_path: created.root_path.clone(),
                statement_row_id: entry.statement_row_id,
                ledger_account: account.to_string(),
            })
            .unwrap();
        }
        import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "checking-transfer.csv".to_string(),
            csv_contents: "Date,Description,Amount\n2026-01-07,Credit card payment,-100.00\n"
                .to_string(),
            mapping: Some(mapping()),
        })
        .unwrap();
        import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Liabilities:CreditCards:Business-Card".to_string(),
            source_file_name: "card.csv".to_string(),
            csv_contents: "Date,Description,Amount\n2026-01-07,Payment received,100.00\n"
                .to_string(),
            mapping: Some(mapping()),
        })
        .unwrap();
        let transfer = get_suggested_entries(&created.root_path)
            .unwrap()
            .into_iter()
            .find(|entry| entry.linked_statement_row.is_some())
            .unwrap();
        approve_transfer_entry(ApproveTransferEntryInput {
            workspace_root_path: created.root_path.clone(),
            statement_row_id: transfer.statement_row_id,
            linked_statement_row_id: transfer.linked_statement_row.unwrap().statement_row_id,
        })
        .unwrap();

        let reports = get_mvp_reports(ReportsInput {
            workspace_root_path: created.root_path.clone(),
            period_start: "2026-01-01".to_string(),
            period_end: "2026-01-31".to_string(),
        })
        .unwrap();

        assert_eq!(reports.income_statement.total_income, 1200.0);
        assert_eq!(reports.income_statement.total_expenses, 29.99);
        assert_eq!(reports.income_statement.net_income, 1170.01);
        assert_eq!(reports.expense_breakdown[0].account, "Expenses:Software");
        assert!(reports
            .source_account_balances
            .iter()
            .any(
                |balance| balance.account == "Assets:Bank:Operating-Checking"
                    && balance.amount == 1570.01
            ));
        assert_eq!(reports.balance_sheet.total_assets, 1570.01);
    }

    #[test]
    fn blocks_reports_during_invalid_ledger_state() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        fs::write(
            Path::new(&created.root_path).join("accounts.bean"),
            "not valid ledger content\n",
        )
        .unwrap();

        let error = get_mvp_reports(ReportsInput {
            workspace_root_path: created.root_path,
            period_start: "2026-01-01".to_string(),
            period_end: "2026-01-31".to_string(),
        })
        .unwrap_err();

        assert_eq!(
            error.code,
            crate::workspace::WorkspaceErrorCode::InvalidLedger
        );
    }

    fn mapping() -> CsvSourceMappingInput {
        CsvSourceMappingInput {
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
        }
    }
}
