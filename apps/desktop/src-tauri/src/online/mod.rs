//! MangaDex in the desktop app: one shared client in Tauri state, the
//! credentials in the OS keychain, the network state the UI shows, and the
//! background refresh of the updates feed.
//!
//! - `credentials`: keychain entries and the token sink.
//! - `sync`: follows, the feed, read markers and the language switch.
//! - `source`: MangaDex chapters as page sources for the reader.
//! - `cover`: the `kirei-online` scheme for cover art.
//! - `commands`: what the renderer calls.
//! - `refresh`: the scheduled refresh and its notifications.

pub(crate) mod commands;
pub(crate) mod cover;
pub(crate) mod credentials;
pub(crate) mod refresh;
pub(crate) mod source;
pub(crate) mod sync;

use std::num::NonZeroUsize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock, PoisonError};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use kirei_core::{AppSettings, ContentRating as RatingSetting};
use kirei_library::Library;
use kirei_mangadex::{
    ClientConfig, ContentRating, LanguagePrefs, MangaDex, MangaDexError, default_user_agent,
};
use lru::LruCache;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use credentials::{CredentialStore, Credentials, KeychainSink};

/// Event with the new [`AccountView`] whenever the session or the network
/// state changes.
pub(crate) const ACCOUNT_EVENT: &str = "online:account";
/// Event sent after the updates feed changed (a scheduled refresh).
pub(crate) const FEED_EVENT: &str = "online:feed";

/// Library state key holding the signed-in username. Also the sign that a
/// session may be in the keychain, so a fresh install never touches it.
pub(crate) const STATE_USERNAME: &str = "account.username";

/// Covers kept in memory, 256 px thumbnails of 20 to 60 KB each.
const COVER_CACHE_ENTRIES: usize = 300;

/// What the last MangaDex request said about the connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "state")]
pub(crate) enum Health {
    Online,
    /// The request never reached MangaDex.
    Offline,
    /// MangaDex asked to slow down; requests wait until then (Unix ms).
    #[serde(rename_all = "camelCase")]
    RateLimited {
        until: u64,
    },
    /// MangaDex is refusing this network for a while.
    Blocked,
}

/// Whether a MangaDex account is connected.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Session {
    SignedOut,
    SignedIn,
    /// The session ended on its own (the refresh token expired or was
    /// revoked); the password is needed again.
    Expired,
}

/// The account as the Settings screen and the online screens show it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AccountView {
    pub(crate) session: Session,
    pub(crate) username: Option<String>,
    /// The personal client id, to fill the sign in form again.
    pub(crate) client_id: Option<String>,
    pub(crate) health: Health,
    /// Whether credentials can be kept between launches.
    pub(crate) keychain: bool,
}

type Notifier = Box<dyn Fn(&AccountView) + Send + Sync>;

/// The app's one MangaDex client and everything around it. Managed state.
pub(crate) struct Online {
    md: MangaDex,
    credentials: Credentials,
    keychain: bool,
    session: Arc<Mutex<Session>>,
    username: Mutex<Option<String>>,
    health: Mutex<Health>,
    covers: Mutex<LruCache<String, Vec<u8>>>,
    data_saver: AtomicBool,
    notifications: AtomicBool,
    auto_refresh: AtomicBool,
    /// One refresh at a time: the scheduler and a manual refresh share it.
    pub(crate) refreshing: tokio::sync::Mutex<()>,
    /// Tells the renderer about account changes; set once the app runs.
    notifier: Arc<OnceLock<Notifier>>,
}

impl Online {
    /// Builds the client with the app's User-Agent and a token sink that
    /// writes to `store`.
    pub(crate) fn new(
        version: &str,
        store: Arc<dyn CredentialStore>,
        keychain: bool,
    ) -> Result<Self, MangaDexError> {
        Self::with_config(
            ClientConfig::new(default_user_agent(version)),
            store,
            keychain,
        )
    }

    pub(crate) fn with_config(
        mut config: ClientConfig,
        store: Arc<dyn CredentialStore>,
        keychain: bool,
    ) -> Result<Self, MangaDexError> {
        let credentials = Credentials::new(store);
        let session = Arc::new(Mutex::new(Session::SignedOut));
        let notifier: Arc<OnceLock<Notifier>> = Arc::new(OnceLock::new());
        let ended = session.clone();
        config.token_sink = Some(Arc::new(KeychainSink::new(
            credentials.clone(),
            move || {
                let mut session = ended.lock().unwrap_or_else(PoisonError::into_inner);
                if *session == Session::SignedIn {
                    *session = Session::Expired;
                }
            },
        )));
        Ok(Self {
            md: MangaDex::new(config)?,
            credentials,
            keychain,
            session,
            username: Mutex::new(None),
            health: Mutex::new(Health::Online),
            covers: Mutex::new(LruCache::new(
                NonZeroUsize::new(COVER_CACHE_ENTRIES).unwrap_or(NonZeroUsize::MIN),
            )),
            data_saver: AtomicBool::new(false),
            notifications: AtomicBool::new(true),
            auto_refresh: AtomicBool::new(true),
            refreshing: tokio::sync::Mutex::new(()),
            notifier,
        })
    }

