pub mod commands;
pub mod menu;
pub mod workspace;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            // The native menu doubles as the macOS keyboard-shortcut surface:
            // WKWebView only processes ⌘-shortcuts that exist in the NSApp menu.
            #[cfg(target_os = "macos")]
            menu::build_app_menu(app.handle(), &menu::AppMenuState::default())?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            use tauri::Emitter;
            let _ = app.emit("menu", event.id().0.clone());
        })
        .invoke_handler(tauri::generate_handler![
            menu::sync_app_menu,
            commands::workspace::create_workspace,
            commands::workspace::open_workspace,
            commands::workspace::get_workspace_view,
            commands::workspace::validate_workspace,
            commands::workspace::validate_ledger_buffer,
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
            commands::workspace::get_git_panel_state,
            commands::workspace::list_recent_git_commits,
            commands::workspace::get_git_commit_diff,
            commands::workspace::commit_git_changes,
            commands::workspace::add_source_account,
            commands::workspace::import_statement_rows,
            commands::workspace::get_suggested_entries,
            commands::workspace::get_broken_provenance,
            commands::workspace::approve_suggested_entry,
            commands::workspace::approve_transfer_entry,
            commands::workspace::revert_transfer_to_standard,
            commands::workspace::get_known_ledger_accounts,
            commands::workspace::list_categorization_rules,
            commands::workspace::create_categorization_rule,
            commands::workspace::update_categorization_rule,
            commands::workspace::disable_categorization_rule,
            commands::workspace::enable_categorization_rule,
            commands::workspace::delete_categorization_rule,
            commands::workspace::get_ai_adapter_config,
            commands::workspace::configure_ai_adapter,
            commands::workspace::get_ai_context_disclosure,
            commands::workspace::start_ai_assist_pass,
            commands::workspace::run_ai_assist_next_chunk,
            commands::workspace::get_ai_assist_pass,
            commands::workspace::retry_ai_assist_failed_rows,
            commands::workspace::dismiss_ai_assist_pass,
            commands::workspace::approve_ai_assist_batch,
            commands::workspace::list_ai_assist_batches,
            commands::workspace::revert_ai_assist_batch,
            commands::workspace::get_mvp_reports,
            commands::workspace::update_workspace_metadata,
            commands::workspace::list_source_accounts,
            commands::workspace::list_source_mappings,
            commands::workspace::save_source_mapping,
            commands::workspace::rename_source_account,
            commands::workspace::preview_account_rename,
            commands::workspace::rename_account,
            commands::workspace::close_source_account,
            commands::workspace::update_source_account_opening_balance,
            commands::workspace::get_git_identity,
            commands::workspace::update_git_identity,
            commands::workspace::detect_ai_adapters,
            commands::workspace::test_ai_adapter,
            commands::workspace::get_account_context_hints,
            commands::workspace::list_entry_descriptions
        ])
        .run(tauri::generate_context!())
        .expect("error while running Diurnum");
}
