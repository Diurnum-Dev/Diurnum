use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use chrono::NaiveDate;

pub fn validate_business_name(value: &str) -> Result<String, WorkspaceError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidBusinessName,
            "Business name is required.",
        ));
    }
    Ok(trimmed.to_string())
}

pub fn validate_books_start_date(value: &str) -> Result<String, WorkspaceError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| {
        WorkspaceError::new(
            WorkspaceErrorCode::InvalidBooksStartDate,
            "Books start date must use YYYY-MM-DD.",
        )
    })?;
    Ok(value.to_string())
}

pub fn validate_currency(value: &str) -> Result<String, WorkspaceError> {
    if value == "USD" {
        return Ok(value.to_string());
    }
    Err(WorkspaceError::new(
        WorkspaceErrorCode::InvalidCurrency,
        "The MVP supports USD Workspaces only.",
    ))
}

pub fn sanitize_workspace_folder_name(value: &str) -> Result<String, WorkspaceError> {
    let normalized = value
        .trim()
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            character if character.is_whitespace() => ' ',
            character => character,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if normalized.is_empty() {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidBusinessName,
            "Workspace folder name cannot be empty.",
        ));
    }

    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_business_name_after_trimming() {
        assert_eq!(
            validate_business_name(" Acme Studio ").unwrap(),
            "Acme Studio"
        );
        assert_eq!(
            validate_business_name("   ").unwrap_err().code,
            WorkspaceErrorCode::InvalidBusinessName
        );
    }

    #[test]
    fn validates_iso_books_start_date() {
        assert_eq!(
            validate_books_start_date("2026-01-01").unwrap(),
            "2026-01-01"
        );
        assert_eq!(
            validate_books_start_date("01/01/2026").unwrap_err().code,
            WorkspaceErrorCode::InvalidBooksStartDate
        );
    }

    #[test]
    fn restricts_currency_to_usd() {
        assert_eq!(validate_currency("USD").unwrap(), "USD");
        assert_eq!(
            validate_currency("EUR").unwrap_err().code,
            WorkspaceErrorCode::InvalidCurrency
        );
    }

    #[test]
    fn sanitizes_folder_name_cross_platform() {
        assert_eq!(
            sanitize_workspace_folder_name(" Acme/Studio: Books  ").unwrap(),
            "Acme-Studio- Books"
        );
        assert_eq!(
            sanitize_workspace_folder_name("   ").unwrap_err().code,
            WorkspaceErrorCode::InvalidBusinessName
        );
    }
}
