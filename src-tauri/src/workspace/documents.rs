use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use crate::workspace::source_accounts::documents_slug_for_account;
use crate::workspace::types::WorkspaceManifest;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentsStateInput {
    pub workspace_root_path: String,
    pub selected_folder: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentsState {
    pub folders: Vec<DocumentFolderSummary>,
    pub selected_folder: String,
    pub files: Vec<DocumentFileSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentFolderSummary {
    pub relative_path: String,
    pub name: String,
    pub depth: usize,
    pub is_source_account_folder: bool,
    pub absolute_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentFileSummary {
    pub relative_path: String,
    pub name: String,
    pub modified_at: String,
    pub size_bytes: u64,
    pub kind: DocumentPreviewKind,
    pub absolute_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentFolderInput {
    pub workspace_root_path: String,
    pub parent_relative_path: Option<String>,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportDocumentFileInput {
    pub workspace_root_path: String,
    pub target_folder: String,
    pub file_name: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameDocumentEntryInput {
    pub workspace_root_path: String,
    pub relative_path: String,
    pub new_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDocumentEntryInput {
    pub workspace_root_path: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadDocumentPreviewInput {
    pub workspace_root_path: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPreview {
    pub relative_path: String,
    pub file_name: String,
    pub kind: DocumentPreviewKind,
    pub mime_type: Option<String>,
    pub text_content: Option<String>,
    pub bytes: Option<Vec<u8>>,
    pub absolute_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DocumentPreviewKind {
    Pdf,
    Image,
    Text,
    Unsupported,
}

pub fn get_documents_state(input: DocumentsStateInput) -> Result<DocumentsState, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let documents_root = documents_root(root)?;
    let source_folder_slugs = source_account_folder_slugs(root)?;
    let mut folders = vec![DocumentFolderSummary {
        relative_path: String::new(),
        name: "documents".to_string(),
        depth: 0,
        is_source_account_folder: false,
        absolute_path: documents_root.to_string_lossy().to_string(),
    }];
    collect_folders(
        &documents_root,
        &documents_root,
        &source_folder_slugs,
        1,
        &mut folders,
    )?;

    let selected_folder =
        sanitize_documents_relative_path(input.selected_folder.as_deref().unwrap_or(""))?;
    let folder_path = documents_root.join(&selected_folder);
    if !folder_path.is_dir() {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Documents folder does not exist.",
        ));
    }

    let mut files = fs::read_dir(&folder_path)?
        .filter_map(Result::ok)
        .filter_map(|entry| document_file_summary(&documents_root, entry.path()).transpose())
        .collect::<Result<Vec<_>, _>>()?;
    files.sort_by(|left, right| left.name.cmp(&right.name));

    Ok(DocumentsState {
        folders,
        selected_folder,
        files,
    })
}

pub fn create_document_folder(
    input: CreateDocumentFolderInput,
) -> Result<DocumentFolderSummary, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let documents_root = documents_root(root)?;
    let parent =
        sanitize_documents_relative_path(input.parent_relative_path.as_deref().unwrap_or(""))?;
    let folder_name = sanitize_new_entry_name(&input.name)?;
    let path = documents_root.join(&parent).join(&folder_name);
    fs::create_dir_all(&path)?;
    Ok(DocumentFolderSummary {
        relative_path: relative_path(&documents_root, &path)?,
        name: folder_name,
        depth: parent_depth(&parent) + 1,
        is_source_account_folder: false,
        absolute_path: path.to_string_lossy().to_string(),
    })
}

pub fn import_document_file(
    input: ImportDocumentFileInput,
) -> Result<DocumentFileSummary, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let documents_root = documents_root(root)?;
    let target_folder = sanitize_documents_relative_path(&input.target_folder)?;
    let file_name = sanitize_file_name(&input.file_name, "document");
    let path = documents_root.join(&target_folder).join(file_name);
    fs::write(&path, input.bytes)?;
    document_file_summary(&documents_root, path)?.ok_or_else(|| {
        WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Imported document file could not be listed.",
        )
    })
}

pub fn rename_document_entry(input: RenameDocumentEntryInput) -> Result<(), WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let documents_root = documents_root(root)?;
    let source = documents_path(&documents_root, &input.relative_path)?;
    let new_name = sanitize_new_entry_name(&input.new_name)?;
    let destination = source
        .parent()
        .ok_or_else(|| WorkspaceError::io("Documents entry has no parent.".to_string()))?
        .join(new_name);
    fs::rename(source, destination)?;
    Ok(())
}

pub fn delete_document_entry(input: DeleteDocumentEntryInput) -> Result<(), WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let documents_root = documents_root(root)?;
    let path = documents_path(&documents_root, &input.relative_path)?;
    if path.is_dir() {
        fs::remove_dir_all(path)?;
    } else {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub fn read_document_preview(
    input: ReadDocumentPreviewInput,
) -> Result<DocumentPreview, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let documents_root = documents_root(root)?;
    let path = documents_path(&documents_root, &input.relative_path)?;
    if path.is_dir() {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Documents preview can only open files.",
        ));
    }
    let kind = preview_kind(&path);
    let bytes = fs::read(&path)?;
    let (mime_type, text_content, preview_bytes) = match kind {
        DocumentPreviewKind::Pdf => (Some("application/pdf".to_string()), None, Some(bytes)),
        DocumentPreviewKind::Image => (Some(image_mime_type(&path).to_string()), None, Some(bytes)),
        DocumentPreviewKind::Text => (
            Some(text_mime_type(&path).to_string()),
            Some(String::from_utf8_lossy(&bytes).to_string()),
            None,
        ),
        DocumentPreviewKind::Unsupported => (None, None, None),
    };
    Ok(DocumentPreview {
        relative_path: input.relative_path,
        file_name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("document")
            .to_string(),
        kind,
        mime_type,
        text_content,
        bytes: preview_bytes,
        absolute_path: path.to_string_lossy().to_string(),
    })
}

fn collect_folders(
    documents_root: &Path,
    current: &Path,
    source_folder_slugs: &[String],
    depth: usize,
    folders: &mut Vec<DocumentFolderSummary>,
) -> Result<(), WorkspaceError> {
    let mut directories = fs::read_dir(current)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect::<Vec<_>>();
    directories.sort();

    for path in directories {
        let relative = relative_path(documents_root, &path)?;
        folders.push(DocumentFolderSummary {
            name: path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("folder")
                .to_string(),
            depth,
            is_source_account_folder: source_folder_slugs.iter().any(|slug| slug == &relative),
            absolute_path: path.to_string_lossy().to_string(),
            relative_path: relative.clone(),
        });
        collect_folders(
            documents_root,
            &path,
            source_folder_slugs,
            depth + 1,
            folders,
        )?;
    }
    Ok(())
}

fn document_file_summary(
    documents_root: &Path,
    path: PathBuf,
) -> Result<Option<DocumentFileSummary>, WorkspaceError> {
    if !path.is_file() {
        return Ok(None);
    }
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("")
        .to_string();
    if name == ".gitkeep" {
        return Ok(None);
    }
    let metadata = fs::metadata(&path)?;
    Ok(Some(DocumentFileSummary {
        relative_path: relative_path(documents_root, &path)?,
        name,
        modified_at: modified_at_iso(&metadata)?,
        size_bytes: metadata.len(),
        kind: preview_kind(&path),
        absolute_path: path.to_string_lossy().to_string(),
    }))
}

fn documents_root(root: &Path) -> Result<PathBuf, WorkspaceError> {
    let manifest = read_manifest(root)?;
    Ok(root.join(manifest.layout.documents_directory))
}

fn read_manifest(root: &Path) -> Result<WorkspaceManifest, WorkspaceError> {
    serde_json::from_str(&fs::read_to_string(
        root.join(".diurnum").join("workspace.json"),
    )?)
    .map_err(|_| {
        WorkspaceError::new(
            WorkspaceErrorCode::MissingManifest,
            "Workspace manifest is unreadable.",
        )
    })
}

fn source_account_folder_slugs(root: &Path) -> Result<Vec<String>, WorkspaceError> {
    let accounts = fs::read_to_string(root.join("accounts.bean"))?;
    Ok(accounts
        .lines()
        .filter_map(|line| {
            let parts = line.split_whitespace().collect::<Vec<_>>();
            if parts.len() == 4
                && parts[1] == "open"
                && (parts[2].starts_with("Assets:Bank:")
                    || parts[2].starts_with("Liabilities:CreditCards:"))
            {
                Some(documents_slug_for_account(parts[2]))
            } else {
                None
            }
        })
        .collect())
}

fn documents_path(documents_root: &Path, relative_path: &str) -> Result<PathBuf, WorkspaceError> {
    Ok(documents_root.join(sanitize_documents_relative_path(relative_path)?))
}

fn sanitize_documents_relative_path(relative_path: &str) -> Result<String, WorkspaceError> {
    let path = Path::new(relative_path);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Documents path escapes the Workspace root.",
        ));
    }
    Ok(relative_path.trim_matches('/').to_string())
}