    pub(crate) fn client(&self) -> &MangaDex {
        &self.md
    }

    pub(crate) fn credentials(&self) -> &Credentials {
        &self.credentials
    }

    pub(crate) fn set_notifier(&self, notifier: impl Fn(&AccountView) + Send + Sync + 'static) {
        let _ = self.notifier.set(Box::new(notifier));
    }

    fn notify(&self) {
        if let Some(notifier) = self.notifier.get() {
            notifier(&self.account());
        }
    }

    pub(crate) fn account(&self) -> AccountView {
        AccountView {
            session: self.session(),
            username: self
                .username
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .clone(),
            client_id: self.credentials.client_id(),
            health: *self.health.lock().unwrap_or_else(PoisonError::into_inner),
            keychain: self.keychain,
        }
    }

    pub(crate) fn session(&self) -> Session {
        *self.session.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub(crate) fn set_session(&self, session: Session, username: Option<String>) {
        *self.session.lock().unwrap_or_else(PoisonError::into_inner) = session;
        *self.username.lock().unwrap_or_else(PoisonError::into_inner) = username;
        self.notify();
    }

    /// Records what a MangaDex result says about the connection, and passes
    /// the result through. A session that ended during the call shows up
    /// here too.
    pub(crate) fn track<T>(&self, result: Result<T, MangaDexError>) -> Result<T, MangaDexError> {
        match &result {
            Ok(_) => self.observe(None),
            Err(error) => self.observe(Some(error)),
        }
        result
    }

    /// Records a failure that is not returned, such as one in the background.
    pub(crate) fn note(&self, error: &MangaDexError) {
        self.observe(Some(error));
    }

    fn observe(&self, error: Option<&MangaDexError>) {
        let next = match error {
            None => Some(Health::Online),
            Some(MangaDexError::Network(_)) => Some(Health::Offline),
            Some(MangaDexError::RateLimited { retry_after }) => Some(Health::RateLimited {
                until: unix_ms()
                    .saturating_add(u64::try_from(retry_after.as_millis()).unwrap_or(u64::MAX)),
            }),
            Some(MangaDexError::Blocked) => Some(Health::Blocked),
            // Other answers still came from MangaDex.
            Some(_) => Some(Health::Online),
        };
        let mut changed = false;
        if let Some(next) = next {
            let mut health = self.health.lock().unwrap_or_else(PoisonError::into_inner);
            changed = *health != next;
            *health = next;
        }
        if matches!(error, Some(MangaDexError::SessionExpired)) {
            let mut session = self.session.lock().unwrap_or_else(PoisonError::into_inner);
            if *session == Session::SignedIn {
                *session = Session::Expired;
                changed = true;
            }
        }
        if changed {
            self.notify();
        }
    }

    /// Applies the online settings to the client.
    pub(crate) fn apply_settings(&self, settings: &AppSettings) {
        match LanguagePrefs::new(
            settings.online_languages.as_slice().iter().cloned(),
            settings.online_only_my_language,
        ) {
            Ok(prefs) => self.md.set_languages(prefs),
            Err(error) => eprintln!("online languages not applied: {error}"),
        }
        let ratings = settings
            .online_content_ratings
            .as_slice()
            .iter()
            .map(|rating| match rating {
                RatingSetting::Safe => ContentRating::Safe,
                RatingSetting::Suggestive => ContentRating::Suggestive,
                RatingSetting::Erotica => ContentRating::Erotica,
                RatingSetting::Pornographic => ContentRating::Pornographic,
            })
            .collect();
        if let Err(error) = self.md.set_content_ratings(ratings) {
            eprintln!("content ratings not applied: {error}");
        }
        self.data_saver
            .store(settings.online_data_saver, Ordering::Relaxed);
        self.notifications
            .store(settings.online_notifications, Ordering::Relaxed);
        self.auto_refresh
            .store(settings.online_auto_refresh, Ordering::Relaxed);
    }

    pub(crate) fn data_saver(&self) -> bool {
        self.data_saver.load(Ordering::Relaxed)
    }

    pub(crate) fn notifications(&self) -> bool {
        self.notifications.load(Ordering::Relaxed)
    }

    pub(crate) fn auto_refresh(&self) -> bool {
        self.auto_refresh.load(Ordering::Relaxed)
    }

    pub(crate) fn cached_cover(&self, key: &str) -> Option<Vec<u8>> {
        self.covers
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(key)
            .cloned()
    }

    pub(crate) fn cache_cover(&self, key: String, bytes: Vec<u8>) {
        self.covers
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .put(key, bytes);
    }

    /// Resumes the stored session, if the library says one was made. No
    /// network call: the client refreshes the token on first use.
    pub(crate) async fn restore(&self, username: Option<String>) {
        let Some(username) = username else {
            return;
        };
        let stored = self
            .credentials
            .client()
            .and_then(|client| Ok((client, self.credentials.tokens()?)));
        match stored {
            Ok((Some(client), Some(tokens))) if !tokens.refresh_expired() => {
                self.md.restore_session(client, tokens).await;
                self.set_session(Session::SignedIn, Some(username));
            }
            Ok(_) => self.set_session(Session::Expired, Some(username)),
            Err(error) => {
                eprintln!("MangaDex session not restored: {error}");
                self.set_session(Session::Expired, Some(username));
            }
        }
    }
}

/// Builds the app's MangaDex state: the client with the stored settings, the
/// keychain (or memory when the OS has no keychain), the restored session and
/// the account event. `library` is `None` when the database did not open.
pub(crate) fn setup<R: Runtime>(app: &AppHandle<R>, library: Option<&Library>) -> Online {
    let keychain = credentials::keychain_available();
    let store: Arc<dyn CredentialStore> = if keychain {
        Arc::new(credentials::Keychain)
    } else {
        eprintln!("no system keychain: MangaDex sign in lasts until the app closes");
        Arc::new(credentials::MemoryStore::default())
    };
    let version = app.package_info().version.to_string();
    let online = match Online::new(&version, store.clone(), keychain) {
        Ok(online) => online,
        Err(error) => {
            // The default config always validates; this is a safety net.
            eprintln!("MangaDex client not configured: {error}");
            Online::with_config(
                ClientConfig::new(default_user_agent("0.0.0")),
                store,
                keychain,
            )
            .unwrap_or_else(|_| unreachable!("the default MangaDex config is valid"))
        }
    };
    if let Some(library) = library {
        if let Ok(settings) = library.settings() {
            online.apply_settings(&settings);
        }
        // Only an account that signed in before has anything in the keychain,
        // so a fresh install never asks the OS for it.
        let username = library.online_state(STATE_USERNAME).ok().flatten();
        tauri::async_runtime::block_on(online.restore(username));
    }
    let handle = app.clone();
    online.set_notifier(move |account| {
        let _ = handle.emit(ACCOUNT_EVENT, account);
    });
    online
}

/// Applies changed settings to the running client.
pub(crate) fn apply_settings<R: Runtime>(app: &AppHandle<R>, settings: &AppSettings) {
    if let Some(online) = app.try_state::<Online>() {
        online.apply_settings(settings);
    }
}

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use kirei_mangadex::{Endpoints, TokenSink};

