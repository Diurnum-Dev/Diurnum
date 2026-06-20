use serde::Deserialize;
use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Runtime};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentWorkspaceEntry {
    pub path: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppMenuState {
    pub workspace_open: bool,
    pub git_available: bool,
    #[serde(default)]
    pub recents: Vec<RecentWorkspaceEntry>,
}

/// Rebuilds and installs the full application menu. Called at startup with
/// defaults and again from the frontend (via `sync_app_menu`) whenever the
/// workspace/git/recents state changes. Rebuilding the whole menu is the
/// simplest way to keep enabled states and the Open Recent list correct.
pub fn build_app_menu<R: Runtime>(app: &AppHandle<R>, state: &AppMenuState) -> tauri::Result<()> {
    let app_menu = SubmenuBuilder::new(app, "Diurnum")
        .about(Some(AboutMetadata::default()))
        .separator()
        .item(
            &MenuItemBuilder::with_id("settings", "Settings…")
                .accelerator("Cmd+,")
                .enabled(state.workspace_open)
                .build(app)?,
        )
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let mut open_recent = SubmenuBuilder::new(app, "Open Recent");
    for recent in &state.recents {
        open_recent = open_recent.item(
            &MenuItemBuilder::with_id(format!("recent:{}", recent.path), &recent.display_name)
                .build(app)?,
        );
    }
    let open_recent = open_recent.build()?;

    // No menu item may use Cmd+W: the ledger editor binds it to close-tab,
    // and native accelerators intercept before the webview sees the key.
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(
            &MenuItemBuilder::with_id("new-workspace", "New Workspace")
                .accelerator("Shift+Cmd+N")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("open-workspace", "Open Workspace…")
                .accelerator("Cmd+O")
                .build(app)?,
        )
        .item(&open_recent)
        .separator()
        .item(
            &MenuItemBuilder::with_id("close-workspace", "Close Workspace")
                .accelerator("Shift+Cmd+W")
                .enabled(state.workspace_open)
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("save", "Save")
                .accelerator("Cmd+S")
                .enabled(state.workspace_open)
                .build(app)?,
        )
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let screens: [(&str, &str, &str); 7] = [
        ("view-ledger", "Ledger", "Cmd+1"),
        ("view-inbox", "Inbox", "Cmd+2"),
        ("view-reports", "Reports", "Cmd+3"),
        ("view-documents", "Documents", "Cmd+4"),
        ("view-import", "Import", "Cmd+5"),
        ("view-git", "Git", "Cmd+6"),
        ("view-settings", "Settings", "Cmd+7"),
    ];
    let mut view_builder = SubmenuBuilder::new(app, "View");
    for (id, label, accelerator) in screens {
        let enabled = state.workspace_open && (id != "view-git" || state.git_available);
        view_builder = view_builder.item(
            &MenuItemBuilder::with_id(id, label)
                .accelerator(accelerator)
                .enabled(enabled)
                .build(app)?,
        );
    }
    let view_menu = view_builder
        .separator()
        .item(
            &MenuItemBuilder::with_id("command-palette", "Command Palette…")
                .accelerator("Cmd+K")
                .enabled(state.workspace_open)
                .build(app)?,
        )
        .separator()
        .fullscreen()
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

// Unlike the workspace commands this returns a plain String error: menu
// rebuilds cannot meaningfully fail at runtime and the frontend calls this
// fire-and-forget, so the structured WorkspaceError contract buys nothing here.
#[tauri::command]
pub fn sync_app_menu(app: AppHandle, state: AppMenuState) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    build_app_menu(&app, &state).map_err(|err| err.to_string())?;
    #[cfg(not(target_os = "macos"))]
    let _ = (app, state);
    Ok(())
}
