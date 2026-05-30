use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use crate::workspace::open::open_workspace;
use crate::workspace::types::{LedgerValidationSummary, WorkspaceSummary};
use crate::workspace::validation::validate_workspace;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};
use uuid::Uuid;

const SNAPSHOTS_DIRECTORY: &str = ".diurnum/snapshots";
const SNAPSHOT_MANIFEST: &str = "snapshot.json";
const SNAPSHOT_RETENTION_LIMIT: usize = 10;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotSummary {
    pub id: String,
    pub created_at: String,
    pub reason: SnapshotReason,
    pub affected_files: Vec<String>,
    pub relative_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SnapshotReason {
    Approval,
    Daily,
    PreRestore,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreSnapshotInput {
    pub workspace_root_path: String,
    pub snapshot_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLedgerFileInput {
    pub workspace_root_path: String,
    pub relative_path: String,
    pub contents: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotManifest {
    id: String,
    created_at: String,
    reason: SnapshotReason,
    affected_files: Vec<String>,
}

pub fn atomic_write(path: impl AsRef<Path>, contents: &str) -> Result<(), WorkspaceError> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let file_name = path
        .file_name()
        .ok_or_else(|| WorkspaceError::io("Atomic write target has no file name."))?
        .to_string_lossy();
    let temp_path = path.with_file_name(format!(".{file_name}.tmp-{}", Uuid::new_v4()));

    let write_result = (|| -> Result<(), WorkspaceError> {
        let mut file = File::create(&temp_path)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        fs::rename(&temp_path, path)?;
        sync_parent_directory(path);
        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }

    write_result
}

pub fn atomic_append(path: impl AsRef<Path>, contents: &str) -> Result<(), WorkspaceError> {
    let path = path.as_ref();
    let mut updated = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == ErrorKind::NotFound => String::new(),
        Err(error) => return Err(WorkspaceError::from(error)),
    };
    updated.push_str(contents);
    atomic_write(path, &updated)
}

pub fn ensure_snapshot_gitignore(root: impl AsRef<Path>) -> Result<(), WorkspaceError> {
    let root = root.as_ref();
    let gitignore_path = root.join(".gitignore");
    let existing = match fs::read_to_string(&gitignore_path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == ErrorKind::NotFound => String::new(),
        Err(error) => return Err(WorkspaceError::from(error)),
    };
    let mut lines = existing.lines().map(str::to_string).collect::<Vec<_>>();

    for required in [".diurnum/snapshots/", ".ledgerly/snapshots/"] {
        if !lines.iter().any(|line| line.trim() == required) {
            lines.push(required.to_string());
        }
    }

    let mut next = lines.join("\n");
    next.push('\n');
    if next != existing {
        atomic_write(gitignore_path, &next)?;
    }

    Ok(())
}

pub fn create_snapshot(
    root: impl AsRef<Path>,
    reason: SnapshotReason,
) -> Result<SnapshotSummary, WorkspaceError> {
    create_snapshot_with_retention(root, reason, true)
}

fn create_snapshot_with_retention(
    root: impl AsRef<Path>,
    reason: SnapshotReason,
    prune_after_create: bool,
) -> Result<SnapshotSummary, WorkspaceError> {
    let root = root.as_ref();
    let created_at = Utc::now().to_rfc3339();
    let id = format!("{}-{}", path_timestamp(), &Uuid::new_v4().to_string()[..8]);
    let snapshot_root = root.join(SNAPSHOTS_DIRECTORY).join(&id);
    fs::create_dir_all(&snapshot_root)?;

    let affected_files = ledger_files(root)?;
    for relative_path in &affected_files {
        let source_path = root.join(relative_path);
        let destination_path = snapshot_root.join(relative_path);
        let contents = fs::read_to_string(source_path)?;
        atomic_write(destination_path, &contents)?;
    }

    let manifest = SnapshotManifest {
        id: id.clone(),
        created_at: created_at.clone(),
        reason: reason.clone(),
        affected_files: affected_files.clone(),
    };
    atomic_write(
        snapshot_root.join(SNAPSHOT_MANIFEST),
        &serde_json::to_string_pretty(&manifest)
            .map_err(|error| WorkspaceError::io(error.to_string()))?,
    )?;

    if prune_after_create {
        prune_old_snapshots(root)?;
    }
    Ok(SnapshotSummary {
        id: id.clone(),
        created_at,
        reason,
        affected_files,
        relative_path: format!("{SNAPSHOTS_DIRECTORY}/{id}"),
    })
}

pub fn ensure_daily_snapshot(root: impl AsRef<Path>) -> Result<(), WorkspaceError> {
    let root = root.as_ref();
    let today = Utc::now().date_naive().to_string();
    let has_today = list_snapshots(root)?.iter().any(|snapshot| {
        snapshot.reason == SnapshotReason::Daily && snapshot.created_at.starts_with(&today)
    });
    if !has_today {
        create_snapshot(root, SnapshotReason::Daily)?;
    }
    Ok(())
}

pub fn list_snapshots(root: impl AsRef<Path>) -> Result<Vec<SnapshotSummary>, WorkspaceError> {
    let root = root.as_ref();
    let snapshots_root = root.join(SNAPSHOTS_DIRECTORY);
    if !snapshots_root.exists() {
        return Ok(Vec::new());
    }

    let mut snapshots = Vec::new();
    for entry in fs::read_dir(&snapshots_root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let manifest_path = entry.path().join(SNAPSHOT_MANIFEST);
        let Ok(contents) = fs::read_to_string(&manifest_path) else {
            continue;
        };
        let Ok(manifest) = serde_json::from_str::<SnapshotManifest>(&contents) else {
            continue;
        };
        snapshots.push(SnapshotSummary {
            relative_path: format!("{SNAPSHOTS_DIRECTORY}/{}", manifest.id),
            id: manifest.id,
            created_at: manifest.created_at,
            reason: manifest.reason,
            affected_files: manifest.affected_files,
        });
    }

    snapshots.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then(right.id.cmp(&left.id))
    });
    Ok(snapshots)
}

pub fn restore_snapshot(input: RestoreSnapshotInput) -> Result<WorkspaceSummary, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let snapshot = snapshot_by_id(root, &input.snapshot_id)?;
    create_snapshot_with_retention(root, SnapshotReason::PreRestore, false)?;

    let snapshot_root = root.join(&snapshot.relative_path);
    for relative_path in snapshot.affected_files {
        let destination_path = workspace_relative_path(root, &relative_path)?;
        let contents = fs::read_to_string(snapshot_root.join(&relative_path))?;
        atomic_write(destination_path, &contents)?;
    }

    prune_old_snapshots(root)?;
    open_workspace(root)
}

