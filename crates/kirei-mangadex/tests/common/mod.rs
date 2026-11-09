// Test helpers may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used, dead_code, unreachable_pub)]

use std::sync::{Arc, Mutex};
use std::time::Duration;

use kirei_mangadex::{
    CacheConfig, ClientConfig, Endpoints, MangaDex, RetryPolicy, TokenSet, TokenSink,
};
use wiremock::MockServer;

pub const MOONLIT: &str = "0b1f2c3d-0000-4000-8000-000000000001";
pub const NIGHT_TRAIN: &str = "0b1f2c3d-0000-4000-8000-000000000002";
pub const CHAPTER_PL_1: &str = "5c0a1b2c-0000-4000-8000-000000000001";
pub const USER_AGENT: &str = "KireiManga/0.0.0-test (+https://github.com/Shironex/kirei-manga)";

/// A recorded response from `tests/fixtures`.
pub fn fixture(name: &str) -> String {
    let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(&path).unwrap_or_else(|error| panic!("{path}: {error}"))
}

pub fn json(name: &str) -> wiremock::ResponseTemplate {
    wiremock::ResponseTemplate::new(200)
        .insert_header("content-type", "application/json")
        .set_body_string(fixture(name))
}

/// A config pointed at the mock server, with fast retries.
pub fn config(server: &MockServer) -> ClientConfig {
    let mut config = ClientConfig::new(USER_AGENT);
    config.endpoints = Endpoints::local(&server.uri()).unwrap();
    config.retry = RetryPolicy {
        max_retries: 3,
        base_delay: Duration::from_millis(10),
        max_delay: Duration::from_secs(3),
    };
    config
}

pub fn client(server: &MockServer) -> MangaDex {
    MangaDex::new(config(server)).unwrap()
}

pub fn uncached(server: &MockServer) -> MangaDex {
    let mut config = config(server);
    config.cache = CacheConfig::disabled();
    MangaDex::new(config).unwrap()
}

/// Remembers every token change, to check what the app would store.
#[derive(Default)]
pub struct RecordingSink {
    pub events: Mutex<Vec<Option<TokenSet>>>,
}

impl TokenSink for RecordingSink {
    fn tokens_changed(&self, tokens: Option<&TokenSet>) {
        self.events.lock().unwrap().push(tokens.cloned());
    }
}

pub fn with_sink(server: &MockServer) -> (MangaDex, Arc<RecordingSink>) {
    let sink = Arc::new(RecordingSink::default());
    let mut config = config(server);
    config.token_sink = Some(sink.clone());
    (MangaDex::new(config).unwrap(), sink)
}
