//! MangaDex credentials in the OS keychain: the personal client's id and
//! secret and the latest session tokens. Never in settings, the database or
//! an IPC payload; the password is never stored at all.
//!
//! The entries go through the app's keychain helper (`crate::keychain`),
//! under the same service as every other secret of the app; tests and a
//! machine without a keychain use the memory store below.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, PoisonError};

use kirei_mangadex::{ClientCredentials, Secret, TokenSet, TokenSink};

use crate::keychain::{SERVICE, SecretStore};

pub(crate) const CLIENT_ID: &str = "mangadex.client_id";
pub(crate) const CLIENT_SECRET: &str = "mangadex.client_secret";
/// The session tokens as `TokenSet` JSON. Named after the refresh token,
/// the part that keeps a session alive.
pub(crate) const REFRESH: &str = "mangadex.refresh";

/// Whether the OS keychain answers: a read of an entry that need not exist
/// succeeds or says "no entry". Reading a missing entry never prompts.
pub(crate) fn keychain_available() -> bool {
    match keyring::Entry::new(SERVICE, CLIENT_ID).and_then(|entry| entry.get_password()) {
        Ok(_) | Err(keyring::Error::NoEntry) => true,
        Err(_) => false,
    }
}

/// A store in memory, for tests and for a machine with no keychain.
#[derive(Default)]
pub(crate) struct MemoryStore(Mutex<HashMap<String, String>>);

impl SecretStore for MemoryStore {
    fn get(&self, account: &str) -> Result<Option<String>, String> {
        Ok(self
            .0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(account)
            .cloned())
    }

    fn set(&self, account: &str, value: &str) -> Result<(), String> {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(account.to_owned(), value.to_owned());
        Ok(())
    }

    fn delete(&self, account: &str) -> Result<(), String> {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(account);
        Ok(())
    }
}

/// Typed access to the MangaDex entries of a store.
#[derive(Clone)]
pub(crate) struct Credentials {
    store: Arc<dyn SecretStore>,
}

impl Credentials {
    pub(crate) fn new(store: Arc<dyn SecretStore>) -> Self {
        Self { store }
    }

    pub(crate) fn save_client(&self, client: &ClientCredentials) -> Result<(), String> {
        self.store.set(CLIENT_ID, &client.client_id)?;
        self.store.set(CLIENT_SECRET, client.client_secret.expose())
    }

    pub(crate) fn client(&self) -> Result<Option<ClientCredentials>, String> {
        let (Some(client_id), Some(secret)) =
            (self.store.get(CLIENT_ID)?, self.store.get(CLIENT_SECRET)?)
        else {
            return Ok(None);
        };
        Ok(Some(ClientCredentials {
            client_id,
            client_secret: Secret::new(secret),
        }))
    }

    /// The client id alone, to fill the sign in form again. Not a secret.
    pub(crate) fn client_id(&self) -> Option<String> {
        self.store.get(CLIENT_ID).ok().flatten()
    }

    pub(crate) fn tokens(&self) -> Result<Option<TokenSet>, String> {
        let Some(json) = self.store.get(REFRESH)? else {
            return Ok(None);
        };
        // Unreadable tokens are as good as none: the user signs in again.
        Ok(serde_json::from_str(&json).ok())
    }

    pub(crate) fn save_tokens(&self, tokens: Option<&TokenSet>) -> Result<(), String> {
        match tokens {
            Some(tokens) => {
                let json = serde_json::to_string(tokens).map_err(|error| error.to_string())?;
                self.store.set(REFRESH, &json)
            }
            None => self.store.delete(REFRESH),
        }
    }

    /// Forgets the session and the client secret. The client id stays to
    /// fill the form next time.
    pub(crate) fn forget(&self) -> Result<(), String> {
        self.store.delete(REFRESH)?;
        self.store.delete(CLIENT_SECRET)
    }
}

/// Keeps the keychain entry in step with the live session: the client calls
/// it after a sign in, after every refresh (the refresh token may rotate)
/// and with `None` when the session ends.
pub(crate) struct KeychainSink {
    credentials: Credentials,
    /// Told when the session ended on its own (a refused refresh), so the
    /// app can show "sign in again".
    on_end: Box<dyn Fn() + Send + Sync>,
}

impl KeychainSink {
    pub(crate) fn new(credentials: Credentials, on_end: impl Fn() + Send + Sync + 'static) -> Self {
        Self {
            credentials,
            on_end: Box::new(on_end),
        }
    }
}

impl TokenSink for KeychainSink {
    fn tokens_changed(&self, tokens: Option<&TokenSet>) {
        if let Err(error) = self.credentials.save_tokens(tokens) {
            eprintln!("MangaDex session not saved: {error}");
        }
        if tokens.is_none() {
            (self.on_end)();
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;

    fn tokens() -> TokenSet {
        serde_json::from_value(serde_json::json!({
            "accessToken": "access",
            "refreshToken": "refresh",
            "accessExpiresAt": 1u64,
            "refreshExpiresAt": 2u64,
        }))
        .unwrap()
    }

    #[test]
    fn client_and_tokens_round_trip_and_forget_keeps_the_id() {
        let store = Arc::new(crate::keychain::MemoryStore::default());
        let credentials = Credentials::new(store.clone());
        assert!(credentials.client().unwrap().is_none());
        credentials
            .save_client(&ClientCredentials {
                client_id: "personal-client-x".into(),
                client_secret: Secret::new("s3cret"),
            })
            .unwrap();
        credentials.save_tokens(Some(&tokens())).unwrap();

        let client = credentials.client().unwrap().unwrap();
        assert_eq!(client.client_secret.expose(), "s3cret");
        assert_eq!(
            credentials
                .tokens()
                .unwrap()
                .unwrap()
                .refresh_token
                .expose(),
            "refresh"
        );

        credentials.forget().unwrap();
        assert!(credentials.client().unwrap().is_none());
        assert!(credentials.tokens().unwrap().is_none());
        assert_eq!(
            credentials.client_id().as_deref(),
            Some("personal-client-x")
        );
    }

    #[test]
    fn the_sink_mirrors_the_session_and_reports_its_end() {
        let store = Arc::new(crate::keychain::MemoryStore::default());
        let credentials = Credentials::new(store.clone());
        let ended = Arc::new(AtomicUsize::new(0));
        let counter = ended.clone();
        let sink = KeychainSink::new(credentials.clone(), move || {
            counter.fetch_add(1, Ordering::SeqCst);
        });

        sink.tokens_changed(Some(&tokens()));
        assert!(store.get(REFRESH).unwrap().is_some());
        assert_eq!(ended.load(Ordering::SeqCst), 0);

        sink.tokens_changed(None);
        assert!(store.get(REFRESH).unwrap().is_none());
        assert_eq!(ended.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn garbled_tokens_read_as_signed_out() {
        let store = Arc::new(crate::keychain::MemoryStore::default());
        store.set(REFRESH, "not json").unwrap();
        assert!(Credentials::new(store).tokens().unwrap().is_none());
    }
}