pub fn save_ledger_file(
    input: SaveLedgerFileInput,
) -> Result<LedgerValidationSummary, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let destination_path = workspace_relative_path(root, &input.relative_path)?;
    if destination_path
        .extension()
        .and_then(|extension| extension.to_str())
        != Some("bean")
    {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Ledger Editor saves can only write .bean files.",
        ));
    }

    atomic_write(destination_path, &input.contents)?;
    validate_workspace(root)
}

fn snapshot_by_id(root: &Path, snapshot_id: &str) -> Result<SnapshotSummary, WorkspaceError> {
    if snapshot_id.contains('/') || snapshot_id.contains('\\') || snapshot_id.contains("..") {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Snapshot id is invalid.",
        ));
    }

    list_snapshots(root)?
        .into_iter()
        .find(|snapshot| snapshot.id == snapshot_id)
        .ok_or_else(|| {
            WorkspaceError::new(
                WorkspaceErrorCode::MissingLedgerFile,
                "Snapshot could not be found.",
            )
        })
}

fn prune_old_snapshots(root: &Path) -> Result<(), WorkspaceError> {
    let snapshots = list_snapshots(root)?;
    for snapshot in snapshots.into_iter().skip(SNAPSHOT_RETENTION_LIMIT) {
        fs::remove_dir_all(root.join(snapshot.relative_path))?;
    }
    Ok(())
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
            let relative_path = path
                .strip_prefix(root)
                .map_err(|error| WorkspaceError::io(error.to_string()))?
                .to_string_lossy()
                .to_string();
            files.push(relative_path);
        }
    }
    Ok(())
}

fn workspace_relative_path(root: &Path, relative_path: &str) -> Result<PathBuf, WorkspaceError> {
    let path = Path::new(relative_path);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::Prefix(_) | Component::RootDir
            )
        })
    {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Workspace file path must stay inside the Workspace.",
        ));
    }
    Ok(root.join(path))
}