    use super::credentials::MemoryStore;
    use super::*;

    fn online() -> Online {
        let mut config = ClientConfig::new("KireiManga/0.0.0-test");
        config.endpoints = Endpoints::local("http://127.0.0.1:9").unwrap();
        Online::with_config(config, Arc::new(MemoryStore::default()), false).unwrap()
    }

    #[test]
    fn rate_limits_and_bans_show_in_the_account_and_clear_on_success() {
        let online = online();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = seen.clone();
        online.set_notifier(move |account| log.lock().unwrap().push(account.health));

        let _ = online.track::<()>(Err(MangaDexError::RateLimited {
            retry_after: Duration::from_secs(60),
        }));
        assert!(matches!(
            online.account().health,
            Health::RateLimited { until } if until > unix_ms()
        ));
        let _ = online.track::<()>(Err(MangaDexError::Blocked));
        let _ = online.track::<()>(Err(MangaDexError::Blocked));
        let _ = online.track(Ok(()));
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 3, "an unchanged state is not announced again");
        assert_eq!(seen[2], Health::Online);
    }

    #[test]
    fn an_expired_session_is_reported_once() {
        let online = online();
        online.set_session(Session::SignedIn, Some("reader".into()));
        let _ = online.track::<()>(Err(MangaDexError::SessionExpired));
        assert_eq!(online.session(), Session::Expired);
        assert_eq!(online.account().username.as_deref(), Some("reader"));
    }

    #[test]
    fn a_refused_refresh_through_the_sink_expires_the_session() {
        let store = Arc::new(MemoryStore::default());
        let credentials = Credentials::new(store.clone());
        let session = Arc::new(Mutex::new(Session::SignedIn));
        let ended = session.clone();
        let sink = KeychainSink::new(credentials, move || {
            let mut session = ended.lock().unwrap();
            if *session == Session::SignedIn {
                *session = Session::Expired;
            }
        });
        sink.tokens_changed(None);
        assert_eq!(*session.lock().unwrap(), Session::Expired);
    }

    #[test]
    fn settings_reach_the_client() {
        let online = online();
        let settings = AppSettings::default()
            .with("online.languages", serde_json::json!(["en"]))
            .unwrap()
            .with("online.onlyMyLanguage", serde_json::json!(true))
            .unwrap()
            .with("online.contentRatings", serde_json::json!(["safe"]))
            .unwrap()
            .with("online.dataSaver", serde_json::json!(true))
            .unwrap();
        online.apply_settings(&settings);
        let prefs = online.client().languages();
        assert_eq!(prefs.chain(), ["en"]);
        assert!(prefs.only_preferred());
        assert_eq!(online.client().content_ratings(), vec![ContentRating::Safe]);
        assert!(online.data_saver());
    }
}
