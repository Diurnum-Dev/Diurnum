use crate::workspace::beancount::{
    render_accounts_bean, render_main_bean, render_opening_balances_bean,
};
use crate::workspace::data_integrity::{atomic_write, ensure_snapshot_gitignore};
use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use crate::workspace::paths::{
    sanitize_workspace_folder_name, validate_books_start_date, validate_business_name,
    validate_currency,
};
use crate::workspace::types::{
    CreateWorkspaceInput, LedgerStatus, WorkspaceBusiness, WorkspaceLayout, WorkspaceManifest,
    WorkspaceSummary,
};
use crate::workspace::validation::validate_workspace;
use chrono::Utc;
use rusqlite::{params, Connection};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub fn create_workspace(input: CreateWorkspaceInput) -> Result<WorkspaceSummary, WorkspaceError> {
    let business_name = validate_business_name(&input.business_name)?;
    let base_currency = validate_currency(&input.base_currency)?;
    let books_start_date = validate_books_start_date(&input.books_start_date)?;
    let folder_name = sanitize_workspace_folder_name(&business_name)?;
    let root_path = PathBuf::from(input.parent_directory).join(folder_name);

    if root_path.exists() {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::DirectoryAlreadyExists,
            "A Workspace folder already exists at this location.",
        ));
    }

    fs::create_dir_all(&root_path)?;
    create_workspace_contents(
        &root_path,
        &business_name,
        &base_currency,
        &books_start_date,
    )?;
    ensure_snapshot_gitignore(&root_path)?;
    let ledger_validation = validate_workspace(&root_path)?;

    Ok(WorkspaceSummary {
        root_path: root_path.to_string_lossy().to_string(),
        business_name,
        base_currency,
        books_start_date,
        ledger_status: if ledger_validation.status == LedgerStatus::Valid {
            LedgerStatus::Valid
        } else {
            LedgerStatus::Invalid
        },
        ledger_validation,
    })
}

pub fn create_workspace_contents(
    root_path: &Path,
    business_name: &str,
    base_currency: &str,
    books_start_date: &str,
) -> Result<(), WorkspaceError> {
    fs::create_dir_all(root_path.join("transactions"))?;
    fs::create_dir_all(root_path.join("documents"))?;
    fs::create_dir_all(root_path.join("imports"))?;
    fs::create_dir_all(root_path.join(".diurnum").join("cache"))?;

    write_text(root_path.join("transactions").join(".gitkeep"), "")?;
    write_text(root_path.join("documents").join(".gitkeep"), "")?;
    write_text(root_path.join("imports").join(".gitkeep"), "")?;
    write_text(
        root_path.join(".diurnum").join("cache").join(".gitkeep"),
        "",
    )?;

    write_text(
        root_path.join("main.bean"),
        &render_main_bean(business_name, base_currency),
    )?;
    write_text(
        root_path.join("accounts.bean"),
        &render_accounts_bean(books_start_date, base_currency),
    )?;
    write_text(
        root_path.join("opening-balances.bean"),
        &render_opening_balances_bean(business_name),
    )?;

    let now = Utc::now().to_rfc3339();
    let manifest = WorkspaceManifest {
        schema_version: 1,
        app_created: true,
        business: WorkspaceBusiness {
            name: business_name.to_string(),
            base_currency: base_currency.to_string(),
            books_start_date: books_start_date.to_string(),
        },
        layout: WorkspaceLayout::default(),
        created_at: now.clone(),
        updated_at: now,
        editor_session: None,
    };
    write_text(
        root_path.join(".diurnum").join("workspace.json"),
        &serde_json::to_string_pretty(&manifest)
            .map_err(|error| WorkspaceError::io(error.to_string()))?,
    )?;

    initialize_sqlite(
        &root_path.join(".diurnum").join("diurnum.sqlite"),
        business_name,
        base_currency,
        books_start_date,
    )?;

    Ok(())
}

fn write_text(path: PathBuf, contents: &str) -> Result<(), WorkspaceError> {
    atomic_write(path, contents)
}

fn initialize_sqlite(
    path: &Path,
    business_name: &str,
    base_currency: &str,
    books_start_date: &str,
) -> Result<(), WorkspaceError> {
    let connection = Connection::open(path)?;

    connection.execute_batch(
        "
        create table workspace_metadata (
          key text primary key,
          value text not null
        );

        create table operation_log (
          id text primary key,
          operation_type text not null,
          payload_json text not null,
          created_at text not null
        );

        create table staging_area_placeholder (
          id text primary key,
          created_at text not null
        );

        create table source_mappings_placeholder (
          id text primary key,
          created_at text not null
        );

        create table categorization_rules_placeholder (
          id text primary key,
          created_at text not null
        );

        create table cache_state (
          key text primary key,
          value text not null,
          updated_at text not null
        );
        ",
    )?;

    let metadata = [
        ("workspace_schema_version", "1"),
        ("business_name", business_name),
        ("base_currency", base_currency),
        ("books_start_date", books_start_date),
    ];

    for (key, value) in metadata {
        connection.execute(
            "insert into workspace_metadata (key, value) values (?1, ?2)",
            params![key, value],
        )?;
    }

    connection.execute(
        "insert into operation_log (id, operation_type, payload_json, created_at) values (?1, ?2, ?3, ?4)",
        params![
            Uuid::new_v4().to_string(),
            "workspace.created",
            "{}",
            Utc::now().to_rfc3339()
        ],
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn creates_workspace_file_tree_manifest_and_sqlite() {
        let tempdir = tempfile::tempdir().unwrap();
        let summary = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();

        let root = PathBuf::from(&summary.root_path);
        assert!(root.join("main.bean").exists());
        assert!(root.join("accounts.bean").exists());
        assert!(root.join("opening-balances.bean").exists());
        assert!(root.join("transactions/.gitkeep").exists());
        assert!(root.join("documents/.gitkeep").exists());
        assert!(root.join("imports/.gitkeep").exists());
        assert!(root.join(".diurnum/cache/.gitkeep").exists());
        assert!(root.join(".diurnum/workspace.json").exists());
        assert!(root.join(".diurnum/diurnum.sqlite").exists());

        let manifest: WorkspaceManifest = serde_json::from_str(
            &fs::read_to_string(root.join(".diurnum/workspace.json")).unwrap(),
        )
        .unwrap();
        assert!(manifest.app_created);
        assert_eq!(manifest.business.name, "Acme Studio");
        assert_eq!(manifest.business.base_currency, "USD");
        assert_eq!(manifest.business.books_start_date, "2026-01-01");

        let connection = Connection::open(root.join(".diurnum/diurnum.sqlite")).unwrap();
        let business_name: String = connection
            .query_row(
                "select value from workspace_metadata where key = 'business_name'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(business_name, "Acme Studio");
    }

    #[test]
    fn refuses_to_overwrite_existing_workspace_directory() {
        let tempdir = tempfile::tempdir().unwrap();
        fs::create_dir(tempdir.path().join("Acme Studio")).unwrap();

        let error = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap_err();

        assert_eq!(error.code, WorkspaceErrorCode::DirectoryAlreadyExists);
    }
}
