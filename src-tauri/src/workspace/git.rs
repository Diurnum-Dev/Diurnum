use crate::workspace::data_integrity::ensure_snapshot_gitignore;
use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

const RECENT_COMMITS_LIMIT: usize = 20;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorkingTreeEntry {
    pub path: String,
    pub original_path: Option<String>,
    pub status: String,
    pub status_label: String,
    pub is_staged: bool,
    pub is_untracked: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitSummary {
    pub hash: String,
    pub short_hash: String,
    pub committed_at: String,
    pub summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitDiff {
    pub hash: String,
    pub short_hash: String,
    pub committed_at: String,
    pub summary: String,
    pub diff: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitWorkspaceChangesInput {
    pub workspace_root_path: String,
    pub message: String,
    #[serde(default)]
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitResult {
    pub committed: bool,
    pub commit_hash: Option<String>,
    pub warning: Option<String>,
    pub hook_output: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPanelState {
    pub is_repository: bool,
    pub branch_name: Option<String>,
    pub uncommitted_changes_count: usize,
    pub working_tree: Vec<GitWorkingTreeEntry>,
    pub recent_commits: Vec<GitCommitSummary>,
    pub warning: Option<String>,
    pub hook_output: Option<String>,
}

pub fn ensure_git_workspace_metadata(root: impl AsRef<Path>) -> Result<(), WorkspaceError> {
    let root = root.as_ref();
    if is_git_repository(root)? {
        ensure_snapshot_gitignore(root)?;
    }
    Ok(())
}

pub fn get_git_panel_state(root: impl AsRef<Path>) -> Result<GitPanelState, WorkspaceError> {
    let root = root.as_ref();
    if !is_git_repository(root)? {
        return Ok(GitPanelState {
            is_repository: false,
            branch_name: None,
            uncommitted_changes_count: 0,
            working_tree: Vec::new(),
            recent_commits: Vec::new(),
            warning: None,
            hook_output: None,
        });
    }

    let branch_name = git_stdout(root, ["rev-parse", "--abbrev-ref", "HEAD"])?;
    let working_tree = list_working_tree_entries(root)?;
    let recent_commits = list_recent_commits(root, RECENT_COMMITS_LIMIT)?;
    let uncommitted_changes_count = working_tree.len();
    Ok(GitPanelState {
        is_repository: true,
        branch_name: Some(branch_name),
        uncommitted_changes_count,
        working_tree,
        recent_commits,
        warning: None,
        hook_output: None,
    })
}

pub fn list_recent_commits(
    root: impl AsRef<Path>,
    limit: usize,
) -> Result<Vec<GitCommitSummary>, WorkspaceError> {
    let root = root.as_ref();
    if !is_git_repository(root)? {
        return Ok(Vec::new());
    }

    let output = git_stdout(
        root,
        [
            "log",
            &format!("-n{limit}"),
            "--date=iso-strict",
            "--pretty=format:%H%x1f%h%x1f%aI%x1f%s",
        ],
    )?;

    let commits = output
        .lines()
        .filter_map(|line| {
            let mut parts = line.split('\x1f');
            Some(GitCommitSummary {
                hash: parts.next()?.to_string(),
                short_hash: parts.next()?.to_string(),
                committed_at: parts.next()?.to_string(),
                summary: parts.next()?.to_string(),
            })
        })
        .collect::<Vec<_>>();
    Ok(commits)
}

pub fn get_commit_diff(
    root: impl AsRef<Path>,
    commit_hash: &str,
) -> Result<GitCommitDiff, WorkspaceError> {
    let root = root.as_ref();
    if !is_git_repository(root)? {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Git history is unavailable for non-repository Workspaces.",
        ));
    }

    let summary = git_stdout(
        root,
        [
            "show",
            "-s",
            "--date=iso-strict",
            "--pretty=format:%H%x1f%h%x1f%aI%x1f%s",
            commit_hash,
        ],
    )?;
    let mut parts = summary.split('\x1f');
    let hash = parts.next().unwrap_or_default().to_string();
    let short_hash = parts.next().unwrap_or_default().to_string();
    let committed_at = parts.next().unwrap_or_default().to_string();
    let summary = parts.next().unwrap_or_default().to_string();
    let diff = git_stdout(root, ["show", "--format=", "--unified=3", "--no-color", commit_hash])?;

    Ok(GitCommitDiff {
        hash,
        short_hash,
        committed_at,
        summary,
        diff,
    })
}

pub fn commit_workspace_changes(
    input: CommitWorkspaceChangesInput,
) -> Result<GitCommitResult, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    if !is_git_repository(root)? {
        return Ok(GitCommitResult {
            committed: false,
            commit_hash: None,
            warning: Some("Git Integration is unavailable because this Workspace is not a git repository.".to_string()),
            hook_output: None,
        });
    }

    let message = input.message.trim();
    if message.is_empty() {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Git commits need a message.",
        ));
    }

    if input.paths.is_empty() {
        stage_all_changes(root)?;
    } else {
        stage_paths(root, &input.paths)?;
    }

    if is_index_clean(root)? {
        return Ok(GitCommitResult {
            committed: false,
            commit_hash: None,
            warning: None,
            hook_output: None,
        });
    }

    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .arg("commit")
        .arg("-m")
        .arg(message)
        .output()?;
    if !output.status.success() {
        return Ok(GitCommitResult {
            committed: false,
            commit_hash: None,
            warning: Some("Git commit failed.".to_string()),
            hook_output: combine_output(&output),
        });
    }

    let commit_hash = git_stdout(root, ["rev-parse", "HEAD"])?;
    Ok(GitCommitResult {
        committed: true,
        commit_hash: Some(commit_hash),
        warning: None,
        hook_output: None,
    })
}