fn sanitize_new_entry_name(name: &str) -> Result<String, WorkspaceError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Document name cannot be empty.",
        ));
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed == "." || trimmed == ".." {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Document name contains unsupported path characters.",
        ));
    }
    Ok(trimmed.to_string())
}

fn sanitize_file_name(file_name: &str, fallback: &str) -> String {
    let trimmed = Path::new(file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(fallback)
        .trim();
    let safe = trimmed
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '\0' => '-',
            _ => character,
        })
        .collect::<String>();
    if safe.is_empty() {
        fallback.to_string()
    } else {
        safe
    }
}

fn relative_path(root: &Path, path: &Path) -> Result<String, WorkspaceError> {
    Ok(path
        .strip_prefix(root)
        .map_err(|error| WorkspaceError::io(error.to_string()))?
        .to_string_lossy()
        .to_string())
}

fn modified_at_iso(metadata: &fs::Metadata) -> Result<String, WorkspaceError> {
    let modified: DateTime<Utc> = metadata.modified()?.into();
    Ok(modified.to_rfc3339())
}

fn preview_kind(path: &Path) -> DocumentPreviewKind {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "pdf" => DocumentPreviewKind::Pdf,
        "png" | "jpg" | "jpeg" | "heic" => DocumentPreviewKind::Image,
        "csv" | "txt" | "md" | "json" | "bean" => DocumentPreviewKind::Text,
        _ => DocumentPreviewKind::Unsupported,
    }
}

