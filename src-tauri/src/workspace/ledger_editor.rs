use crate::workspace::data_integrity::atomic_write;
use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use crate::workspace::types::{LedgerEditorSession, LedgerEditorTabSession, WorkspaceManifest};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadLedgerFileInput {
    pub workspace_root_path: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLedgerEditorSessionInput {
    pub workspace_root_path: String,
    pub session: LedgerEditorSession,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerFileSnapshot {
    pub relative_path: String,
    pub contents: String,
    pub modified_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEditorState {
    pub files: Vec<String>,
    pub session: LedgerEditorSession,
}

pub fn get_ledger_editor_state(
    root: impl AsRef<Path>,
) -> Result<LedgerEditorState, WorkspaceError> {
    let root = root.as_ref();
    let manifest = read_manifest(root)?;
    let files = ledger_files(root)?;
    let session = sanitize_session(manifest.editor_session, &files);

    Ok(LedgerEditorState { files, session })
}

pub fn read_ledger_file(input: ReadLedgerFileInput) -> Result<LedgerFileSnapshot, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let path = ledger_file_path(root, &input.relative_path)?;
    let contents = fs::read_to_string(&path)?;

    Ok(LedgerFileSnapshot {
        relative_path: input.relative_path,
        contents,
        modified_at: file_modified_at(&path)?,
    })
}

pub fn save_ledger_editor_session(
    input: SaveLedgerEditorSessionInput,
) -> Result<LedgerEditorSession, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let mut manifest = read_manifest(root)?;
    let files = ledger_files(root)?;
    let session = sanitize_session(Some(input.session), &files);
    manifest.updated_at = Utc::now().to_rfc3339();
    manifest.editor_session = Some(session.clone());
    write_manifest(root, &manifest)?;

    Ok(session)
}

fn sanitize_session(session: Option<LedgerEditorSession>, files: &[String]) -> LedgerEditorSession {
    let fallback = "main.bean".to_string();
    let file_exists = |path: &String| files.iter().any(|file| file == path);
    let mut open_tabs = session
        .as_ref()
        .map(|session| session.open_tabs.clone())
        .unwrap_or_default()
        .into_iter()
        .filter(|tab| file_exists(&tab.relative_path))
        .collect::<Vec<_>>();

    if open_tabs.is_empty() {
        open_tabs.push(LedgerEditorTabSession {
            relative_path: fallback.clone(),
            cursor: 0,
            scroll_top: 0,
        });
    }

    let active_tab = session
        .as_ref()
        .map(|session| session.active_tab.clone())
        .filter(file_exists)
        .unwrap_or_else(|| open_tabs[0].relative_path.clone());

    let recently_closed_tabs = session
        .map(|session| session.recently_closed_tabs)
        .unwrap_or_default()
        .into_iter()
        .filter(|tab| file_exists(&tab.relative_path))
        .collect();

    LedgerEditorSession {
        open_tabs,
        active_tab,
        recently_closed_tabs,
    }
}

fn ledger_files(root: &Path) -> Result<Vec<String>, WorkspaceError> {
    let mut files = Vec::new();
    collect_ledger_files(root, root, &mut files)?;
    files.sort();
    Ok(files)
}

fn collect_ledger_files(
    root: &Path,
    directory: &Path,
    files: &mut Vec<String>,
) -> Result<(), WorkspaceError> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            if path == root.join(".diurnum") || path == root.join(".ledgerly") {
                continue;
            }
            collect_ledger_files(root, &path, files)?;
        } else if path.extension().and_then(|extension| extension.to_str()) == Some("bean") {
            files.push(
                path.strip_prefix(root)
                    .map_err(|error| WorkspaceError::io(error.to_string()))?
                    .to_string_lossy()
                    .to_string(),
            );
        }
    }
    Ok(())
}

fn ledger_file_path(root: &Path, relative_path: &str) -> Result<PathBuf, WorkspaceError> {
    let path = workspace_relative_path(root, relative_path)?;
    if path.extension().and_then(|extension| extension.to_str()) != Some("bean") {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Ledger Editor can only open .bean files.",
        ));
    }
    Ok(path)
}

fn read_manifest(root: &Path) -> Result<WorkspaceManifest, WorkspaceError> {
    let manifest_path = root.join(".diurnum").join("workspace.json");
    serde_json::from_str(&fs::read_to_string(manifest_path)?).map_err(|_| {
        WorkspaceError::new(
            WorkspaceErrorCode::MissingManifest,
            "Workspace manifest is unreadable.",
        )
    })
}

fn write_manifest(root: &Path, manifest: &WorkspaceManifest) -> Result<(), WorkspaceError> {
    let contents = serde_json::to_string_pretty(manifest)
        .map_err(|error| WorkspaceError::io(error.to_string()))?;
    atomic_write(root.join(".diurnum").join("workspace.json"), &contents)
}

fn workspace_relative_path(root: &Path, relative_path: &str) -> Result<PathBuf, WorkspaceError> {
    let path = Path::new(relative_path);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Workspace path escapes the Workspace root.",
        ));
    }
    Ok(root.join(path))
}

fn file_modified_at(path: &Path) -> Result<u64, WorkspaceError> {
    let modified = fs::metadata(path)?.modified()?;
    let duration = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|error| WorkspaceError::io(error.to_string()))?;
    Ok(duration.as_millis() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::create::create_workspace;
    use crate::workspace::types::CreateWorkspaceInput;

    #[test]
    fn editor_state_defaults_to_main_bean() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();

        let state = get_ledger_editor_state(created.root_path).unwrap();

        assert!(state.files.contains(&"main.bean".to_string()));
        assert_eq!(state.session.active_tab, "main.bean");
        assert_eq!(state.session.open_tabs[0].relative_path, "main.bean");
    }

    #[test]
    fn saves_editor_session_in_workspace_manifest() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();

        let session = save_ledger_editor_session(SaveLedgerEditorSessionInput {
            workspace_root_path: created.root_path.clone(),
            session: LedgerEditorSession {
                active_tab: "accounts.bean".to_string(),
                open_tabs: vec![LedgerEditorTabSession {
                    relative_path: "accounts.bean".to_string(),
                    cursor: 12,
                    scroll_top: 4,
                }],
                recently_closed_tabs: vec![],
            },
        })
        .unwrap();

        assert_eq!(session.active_tab, "accounts.bean");

        let restored = get_ledger_editor_state(created.root_path).unwrap();
        assert_eq!(restored.session.active_tab, "accounts.bean");
        assert_eq!(restored.session.open_tabs[0].cursor, 12);
    }
}
