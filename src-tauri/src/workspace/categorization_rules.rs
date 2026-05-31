use crate::workspace::errors::WorkspaceError;
use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategorizationRule {
    pub id: String,
    pub source_account: String,
    pub match_text: String,
    pub ledger_account: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCategorizationRuleInput {
    pub workspace_root_path: String,
    pub source_account: String,
    pub match_text: String,
    pub ledger_account: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCategorizationRuleInput {
    pub workspace_root_path: String,
    pub id: String,
    pub source_account: String,
    pub match_text: String,
    pub ledger_account: String,
}

pub fn list_categorization_rules(
    workspace_root_path: impl AsRef<Path>,
) -> Result<Vec<CategorizationRule>, WorkspaceError> {
    let connection = open_connection(workspace_root_path.as_ref())?;
    ensure_categorization_rules_table(&connection)?;
    load_rules(&connection)
}

pub(crate) fn list_categorization_rules_from_connection(
    connection: &Connection,
) -> Result<Vec<CategorizationRule>, WorkspaceError> {
    ensure_categorization_rules_table(connection)?;
    load_rules(connection)
}

pub fn create_categorization_rule(
    input: CreateCategorizationRuleInput,
) -> Result<CategorizationRule, WorkspaceError> {
    let connection = open_connection(Path::new(&input.workspace_root_path))?;
    ensure_categorization_rules_table(&connection)?;
    let now = Utc::now().to_rfc3339();
    let rule = CategorizationRule {
        id: Uuid::new_v4().to_string(),
        source_account: input.source_account.trim().to_string(),
        match_text: input.match_text.trim().to_string(),
        ledger_account: input.ledger_account.trim().to_string(),
        enabled: true,
        created_at: now.clone(),
        updated_at: now,
    };
    connection.execute(
        "
        insert into categorization_rules (
          id,
          source_account,
          match_text,
          ledger_account,
          enabled,
          created_at,
          updated_at
        ) values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ",
        params![
            rule.id,
            rule.source_account,
            rule.match_text,
            rule.ledger_account,
            i64::from(rule.enabled),
            rule.created_at,
            rule.updated_at
        ],
    )?;
    Ok(rule)
}

pub fn update_categorization_rule(
    input: UpdateCategorizationRuleInput,
) -> Result<CategorizationRule, WorkspaceError> {
    let connection = open_connection(Path::new(&input.workspace_root_path))?;
    ensure_categorization_rules_table(&connection)?;
    let updated_at = Utc::now().to_rfc3339();
    connection.execute(
        "
        update categorization_rules
        set source_account = ?2,
            match_text = ?3,
            ledger_account = ?4,
            updated_at = ?5
        where id = ?1
        ",
        params![
            input.id,
            input.source_account.trim(),
            input.match_text.trim(),
            input.ledger_account.trim(),
            updated_at
        ],
    )?;
    load_rule(&connection, &input.id)
}

pub fn set_categorization_rule_enabled(
    workspace_root_path: impl AsRef<Path>,
    id: &str,
    enabled: bool,
) -> Result<CategorizationRule, WorkspaceError> {
    let connection = open_connection(workspace_root_path.as_ref())?;
    ensure_categorization_rules_table(&connection)?;
    let updated_at = Utc::now().to_rfc3339();
    connection.execute(
        "
        update categorization_rules
        set enabled = ?2,
            updated_at = ?3
        where id = ?1
        ",
        params![id, i64::from(enabled), updated_at],
    )?;
    load_rule(&connection, id)
}

pub fn delete_categorization_rule(
    workspace_root_path: impl AsRef<Path>,
    id: &str,
) -> Result<(), WorkspaceError> {
    let connection = open_connection(workspace_root_path.as_ref())?;
    ensure_categorization_rules_table(&connection)?;
    connection.execute("delete from categorization_rules where id = ?1", [id])?;
    Ok(())
}

pub(crate) fn ensure_categorization_rules_table(
    connection: &Connection,
) -> Result<(), WorkspaceError> {
    connection.execute_batch(
        "
        create table if not exists categorization_rules (
          id text primary key,
          source_account text not null,
          match_text text not null,
          ledger_account text not null,
          enabled integer not null default 1,
          created_at text not null,
          updated_at text not null
        );
        ",
    )?;
    let enabled_column_exists = connection
        .prepare("pragma table_info(categorization_rules)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .any(|column| column == "enabled");
    if !enabled_column_exists {
        connection.execute(
            "alter table categorization_rules add column enabled integer not null default 1",
            [],
        )?;
    }
    Ok(())
}

pub(crate) fn matching_rule_for_row(
    connection: &Connection,
    source_account: &str,
    description: &str,
) -> Result<Option<CategorizationRule>, WorkspaceError> {
    ensure_categorization_rules_table(connection)?;
    let description = description.to_lowercase();
    Ok(load_rules(connection)?
        .into_iter()
        .filter(|rule| rule.source_account == source_account)
        .filter(|rule| rule.enabled)
        .find(|rule| description.contains(&rule.match_text.to_lowercase())))
}

fn load_rules(connection: &Connection) -> Result<Vec<CategorizationRule>, WorkspaceError> {
    let mut statement = connection.prepare(
        "
        select id, source_account, match_text, ledger_account, enabled, created_at, updated_at
        from categorization_rules
        order by source_account, match_text
        ",
    )?;
    let rules = statement
        .query_map([], |row| {
            Ok(CategorizationRule {
                id: row.get(0)?,
                source_account: row.get(1)?,
                match_text: row.get(2)?,
                ledger_account: row.get(3)?,
                enabled: row.get::<_, i64>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rules)
}

fn load_rule(connection: &Connection, id: &str) -> Result<CategorizationRule, WorkspaceError> {
    connection
        .query_row(
            "
            select id, source_account, match_text, ledger_account, enabled, created_at, updated_at
            from categorization_rules
            where id = ?1
            ",
            [id],
            |row| {
                Ok(CategorizationRule {
                    id: row.get(0)?,
                    source_account: row.get(1)?,
                    match_text: row.get(2)?,
                    ledger_account: row.get(3)?,
                    enabled: row.get::<_, i64>(4)? != 0,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            },
        )
        .map_err(WorkspaceError::from)
}

fn open_connection(root: &Path) -> Result<Connection, WorkspaceError> {
    Ok(Connection::open(
        root.join(".diurnum").join("diurnum.sqlite"),
    )?)
}

#[cfg(test)]
mod tests {
    use crate::workspace::categorization_rules::{
        create_categorization_rule, list_categorization_rules, matching_rule_for_row,
        update_categorization_rule, CreateCategorizationRuleInput, UpdateCategorizationRuleInput,
    };
    use crate::workspace::create::create_workspace;
    use crate::workspace::types::CreateWorkspaceInput;
    use rusqlite::Connection;
    use std::path::Path;

    #[test]
    fn creates_updates_lists_and_matches_source_scoped_rules() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();

        let rule = create_categorization_rule(CreateCategorizationRuleInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            match_text: "Software".to_string(),
            ledger_account: "Expenses:Software".to_string(),
        })
        .unwrap();
        let updated = update_categorization_rule(UpdateCategorizationRuleInput {
            workspace_root_path: created.root_path.clone(),
            id: rule.id.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            match_text: "SaaS".to_string(),
            ledger_account: "Expenses:Software".to_string(),
        })
        .unwrap();

        assert_eq!(updated.match_text, "SaaS");
        assert_eq!(
            list_categorization_rules(&created.root_path).unwrap().len(),
            1
        );

        let connection = Connection::open(
            Path::new(&created.root_path)
                .join(".diurnum")
                .join("diurnum.sqlite"),
        )
        .unwrap();
        let matched = matching_rule_for_row(
            &connection,
            "Assets:Bank:Operating-Checking",
            "Monthly SaaS subscription",
        )
        .unwrap()
        .unwrap();
        assert_eq!(matched.id, rule.id);
        assert!(matching_rule_for_row(
            &connection,
            "Assets:Bank:Savings",
            "Monthly SaaS subscription"
        )
        .unwrap()
        .is_none());
    }
}
