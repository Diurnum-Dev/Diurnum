use crate::workspace::ai_adapter::get_ai_adapter_config;
use crate::workspace::approval::{
    approve_suggested_entry, approve_transfer_entry, get_suggested_entries,
    ApproveSuggestedEntryInput, ApproveTransferEntryInput, SuggestedEntryKind,
};
use crate::workspace::create::create_workspace;
use crate::workspace::imports::{import_statement_rows, CsvImportInput, CsvSourceMappingInput};
use crate::workspace::reports::{get_mvp_reports, ReportsInput};
use crate::workspace::source_accounts::{
    add_source_account, AddSourceAccountInput, SourceAccountKind,
};
use crate::workspace::types::{CreateWorkspaceInput, LedgerStatus};
use crate::workspace::validation::validate_workspace;
use crate::workspace::WorkspaceErrorCode;
use rusqlite::Connection;
use std::fs;
use std::path::Path;

#[test]
fn proves_the_golden_path_from_csv_setup_through_reports() {
    let tempdir = tempfile::tempdir().unwrap();
    let created = create_workspace(CreateWorkspaceInput {
        business_name: "Acme Studio".to_string(),
        base_currency: "USD".to_string(),
        books_start_date: "2026-01-01".to_string(),
        parent_directory: tempdir.path().to_string_lossy().to_string(),
    })
    .unwrap();
    let root = Path::new(&created.root_path);

    assert_eq!(created.ledger_status, LedgerStatus::Valid);
    assert_eq!(
        get_ai_adapter_config(&created.root_path).unwrap().command,
        None
    );

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

    let checking_csv =
        "Date,Description,Amount\n2026-01-04,Client receipt,1200.00\n2026-01-05,Software,-29.99\n";
    let first_import = import_statement_rows(CsvImportInput {
        workspace_root_path: created.root_path.clone(),
        source_account: checking_account(),
        source_file_name: "checking.csv".to_string(),
        csv_contents: checking_csv.to_string(),
        mapping: Some(mapping()),
    })
    .unwrap();
    assert_eq!(first_import.imported_count, 2);
    assert_eq!(first_import.skipped_duplicate_count, 0);

    let duplicate_import = import_statement_rows(CsvImportInput {
        workspace_root_path: created.root_path.clone(),
        source_account: checking_account(),
        source_file_name: "checking-copy.csv".to_string(),
        csv_contents: checking_csv.to_string(),
        mapping: None,
    })
    .unwrap();
    assert_eq!(duplicate_import.imported_count, 0);
    assert_eq!(duplicate_import.skipped_duplicate_count, 2);

    let mut entries = get_suggested_entries(&created.root_path).unwrap();
    assert_eq!(entries.len(), 2);
    entries.sort_by(|left, right| left.description.cmp(&right.description));
    for entry in entries {
        let ledger_account = match entry.description.as_str() {
            "Client receipt" => "Income:Services",
            "Software" => "Expenses:Software",
            description => panic!("unexpected suggested entry: {description}"),
        };
        approve_suggested_entry(ApproveSuggestedEntryInput {
            workspace_root_path: created.root_path.clone(),
            statement_row_id: entry.statement_row_id,
            ledger_account: ledger_account.to_string(),
        })
        .unwrap();
    }

    import_statement_rows(CsvImportInput {
        workspace_root_path: created.root_path.clone(),
        source_account: checking_account(),
        source_file_name: "checking-transfer.csv".to_string(),
        csv_contents: "Date,Description,Amount\n2026-01-07,Credit card payment,-100.00\n"
            .to_string(),
        mapping: None,
    })
    .unwrap();
    import_statement_rows(CsvImportInput {
        workspace_root_path: created.root_path.clone(),
        source_account: card_account(),
        source_file_name: "card.csv".to_string(),
        csv_contents: "Date,Description,Amount\n2026-01-07,Payment received,100.00\n".to_string(),
        mapping: Some(mapping()),
    })
    .unwrap();

    let transfer = get_suggested_entries(&created.root_path)
        .unwrap()
        .into_iter()
        .find(|entry| entry.kind == SuggestedEntryKind::Transfer)
        .unwrap();
    let linked = transfer.linked_statement_row.clone().unwrap();
    approve_transfer_entry(ApproveTransferEntryInput {
        workspace_root_path: created.root_path.clone(),
        statement_row_id: transfer.statement_row_id,
        linked_statement_row_id: linked.statement_row_id,
    })
    .unwrap();

    assert_eq!(
        validate_workspace(&created.root_path).unwrap().status,
        LedgerStatus::Valid
    );
    let main_bean = fs::read_to_string(root.join("main.bean")).unwrap();
    let monthly_bean = fs::read_to_string(root.join("transactions/2026-01.bean")).unwrap();
    assert!(main_bean.contains("include \"transactions/2026-01.bean\""));
    assert!(monthly_bean.contains("2026-01-04 * \"Client receipt\""));
    assert!(monthly_bean.contains("2026-01-05 * \"Software\""));
    assert_eq!(
        monthly_bean
            .matches("Transfer: Credit card payment / Payment received")
            .count(),
        1
    );
    assert!(monthly_bean.contains("diurnum_entry_id"));
    assert!(monthly_bean.contains("source_account"));
    assert!(monthly_bean.contains("linked_source_account"));

    let connection = Connection::open(root.join(".diurnum/diurnum.sqlite")).unwrap();
    assert_eq!(statement_row_count(&connection, "accounted"), 4);
    assert_eq!(statement_row_count(&connection, "pending"), 0);
    assert_eq!(accounted_rows_with_provenance(&connection), 4);
    assert_eq!(distinct_transfer_entry_ids(&connection), 1);

    let reports = get_mvp_reports(ReportsInput {
        workspace_root_path: created.root_path.clone(),
        period_start: "2026-01-01".to_string(),
        period_end: "2026-01-31".to_string(),
    })
    .unwrap();
    assert_eq!(reports.income_statement.total_income, 1200.0);
    assert_eq!(reports.income_statement.total_expenses, 29.99);
    assert_eq!(reports.income_statement.net_income, 1170.01);
    assert!(reports
        .expense_breakdown
        .iter()
        .any(|row| row.account == "Expenses:Software" && row.amount == 29.99));
    assert!(reports
        .source_account_balances
        .iter()
        .any(|row| row.account == checking_account() && row.amount == 1570.01));
    assert!(reports
        .source_account_balances
        .iter()
        .any(|row| row.account == card_account() && row.amount == 100.0));
    assert_eq!(reports.balance_sheet.total_assets, 1570.01);
    assert_eq!(reports.balance_sheet.total_liabilities, -100.0);

    import_statement_rows(CsvImportInput {
        workspace_root_path: created.root_path.clone(),
        source_account: checking_account(),
        source_file_name: "checking-pending.csv".to_string(),
        csv_contents: "Date,Description,Amount\n2026-01-08,Office supplies,-5.00\n".to_string(),
        mapping: None,
    })
    .unwrap();
    let pending = get_suggested_entries(&created.root_path)
        .unwrap()
        .into_iter()
        .find(|entry| entry.description == "Office supplies")
        .unwrap();

    fs::write(
        root.join("accounts.bean"),
        "2026-01-01 open Assets:Bank:Broken CAD\n",
    )
    .unwrap();
    let invalid_validation = validate_workspace(&created.root_path).unwrap();
    assert_eq!(invalid_validation.status, LedgerStatus::Invalid);
    assert!(invalid_validation
        .errors
        .iter()
        .any(|error| error.contains("Invalid currency CAD")));

    let approval_error = approve_suggested_entry(ApproveSuggestedEntryInput {
        workspace_root_path: created.root_path.clone(),
        statement_row_id: pending.statement_row_id,
        ledger_account: "Expenses:Office".to_string(),
    })
    .unwrap_err();
    assert_eq!(approval_error.code, WorkspaceErrorCode::InvalidLedger);
    assert!(approval_error
        .message
        .contains("Approval is blocked while the Workspace is in Invalid Ledger State"));

    let report_error = get_mvp_reports(ReportsInput {
        workspace_root_path: created.root_path,
        period_start: "2026-01-01".to_string(),
        period_end: "2026-01-31".to_string(),
    })
    .unwrap_err();
    assert_eq!(report_error.code, WorkspaceErrorCode::InvalidLedger);
    assert!(report_error
        .message
        .contains("MVP Reports are blocked while the Workspace is in Invalid Ledger State"));
}