fn path_timestamp() -> String {
    Utc::now().format("%Y-%m-%dT%H-%M-%S%.3fZ").to_string()
}

fn sync_parent_directory(path: &Path) {
    #[cfg(unix)]
    if let Some(parent) = path.parent() {
        if let Ok(directory) = File::open(parent) {
            let _ = directory.sync_all();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::create::{create_workspace, create_workspace_contents};
    use crate::workspace::types::{CreateWorkspaceInput, LedgerStatus};

    #[test]
    fn atomic_append_replaces_the_whole_file_without_tmp_files() {
        let tempdir = tempfile::tempdir().unwrap();
        let path = tempdir.path().join("main.bean");
        atomic_write(&path, "one\n").unwrap();
        atomic_append(&path, "two\n").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "one\ntwo\n");
        let leftovers = fs::read_dir(tempdir.path())
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp-"))
            .count();
        assert_eq!(leftovers, 0);
    }

    #[test]
    fn creates_lists_prunes_and_restores_snapshots() {
        let tempdir = tempfile::tempdir().unwrap();
        create_workspace_contents(tempdir.path(), "Acme Studio", "USD", "2026-01-01").unwrap();

        let snapshot = create_snapshot(tempdir.path(), SnapshotReason::Approval).unwrap();
        atomic_write(tempdir.path().join("main.bean"), "broken\n").unwrap();

        let restored = restore_snapshot(RestoreSnapshotInput {
            workspace_root_path: tempdir.path().to_string_lossy().to_string(),
            snapshot_id: snapshot.id,
        })
        .unwrap();

        assert_eq!(restored.ledger_status, LedgerStatus::Valid);
        assert!(fs::read_to_string(tempdir.path().join("main.bean"))
            .unwrap()
            .contains("include \"accounts.bean\""));
        assert!(list_snapshots(tempdir.path())
            .unwrap()
            .iter()
            .any(|snapshot| snapshot.reason == SnapshotReason::PreRestore));

        for _ in 0..12 {
            create_snapshot(tempdir.path(), SnapshotReason::Approval).unwrap();
        }
        assert_eq!(
            list_snapshots(tempdir.path()).unwrap().len(),
            SNAPSHOT_RETENTION_LIMIT
        );
    }

    #[test]
    fn daily_snapshot_is_created_once_per_day() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        let root = Path::new(&created.root_path);

        ensure_daily_snapshot(root).unwrap();
        ensure_daily_snapshot(root).unwrap();

        let daily_count = list_snapshots(root)
            .unwrap()
            .iter()
            .filter(|snapshot| snapshot.reason == SnapshotReason::Daily)
            .count();
        assert_eq!(daily_count, 1);
    }

    #[test]
    fn snapshot_gitignore_keeps_workspace_metadata_committable() {
        let tempdir = tempfile::tempdir().unwrap();
        ensure_snapshot_gitignore(tempdir.path()).unwrap();

        let gitignore = fs::read_to_string(tempdir.path().join(".gitignore")).unwrap();
        assert!(gitignore.contains(".diurnum/snapshots/"));
        assert!(gitignore.contains(".ledgerly/snapshots/"));
        assert!(!gitignore.lines().any(|line| line.trim() == ".diurnum/"));
        assert!(!gitignore.lines().any(|line| line.trim() == ".ledgerly/"));
    }

    #[test]
    fn ledger_editor_save_uses_atomic_write_and_validates_workspace() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();

        let validation = save_ledger_file(SaveLedgerFileInput {
            workspace_root_path: created.root_path.clone(),
            relative_path: "main.bean".to_string(),
            contents: "include \"accounts.bean\"\ninclude \"opening-balances.bean\"\n".to_string(),
        })
        .unwrap();

        assert_eq!(validation.status, LedgerStatus::Valid);
        let traversal = save_ledger_file(SaveLedgerFileInput {
            workspace_root_path: created.root_path,
            relative_path: "../outside.bean".to_string(),
            contents: "".to_string(),
        })
        .unwrap_err();
        assert_eq!(traversal.code, WorkspaceErrorCode::InvalidLedger);
    }
}
