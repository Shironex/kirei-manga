//! The AniList access token.
//!
//! AniList tokens last a year and cannot be refreshed: when one expires or is
//! revoked the user signs in again. The token is wrapped so that `Debug`
//! never prints it; the app keeps it in the OS keychain.

use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// What AniList documents as the token lifetime, used when the redirect
/// carries no usable `expires_in`.
pub const DEFAULT_TOKEN_LIFETIME_SECS: u64 = 365 * 24 * 60 * 60;

/// A string that must never reach a log. `Debug` prints `Secret(***)`.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Secret(String);

impl Secret {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// The raw value, for the one place that has to send or store it.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Secret(***)")
    }
}

/// An access token and when it stops working. Serializes to JSON
/// (`accessToken`, `expiresAt` in Unix milliseconds) for the keychain.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessToken {
    pub access_token: Secret,
    pub expires_at: i64,
}

impl AccessToken {
    /// A token that expires `expires_in` seconds from now.
    pub fn new(token: impl Into<String>, expires_in: u64) -> Self {
        let lifetime_ms = i64::try_from(expires_in.saturating_mul(1000)).unwrap_or(i64::MAX);
        Self {
            access_token: Secret::new(token),
            expires_at: now_ms().saturating_add(lifetime_ms),
        }
    }

    pub fn is_expired(&self) -> bool {
        self.expires_at <= now_ms()
    }
}

pub(crate) fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_never_shows_the_token() {
        let token = AccessToken::new("eyJ.secret.value", 60);
        let printed = format!("{token:?}");
        assert!(!printed.contains("secret"), "{printed}");
        assert!(printed.contains("Secret(***)"));
    }

    #[test]
    fn round_trips_through_json_for_the_keychain() {
        let token = AccessToken::new("abc", DEFAULT_TOKEN_LIFETIME_SECS);
        let json = serde_json::to_string(&token).unwrap();
        assert!(json.contains("\"accessToken\":\"abc\""));
        let back: AccessToken = serde_json::from_str(&json).unwrap();
        assert_eq!(back, token);
        assert!(!back.is_expired());
    }

    #[test]
    fn a_zero_lifetime_is_expired() {
        assert!(AccessToken::new("abc", 0).is_expired());
    }
}