fn statement_row_count(connection: &Connection, status: &str) -> i64 {
    connection
        .query_row(
            "select count(*) from statement_rows where status = ?1",
            [status],
            |row| row.get(0),
        )
        .unwrap()
}

fn accounted_rows_with_provenance(connection: &Connection) -> i64 {
    connection
        .query_row(
            "
            select count(*)
            from statement_rows
            where status = 'accounted'
              and diurnum_entry_id is not null
              and ledger_entry_file = 'transactions/2026-01.bean'
            ",
            [],
            |row| row.get(0),
        )
        .unwrap()
}

fn distinct_transfer_entry_ids(connection: &Connection) -> i64 {
    connection
        .query_row(
            "
            select count(distinct diurnum_entry_id)
            from statement_rows
            where description in ('Credit card payment', 'Payment received')
            ",
            [],
            |row| row.get(0),
        )
        .unwrap()
}

fn checking_account() -> String {
    "Assets:Bank:Operating-Checking".to_string()
}

fn card_account() -> String {
    "Liabilities:CreditCards:Business-Card".to_string()
}

fn mapping() -> CsvSourceMappingInput {
    CsvSourceMappingInput {
        posted_date_column: "Date".to_string(),
        description_column: "Description".to_string(),
        amount_column: Some("Amount".to_string()),
        debit_column: None,
        credit_column: None,
        status_column: None,
        check_number_column: None,
        date_format: None,
        memo_column: None,
        reference_id_column: None,
        payee_column: None,
        category_column: None,
                transaction_type_column: None,
                debit_type_value: None,
    }
}
