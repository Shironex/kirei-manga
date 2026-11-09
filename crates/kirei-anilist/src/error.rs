use std::time::Duration;

/// Everything the AniList client can fail with.
///
/// No variant carries the access token, and network errors are stripped of
/// their URL.
#[derive(Debug, thiserror::Error)]
pub enum AniListError {
    #[error("cannot reach AniList: {0}")]
    Network(#[source] reqwest::Error),
    /// AniList answered with an error the caller may want to show.
    #[error("AniList answered {status}: {message}")]
    Api { status: u16, message: String },
    #[error("AniList has no such {0}")]
    NotFound(&'static str),
    /// The rate limit was hit and the wait is longer than the client is
    /// willing to sleep. Every request is paused until `retry_after` passes.
    #[error("AniList asked us to slow down; try again in {} s", retry_after.as_secs().max(1))]
    RateLimited { retry_after: Duration },
    /// AniList switched its API off for maintenance. Worth retrying later.
    #[error("the AniList API is temporarily unavailable: {0}")]
    Unavailable(String),
    #[error("sign in to AniList first")]
    NotSignedIn,
    /// AniList refused the token: it expired (tokens last a year) or the user
    /// revoked the app. The user has to sign in again.
    #[error("the AniList sign in has expired; sign in again")]
    TokenRejected,
    #[error("AniList sign in failed: {0}")]
    SignIn(String),
    #[error("unexpected response from AniList: {0}")]
    Decode(String),
    #[error("{0}")]
    InvalidInput(String),
}

impl AniListError {
    pub(crate) fn network(error: reqwest::Error) -> Self {
        Self::Network(error.without_url())
    }

    pub(crate) fn decode(error: impl std::fmt::Display) -> Self {
        Self::Decode(error.to_string())
    }

    /// Worth trying again later without the user doing anything: the network,
    /// a rate limit, a server error or maintenance. Everything else (a
    /// rejected token, a missing series, bad input) needs the user.
    pub fn is_transient(&self) -> bool {
        match self {
            Self::Network(_) | Self::RateLimited { .. } | Self::Unavailable(_) => true,
            Self::Api { status, .. } => *status >= 500 || *status == 408,
            _ => false,
        }
    }

    /// The user has to sign in (again) before this can succeed.
    pub fn needs_sign_in(&self) -> bool {
        matches!(self, Self::NotSignedIn | Self::TokenRejected)
    }
}

pub type Result<T> = std::result::Result<T, AniListError>;