fn image_mime_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "heic" => "image/heic",
        _ => "application/octet-stream",
    }
}

fn text_mime_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "csv" => "text/csv",
        "json" => "application/json",
        _ => "text/plain",
    }
}

fn parent_depth(relative_path: &str) -> usize {
    if relative_path.is_empty() {
        0
    } else {
        relative_path.split('/').count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::create::create_workspace;
    use crate::workspace::source_accounts::{
        add_source_account, AddSourceAccountInput, SourceAccountKind,
    };
    use crate::workspace::types::CreateWorkspaceInput;

    #[test]
    fn lists_creates_renames_and_deletes_documents() {
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
            opening_balance: None,
        })
        .unwrap();

        let state = get_documents_state(DocumentsStateInput {
            workspace_root_path: created.root_path.clone(),
            selected_folder: None,
        })
        .unwrap();
        assert!(state
            .folders
            .iter()
            .any(|folder| folder.relative_path == "operating-checking"
                && folder.is_source_account_folder));

        create_document_folder(CreateDocumentFolderInput {
            workspace_root_path: created.root_path.clone(),
            parent_relative_path: None,
            name: "receipts".to_string(),
        })
        .unwrap();
        import_document_file(ImportDocumentFileInput {
            workspace_root_path: created.root_path.clone(),
            target_folder: "receipts".to_string(),
            file_name: "note.txt".to_string(),
            bytes: b"hello documents".to_vec(),
        })
        .unwrap();

        let receipts_state = get_documents_state(DocumentsStateInput {
            workspace_root_path: created.root_path.clone(),
            selected_folder: Some("receipts".to_string()),
        })
        .unwrap();
        assert_eq!(receipts_state.files.len(), 1);
        assert_eq!(receipts_state.files[0].kind, DocumentPreviewKind::Text);

        rename_document_entry(RenameDocumentEntryInput {
            workspace_root_path: created.root_path.clone(),
            relative_path: "receipts/note.txt".to_string(),
            new_name: "renamed.txt".to_string(),
        })
        .unwrap();
        let preview = read_document_preview(ReadDocumentPreviewInput {
            workspace_root_path: created.root_path.clone(),
            relative_path: "receipts/renamed.txt".to_string(),
        })
        .unwrap();
        assert_eq!(preview.text_content.as_deref(), Some("hello documents"));

        delete_document_entry(DeleteDocumentEntryInput {
            workspace_root_path: created.root_path,
            relative_path: "receipts/renamed.txt".to_string(),
        })
        .unwrap();
    }

    #[test]
    fn previews_binary_files_inline_when_supported() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        import_document_file(ImportDocumentFileInput {
            workspace_root_path: created.root_path.clone(),
            target_folder: String::new(),
            file_name: "statement.pdf".to_string(),
            bytes: b"%PDF-1.4".to_vec(),
        })
        .unwrap();

        let preview = read_document_preview(ReadDocumentPreviewInput {
            workspace_root_path: created.root_path.clone(),
            relative_path: "statement.pdf".to_string(),
        })
        .unwrap();
        assert_eq!(preview.kind, DocumentPreviewKind::Pdf);
        assert_eq!(preview.mime_type.as_deref(), Some("application/pdf"));
        assert_eq!(preview.bytes, Some(b"%PDF-1.4".to_vec()));
    }
}
