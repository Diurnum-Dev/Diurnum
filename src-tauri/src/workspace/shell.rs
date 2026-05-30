use crate::workspace::errors::WorkspaceError;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePathStatus {
    pub path: String,
    pub exists: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitStatus {
    pub is_repository: bool,
    pub branch_name: Option<String>,
    pub uncommitted_changes_count: usize,
}

pub fn inspect_workspace_paths(paths: Vec<String>) -> Vec<WorkspacePathStatus> {
    paths
        .into_iter()
        .map(|path| WorkspacePathStatus {
            exists: Path::new(&path).is_dir(),
            path,
        })
        .collect()
}

pub fn get_workspace_git_status(
    path: impl AsRef<Path>,
) -> Result<WorkspaceGitStatus, WorkspaceError> {
    let root = path.as_ref();
    if !root.exists() || !is_git_repository(root) {
        return Ok(WorkspaceGitStatus {
            is_repository: false,
            branch_name: None,
            uncommitted_changes_count: 0,
        });
    }

    Ok(WorkspaceGitStatus {
        is_repository: true,
        branch_name: git_stdout(root, ["rev-parse", "--abbrev-ref", "HEAD"]).ok(),
        uncommitted_changes_count: git_stdout(root, ["status", "--porcelain"])
            .map(|output| {
                output
                    .lines()
                    .filter(|line| !line.trim().is_empty())
                    .count()
            })
            .unwrap_or(0),
    })
}

fn is_git_repository(root: &Path) -> bool {
    git_stdout(root, ["rev-parse", "--is-inside-work-tree"])
        .map(|output| output.trim() == "true")
        .unwrap_or(false)
}

fn git_stdout<const N: usize>(root: &Path, args: [&str; N]) -> Result<String, WorkspaceError> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()?;

    if !output.status.success() {
        return Err(WorkspaceError::io(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_existing_and_missing_workspace_paths() {
        let tempdir = tempfile::tempdir().unwrap();
        let statuses = inspect_workspace_paths(vec![
            tempdir.path().to_string_lossy().to_string(),
            tempdir.path().join("missing").to_string_lossy().to_string(),
        ]);

        assert_eq!(statuses[0].exists, true);
        assert_eq!(statuses[1].exists, false);
    }

    #[test]
    fn non_git_workspace_has_no_git_ui_state() {
        let tempdir = tempfile::tempdir().unwrap();
        let status = get_workspace_git_status(tempdir.path()).unwrap();

        assert!(!status.is_repository);
        assert_eq!(status.branch_name, None);
        assert_eq!(status.uncommitted_changes_count, 0);
    }
}
