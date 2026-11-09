//! Sign in with a MangaDex personal API client (OAuth password grant), and
//! keep the access token fresh with the refresh grant.
//!
//! The client never stores anything. The username and password are used once
//! for the password grant and dropped. The client id and secret and the token
//! pair live in memory for the session; whenever the tokens change, the
//! [`TokenSink`] hears about it so the app can keep the refresh token (and
//! the client secret) in the OS keychain and resume later with
//! [`crate::MangaDex::restore_session`].

use std::fmt;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// A credential or token. Never printed: `Debug` shows `Secret(***)`.
///
/// It serializes as the plain string, so the app can write it to the OS
/// keychain; keep it out of logs, settings files and IPC payloads.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Secret(String);

impl Secret {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// The raw value, for the one place that has to send it.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Secret(***)")
    }
}

impl From<String> for Secret {
    fn from(value: String) -> Self {
        Self(value)
    }
}

/// A personal API client, created by the user in their MangaDex settings.
/// Only the account that owns it can sign in with it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientCredentials {
    pub client_id: String,
    pub client_secret: Secret,
}

/// The token pair of a session. Times are Unix milliseconds (UTC).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenSet {
    pub access_token: Secret,
    pub refresh_token: Secret,
    pub access_expires_at: u64,
    /// `None` when the identity server did not say.
    pub refresh_expires_at: Option<u64>,
}

impl TokenSet {
    /// True when the access token expires within `margin`.
    pub fn access_expires_within(&self, margin: Duration) -> bool {
        now_ms().saturating_add(margin.as_millis() as u64) >= self.access_expires_at
    }

    pub fn refresh_expired(&self) -> bool {
        self.refresh_expires_at.is_some_and(|at| now_ms() >= at)
    }
}

/// Hears about every change of the session tokens: a sign in, a refresh
/// (the identity server may rotate the refresh token), and the end of a
/// session (`None`: sign out, or a refresh token that stopped working).
pub trait TokenSink: Send + Sync {
    fn tokens_changed(&self, tokens: Option<&TokenSet>);
}

impl<F> TokenSink for F
where
    F: Fn(Option<&TokenSet>) + Send + Sync,
{
    fn tokens_changed(&self, tokens: Option<&TokenSet>) {
        self(tokens)
    }
}

pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

/// The identity server's token answer.
#[derive(Deserialize)]
pub(crate) struct TokenResponse {
    access_token: String,
    refresh_token: String,
    #[serde(default)]
    expires_in: Option<u64>,
    #[serde(default)]
    refresh_expires_in: Option<u64>,
}

impl TokenResponse {
    pub(crate) fn into_tokens(self) -> TokenSet {
        let now = now_ms();
        // MangaDex documents 15 minutes for the access token.
        let access = self.expires_in.unwrap_or(15 * 60);
        TokenSet {
            access_token: Secret(self.access_token),
            refresh_token: Secret(self.refresh_token),
            access_expires_at: now + access * 1000,
            // Zero means "no expiry" for offline tokens.
            refresh_expires_at: self
                .refresh_expires_in
                .filter(|secs| *secs > 0)
                .map(|secs| now + secs * 1000),
        }
    }
}

/// `{"error":"invalid_grant","error_description":"Invalid user credentials"}`
#[derive(Deserialize)]
pub(crate) struct TokenError {
    #[serde(default)]
    pub(crate) error: String,
    #[serde(default)]
    pub(crate) error_description: Option<String>,
}

impl TokenError {
    pub(crate) fn parse(body: &[u8]) -> Option<Self> {
        serde_json::from_slice(body).ok()
    }

    pub(crate) fn message(&self) -> String {
        self.error_description
            .clone()
            .filter(|text| !text.trim().is_empty())
            .unwrap_or_else(|| self.error.clone())
    }
}

/// The session the client holds while signed in.
pub(crate) struct Session {
    pub(crate) client: ClientCredentials,
    pub(crate) tokens: TokenSet,
}

pub(crate) fn notify(sink: &Option<Arc<dyn TokenSink>>, tokens: Option<&TokenSet>) {
    if let Some(sink) = sink {
        sink.tokens_changed(tokens);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secrets_never_show_in_debug_output() {
        let tokens = TokenSet {
            access_token: Secret::new("access-abc"),
            refresh_token: Secret::new("refresh-xyz"),
            access_expires_at: 0,
            refresh_expires_at: None,
        };
        let client = ClientCredentials {
            client_id: "personal-client-1".into(),
            client_secret: Secret::new("hunter2"),
        };
        let printed = format!("{tokens:?} {client:?}");
        assert!(!printed.contains("access-abc"));
        assert!(!printed.contains("refresh-xyz"));
        assert!(!printed.contains("hunter2"));
        assert!(printed.contains("personal-client-1"));
    }

    #[test]
    fn token_answers_become_absolute_expiry_times() {
        let before = now_ms();
        let tokens = TokenResponse {
            access_token: "a".into(),
            refresh_token: "r".into(),
            expires_in: Some(900),
            refresh_expires_in: Some(0),
        }
        .into_tokens();
        assert!(tokens.access_expires_at >= before + 900_000);
        assert_eq!(tokens.refresh_expires_at, None);
        assert!(!tokens.access_expires_within(Duration::from_secs(60)));
        assert!(tokens.access_expires_within(Duration::from_secs(901)));
    }
}
