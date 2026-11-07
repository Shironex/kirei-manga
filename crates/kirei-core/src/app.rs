use serde::Serialize;

/// Identity of the running build, shown in the UI and attached to reports.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    /// Target OS as Rust names it (`macos`, `windows`, ...).
    pub os: String,
}

impl AppInfo {
    /// Builds the info for the current process from a version string the
    /// caller owns (the shell passes its package version).
    pub fn current(version: impl Into<String>) -> Self {
        Self {
            name: "KireiManga".to_owned(),
            version: version.into(),
            os: std::env::consts::OS.to_owned(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_reports_the_host_os() {
        let info = AppInfo::current("1.2.3");
        assert_eq!(info.name, "KireiManga");
        assert_eq!(info.version, "1.2.3");
        assert_eq!(info.os, std::env::consts::OS);
    }

    #[test]
    fn serializes_in_camel_case() {
        let json = serde_json::to_value(AppInfo::current("0.0.0")).unwrap();
        assert!(json.get("version").is_some());
        assert!(json.get("os").is_some());
    }
}
