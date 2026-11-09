//! Self-update through `tauri-plugin-updater`. See `docs/release.md`.
//!
//! Release builds only. A debug build (`pnpm tauri dev`) has no updater: the
//! plugin is not registered and [`update_check`] answers `disabled`, which the
//! Settings screen shows as "not available in this build".
//!
//! # Two feeds
//!
//! The stable feed is the `latest.json` of the newest published release
//! (`plugins.updater.endpoints` in `tauri.conf.json`). GitHub never counts a
//! prerelease as the latest release, so a prerelease install could never move
//! to the next prerelease through that URL. The release workflow therefore also
//! keeps a rolling copy of every prerelease's `latest.json` on the
//! [`PRERELEASE_FEED`] release. An install whose own version is a prerelease
//! reads both feeds and takes the newer answer, so it moves on to the next
//! prerelease and to the stable release that follows. A stable install reads
//! the stable feed only and never sees a prerelease.
//!
//! # A missing feed is not an error
//!
//! Between a tag being pushed and its release being published the feed URL
//! answers 404, and before the first prerelease the prerelease feed does not
//! exist at all. Both read as "up to date" (see [`is_feed_missing`]).

use std::sync::Mutex;

use semver::Version;
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, Url};
use tauri_plugin_updater::{Update, UpdaterExt as _};

/// Where the release workflow keeps the newest prerelease's `latest.json`.
const PRERELEASE_FEED: &str =
    "https://github.com/Shironex/kirei-manga/releases/download/updater-prerelease/latest.json";

/// Whether this build updates itself at all.
pub(crate) fn is_supported() -> bool {
    !cfg!(debug_assertions)
}

/// Managed state of a build with an updater: the update the last check found,
/// kept so [`update_install`] installs exactly what the user was shown.
#[derive(Default)]
pub(crate) struct Pending(Mutex<Option<Update>>);

/// What a check found. Serialized with a `kind` tag for the renderer.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum UpdateCheck {
    /// This build has no updater (a debug build).
    Disabled,
    /// No newer release, or no feed published yet.
    #[serde(rename_all = "camelCase")]
    UpToDate { current: String },
    /// A newer release is ready to install.
    #[serde(rename_all = "camelCase")]
    Available {
        current: String,
        version: String,
        notes: Option<String>,
    },
}

/// Asks the feeds for a newer release and remembers it for [`update_install`].
#[tauri::command]
pub(crate) async fn update_check<R: Runtime>(app: AppHandle<R>) -> Result<UpdateCheck, String> {
    let Some(pending) = app.try_state::<Pending>() else {
        return Ok(UpdateCheck::Disabled);
    };
    let current = app.package_info().version.clone();

    let mut found = check_feed(&app, None).await?;
    if follows_prereleases(&current) {
        let prerelease = check_feed(&app, Some(PRERELEASE_FEED)).await?;
        found = newer(found, prerelease);
    }

    let answer = match &found {
        Some(update) => UpdateCheck::Available {
            current: current.to_string(),
            version: update.version.clone(),
            notes: update.body.clone(),
        },
        None => UpdateCheck::UpToDate {
            current: current.to_string(),
        },
    };
    *pending
        .0
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = found;
    Ok(answer)
}

/// Downloads and installs the update the last check found, then restarts.
///
/// On Windows the installer takes over and the process exits inside the
/// install. On macOS the bundle is swapped on disk and the restart is ours.
#[tauri::command]
pub(crate) async fn update_install<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let Some(pending) = app.try_state::<Pending>() else {
        return Err("this build does not update itself".to_owned());
    };
    let update = pending
        .0
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clone()
        .ok_or("there is no update to install, check again first")?;

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())?;
    app.restart();
}

/// One feed: the configured stable one (`None`) or the given URL.
async fn check_feed<R: Runtime>(
    app: &AppHandle<R>,
    endpoint: Option<&str>,
) -> Result<Option<Update>, String> {
    let mut builder = app.updater_builder();
    if let Some(endpoint) = endpoint {
        let url = Url::parse(endpoint).map_err(|error| error.to_string())?;
        builder = builder
            .endpoints(vec![url])
            .map_err(|error| error.to_string())?;
    }
    let updater = builder.build().map_err(|error| error.to_string())?;
    match updater.check().await {
        Ok(update) => Ok(update),
        Err(error) if is_feed_missing(&error) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

/// True for the errors a feed that is not published yet produces: no
/// manifest at the URL, or a manifest without this platform.
fn is_feed_missing(error: &tauri_plugin_updater::Error) -> bool {
    use tauri_plugin_updater::Error;
    matches!(
        error,
        Error::ReleaseNotFound | Error::TargetNotFound(_) | Error::TargetsNotFound(_)
    )
}

/// A prerelease install also follows the prerelease feed.
fn follows_prereleases(current: &Version) -> bool {
    !current.pre.is_empty()
}

/// The newer of two check results. The plugin only returns versions above the
/// running one, so either alone is already an update.
fn newer(a: Option<Update>, b: Option<Update>) -> Option<Update> {
    match (a, b) {
        (Some(a), Some(b)) => {
            if is_newer(&b.version, &a.version) {
                Some(b)
            } else {
                Some(a)
            }
        }
        (a, b) => a.or(b),
    }
}

/// `candidate > than` in semver order. An unparsable version never wins.
fn is_newer(candidate: &str, than: &str) -> bool {
    match (Version::parse(candidate), Version::parse(than)) {
        (Ok(candidate), Ok(than)) => candidate > than,
        (Ok(_), Err(_)) => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_prerelease_installs_follow_the_prerelease_feed() {
        assert!(follows_prereleases(&Version::parse("1.0.0-rc.1").unwrap()));
        assert!(!follows_prereleases(&Version::parse("1.0.0").unwrap()));
    }

    #[test]
    fn the_stable_release_beats_its_own_release_candidates() {
        assert!(is_newer("1.0.0", "1.0.0-rc.2"));
        assert!(is_newer("1.0.0-rc.10", "1.0.0-rc.2"));
        assert!(!is_newer("1.0.0-rc.2", "1.0.0"));
        assert!(!is_newer("1.0.0", "1.0.0"));
    }

    #[test]
    fn an_unparsable_version_never_wins() {
        assert!(!is_newer("soon", "1.0.0"));
        assert!(is_newer("1.0.0", "soon"));
    }

    #[test]
    fn unpublished_feeds_are_not_errors() {
        use tauri_plugin_updater::Error;
        assert!(is_feed_missing(&Error::ReleaseNotFound));
        assert!(is_feed_missing(&Error::TargetNotFound(
            "darwin-aarch64".into()
        )));
        assert!(!is_feed_missing(&Error::EmptyEndpoints));
    }

    #[test]
    fn the_prerelease_feed_is_https() {
        assert!(PRERELEASE_FEED.starts_with("https://"));
        assert!(PRERELEASE_FEED.ends_with("/latest.json"));
    }

    #[test]
    fn checks_serialize_with_a_kind_tag() {
        let json = serde_json::to_value(UpdateCheck::Available {
            current: "1.0.0".into(),
            version: "1.1.0".into(),
            notes: None,
        })
        .unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "kind": "available", "current": "1.0.0", "version": "1.1.0", "notes": null })
        );
        let json = serde_json::to_value(UpdateCheck::Disabled).unwrap();
        assert_eq!(json, serde_json::json!({ "kind": "disabled" }));
    }
}