fn is_git_repository(root: &Path) -> Result<bool, WorkspaceError> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["rev-parse", "--is-inside-work-tree"])
        .output()?;

    if !output.status.success() {
        return Ok(false);
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim() == "true")
}

fn is_index_clean(root: &Path) -> Result<bool, WorkspaceError> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["diff", "--cached", "--quiet"])
        .output()?;
    Ok(output.status.success())
}

fn stage_all_changes(root: &Path) -> Result<(), WorkspaceError> {
    run_git(root, ["add", "-A", "."])?;
    Ok(())
}

fn stage_paths(root: &Path, paths: &[String]) -> Result<(), WorkspaceError> {
    let mut command = Command::new("git");
    command.arg("-C").arg(root).arg("add").arg("-A").arg("--");
    for path in paths {
        command.arg(path);
    }
    let output = command.output()?;
    if !output.status.success() {
        return Err(WorkspaceError::io(
            combine_output(&output).unwrap_or_else(|| "Git add failed.".to_string()),
        ));
    }
    Ok(())
}

fn list_working_tree_entries(root: &Path) -> Result<Vec<GitWorkingTreeEntry>, WorkspaceError> {
    let output = git_stdout(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])?;
    let mut records = output.split('\0').peekable();
    let mut entries = Vec::new();
    while let Some(record) = records.next() {
        if record.is_empty() {
            continue;
        }
        let status = record.get(0..2).unwrap_or("??").to_string();
        let path = record.get(3..).unwrap_or("").to_string();
        let is_rename = status.starts_with('R') || status.starts_with('C');
        if is_rename {
            let target_path = records.next().unwrap_or("").to_string();
            entries.push(GitWorkingTreeEntry {
                path: target_path,
                original_path: if path.is_empty() { None } else { Some(path) },
                status: status.clone(),
                status_label: status_label(&status),
                is_staged: status.as_bytes().first().copied().unwrap_or(b' ') != b' ',
                is_untracked: status == "??",
            });
        } else {
            entries.push(GitWorkingTreeEntry {
                path,
                original_path: None,
                status: status.clone(),
                status_label: status_label(&status),
                is_staged: status.as_bytes().first().copied().unwrap_or(b' ') != b' ',
                is_untracked: status == "??",
            });
        }
    }
    Ok(entries)
}

fn status_label(status: &str) -> String {
    match status {
        "??" => "Untracked".to_string(),
        code if code.starts_with('A') || code.ends_with('A') => "Added".to_string(),
        code if code.starts_with('M') && code.ends_with('M') => "Modified".to_string(),
        code if code.starts_with('M') => "Staged".to_string(),
        code if code.ends_with('M') => "Modified".to_string(),
        code if code.starts_with('D') || code.ends_with('D') => "Deleted".to_string(),
        code if code.starts_with('R') || code.starts_with('C') => "Renamed".to_string(),
        other => other.trim().to_string(),
    }
}

fn git_stdout<const N: usize>(root: &Path, args: [&str; N]) -> Result<String, WorkspaceError> {
    let output = run_git(root, args)?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn run_git<const N: usize>(root: &Path, args: [&str; N]) -> Result<std::process::Output, WorkspaceError> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()?;
    if !output.status.success() {
        return Err(WorkspaceError::io(
            combine_output(&output).unwrap_or_else(|| "Git command failed.".to_string()),
        ));
    }
    Ok(output)
}

fn combine_output(output: &std::process::Output) -> Option<String> {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    match (!stdout.is_empty(), !stderr.is_empty()) {
        (true, true) => Some(format!("{stdout}\n{stderr}")),
        (true, false) => Some(stdout),
        (false, true) => Some(stderr),
        (false, false) => None,
    }
}
