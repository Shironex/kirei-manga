use std::time::Duration;

/// Everything the MangaDex client can fail with.
///
/// No variant carries a token, a password or a client secret, and network
/// errors are stripped of their URL (an image server URL holds a temporary
/// access token in its path).
#[derive(Debug, thiserror::Error)]
pub enum MangaDexError {
    #[error("cannot reach MangaDex: {0}")]
    Network(#[source] reqwest::Error),
    /// MangaDex answered with an error the caller may want to show.
    #[error("MangaDex answered {status}: {message}")]
    Api { status: u16, message: String },
    #[error("MangaDex has no such {0}")]
    NotFound(&'static str),
    /// The rate limit was hit and the wait is longer than the client is
    /// willing to sleep. Every request is paused until `retry_after` passes.
    #[error("MangaDex asked us to slow down; try again in {} s", retry_after.as_secs().max(1))]
    RateLimited { retry_after: Duration },
    /// MangaDex refused the connection outright (HTTP 403 without an API
    /// error body), which is what its DDoS protection does after repeated
    /// rate limit hits. Requests are paused for a cool-down.
    #[error("MangaDex is temporarily refusing requests from this network; try again later")]
    Blocked,
    #[error("unexpected response from MangaDex: {0}")]
    Decode(String),
    #[error("{0}")]
    InvalidInput(String),
    #[error("sign in to MangaDex first")]
    NotSignedIn,
    /// The token endpoint refused a sign in. The message is MangaDex's own
    /// description, for example "Invalid user credentials".
    #[error("MangaDex sign in failed: {0}")]
    SignIn(String),
    /// The refresh token is no longer accepted; the user has to sign in again.
    #[error("the MangaDex session has expired; sign in again")]
    SessionExpired,
    #[error(
        "no image server could deliver page {index} of chapter {chapter} after {attempts} tries"
    )]
    ImageUnavailable {
        chapter: String,
        index: usize,
        attempts: u32,
    },
}

impl MangaDexError {
    pub(crate) fn network(error: reqwest::Error) -> Self {
        Self::Network(error.without_url())
    }

    pub(crate) fn decode(error: impl std::fmt::Display) -> Self {
        Self::Decode(error.to_string())
    }
}

pub type Result<T> = std::result::Result<T, MangaDexError>;
