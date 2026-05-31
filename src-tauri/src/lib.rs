pub mod commands;
pub mod workspace;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // macOS WKWebView does not process keyboard shortcuts (⌘V, ⌘C, ⌘Z, …)
            // unless the application has an NSApp menu that contains the corresponding
            // Edit actions.  Without this, pasting and other text-editing shortcuts
            // are silently swallowed across the entire app.
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{MenuBuilder, SubmenuBuilder};
                let edit = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;
                let menu = MenuBuilder::new(app).item(&edit).build()?;
                app.set_menu(menu)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::workspace::create_workspace,
            commands::workspace::open_workspace,
            commands::workspace::validate_workspace,
            commands::workspace::list_snapshots,
            commands::workspace::restore_snapshot,
            commands::workspace::save_ledger_file,
            commands::workspace::get_ledger_editor_state,
            commands::workspace::read_ledger_file,
            commands::workspace::save_ledger_editor_session,
            commands::workspace::get_documents_state,
            commands::workspace::create_document_folder,
            commands::workspace::import_document_file,
            commands::workspace::rename_document_entry,
            commands::workspace::delete_document_entry,
            commands::workspace::read_document_preview,
            commands::workspace::get_predictive_entry_completion,
            commands::workspace::analyze_csv_import,
            commands::workspace::inspect_workspace_paths,
            commands::workspace::get_workspace_git_status,
            commands::workspace::add_source_account,
            commands::workspace::import_statement_rows,
            commands::workspace::get_suggested_entries,
            commands::workspace::get_broken_provenance,
            commands::workspace::approve_suggested_entry,
            commands::workspace::approve_transfer_entry,
            commands::workspace::list_categorization_rules,
            commands::workspace::create_categorization_rule,
            commands::workspace::update_categorization_rule,
            commands::workspace::get_ai_adapter_config,
            commands::workspace::configure_ai_adapter,
            commands::workspace::get_ai_context_disclosure,
            commands::workspace::get_mvp_reports
        ])
        .run(tauri::generate_context!())
        .expect("error while running Diurnum");
}
