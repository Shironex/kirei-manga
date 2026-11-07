use kirei_core::AppInfo;

/// Identity of the running build. Async so it never runs on the main thread,
/// which keeps the convention every later command follows.
#[tauri::command]
pub(crate) async fn app_info() -> AppInfo {
    AppInfo::current(env!("CARGO_PKG_VERSION"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_the_crate_version() {
        let info = tauri::async_runtime::block_on(app_info());
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    }
}
