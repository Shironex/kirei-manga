// Test helpers may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used, dead_code, unreachable_pub)]

use std::time::Duration;

use kirei_anilist::{AccessToken, AniList, ClientConfig, Endpoints, Limits, RetryPolicy};
use wiremock::MockServer;

pub const USER_AGENT: &str = "KireiManga/0.0.0-test (+https://github.com/Shironex/kirei-manga)";
pub const TOKEN: &str = "test-access-token";

/// A recorded response from `tests/fixtures`.
pub fn fixture(name: &str) -> String {
    let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(&path).unwrap_or_else(|error| panic!("{path}: {error}"))
}

pub fn json(status: u16, name: &str) -> wiremock::ResponseTemplate {
    wiremock::ResponseTemplate::new(status)
        .insert_header("content-type", "application/json")
        .set_body_string(fixture(name))
}

/// A config pointed at the mock server, with fast retries and no spacing.
pub fn config(server: &MockServer) -> ClientConfig {
    let mut config = ClientConfig::new(USER_AGENT);
    config.endpoints = Endpoints::local(&server.uri()).unwrap();
    config.retry = RetryPolicy {
        max_retries: 3,
        base_delay: Duration::from_millis(10),
        max_delay: Duration::from_secs(3),
    };
    config.limits = Limits {
        per_minute: 90,
        ceiling: 90,
        min_gap: Duration::ZERO,
    };
    config
}

pub fn signed_in(server: &MockServer) -> AniList {
    let client = AniList::new(config(server)).unwrap();
    client.set_token(Some(AccessToken::new(TOKEN, 3600)));
    client
}
