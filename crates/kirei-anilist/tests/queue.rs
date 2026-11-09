// Tests may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

//! Delivering queued updates: what is sent, and what an offline or failing
//! AniList turns into.

mod common;

use std::time::Duration;

use common::{config, json, signed_in};
use kirei_anilist::sync::{deliver, retry_delay};
use kirei_anilist::{AniList, ConflictPolicy, Delivery, ListStatus, PendingUpdate};
use serde_json::Value;
use wiremock::matchers::{body_string_contains, method};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn update(progress: i64) -> PendingUpdate {
    PendingUpdate {
        media_id: 30013,
        progress: Some(progress),
        synced: Some(7),
        ..Default::default()
    }
}

async fn mount_media(server: &MockServer) {
    Mock::given(method("POST"))
        .and(body_string_contains("Media(id"))
        .respond_with(json(200, "media.json"))
        .mount(server)
        .await;
}

async fn saves(server: &MockServer) -> Vec<Value> {
    server
        .received_requests()
        .await
        .unwrap()
        .iter()
        .filter_map(|r| {
            let body: Value = serde_json::from_slice(&r.body).unwrap();
            body["query"]
                .as_str()
                .unwrap()
                .contains("SaveMediaListEntry")
                .then(|| body["variables"].clone())
        })
        .collect()
}

#[tokio::test]
async fn local_progress_ahead_is_pushed() {
    let server = MockServer::start().await;
    mount_media(&server).await;
    Mock::given(method("POST"))
        .and(body_string_contains("SaveMediaListEntry"))
        .respond_with(json(200, "save.json"))
        .expect(1)
        .mount(&server)
        .await;
    let delivery = deliver(&signed_in(&server), &update(9), ConflictPolicy::Higher).await;
    match delivery {
        Delivery::Sent { entry, total } => {
            assert_eq!(entry.progress, 9);
            assert_eq!(total, Some(20));
        }
        other => panic!("expected sent, got {other:?}"),
    }
    let sent = saves(&server).await;
    assert_eq!(sent[0]["progress"], 9);
    assert!(sent[0].get("status").is_none(), "already reading");
}

#[tokio::test]
async fn remote_ahead_is_kept_and_reported() {
    let server = MockServer::start().await;
    mount_media(&server).await;
    let delivery = deliver(&signed_in(&server), &update(3), ConflictPolicy::Higher).await;
    match delivery {
        Delivery::RemoteAhead { entry, .. } => assert_eq!(entry.progress, 7),
        other => panic!("expected remote ahead, got {other:?}"),
    }
    assert!(
        saves(&server).await.is_empty(),
        "AniList is never moved back"
    );
}

#[tokio::test]
async fn equal_progress_sends_nothing() {
    let server = MockServer::start().await;
    mount_media(&server).await;
    let delivery = deliver(&signed_in(&server), &update(7), ConflictPolicy::Higher).await;
    assert!(matches!(delivery, Delivery::InSync { entry: Some(_), .. }));
    assert!(saves(&server).await.is_empty());
}

#[tokio::test]
async fn a_status_choice_is_sent_with_the_progress() {
    let server = MockServer::start().await;
    mount_media(&server).await;
    Mock::given(method("POST"))
        .and(body_string_contains("SaveMediaListEntry"))
        .respond_with(json(200, "save.json"))
        .mount(&server)
        .await;
    let pending = PendingUpdate {
        status: Some(ListStatus::Paused),
        ..update(3)
    };
    let delivery = deliver(&signed_in(&server), &pending, ConflictPolicy::Higher).await;
    assert!(matches!(delivery, Delivery::Sent { .. }));
    let sent = saves(&server).await;
    assert_eq!(sent[0]["status"], "PAUSED");
    assert!(
        sent[0].get("progress").is_none(),
        "remote progress ahead stays"
    );
}

#[tokio::test]
async fn offline_updates_are_retried_with_backoff() {
    // Nothing listens on the address: a connection failure, as offline.
    let unreachable = {
        let socket = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        socket.local_addr().unwrap().port()
    };
    let server = MockServer::start().await;
    let mut cfg = config(&server);
    cfg.endpoints =
        kirei_anilist::Endpoints::local(&format!("http://127.0.0.1:{unreachable}")).unwrap();
    cfg.retry.max_retries = 0;
    let client = AniList::new(cfg).unwrap();
    client.set_token(Some(kirei_anilist::AccessToken::new("t", 3600)));

    let mut pending = update(9);
    pending.attempts = 2;
    match deliver(&client, &pending, ConflictPolicy::Higher).await {
        Delivery::Retry { after, error } => {
            assert_eq!(after, retry_delay(2));
            assert!(error.contains("cannot reach AniList"));
        }
        other => panic!("expected a retry, got {other:?}"),
    }
}

#[tokio::test]
async fn a_queued_update_goes_through_once_anilist_answers_again() {
    let server = MockServer::start().await;
    // First round: AniList is down for longer than the client retries.
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(503))
        .up_to_n_times(4)
        .mount(&server)
        .await;
    mount_media(&server).await;
    Mock::given(method("POST"))
        .and(body_string_contains("SaveMediaListEntry"))
        .respond_with(json(200, "save.json"))
        .mount(&server)
        .await;
    let client = signed_in(&server);
    let mut pending = update(9);
    match deliver(&client, &pending, ConflictPolicy::Higher).await {
        Delivery::Retry { after, .. } => assert_eq!(after, Duration::from_secs(30)),
        other => panic!("expected a retry, got {other:?}"),
    }
    pending.attempts += 1;
    assert!(matches!(
        deliver(&client, &pending, ConflictPolicy::Higher).await,
        Delivery::Sent { .. }
    ));
}

#[tokio::test]
async fn a_rate_limit_waits_at_least_as_long_as_asked() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(json(429, "too_many.json").insert_header("retry-after", "600"))
        .mount(&server)
        .await;
    match deliver(&signed_in(&server), &update(9), ConflictPolicy::Higher).await {
        Delivery::Retry { after, .. } => assert_eq!(after, Duration::from_secs(600)),
        other => panic!("expected a retry, got {other:?}"),
    }
}

#[tokio::test]
async fn a_rejected_token_waits_for_a_sign_in() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(json(400, "invalid_token.json"))
        .mount(&server)
        .await;
    assert!(matches!(
        deliver(&signed_in(&server), &update(9), ConflictPolicy::Higher).await,
        Delivery::NeedsSignIn { .. }
    ));
}

#[tokio::test]
async fn a_missing_series_fails_for_good() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(json(404, "not_found.json"))
        .mount(&server)
        .await;
    assert!(matches!(
        deliver(&signed_in(&server), &update(9), ConflictPolicy::Higher).await,
        Delivery::Failed { .. }
    ));
}

#[tokio::test]
async fn an_unlisted_series_is_added_as_reading() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(body_string_contains("Media(id"))
        .respond_with(json(200, "media_unlisted.json"))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(body_string_contains("SaveMediaListEntry"))
        .respond_with(json(200, "save.json"))
        .mount(&server)
        .await;
    let pending = PendingUpdate {
        synced: None,
        ..update(2)
    };
    deliver(&signed_in(&server), &pending, ConflictPolicy::Higher).await;
    let sent = saves(&server).await;
    assert_eq!(sent[0]["progress"], 2);
    assert_eq!(sent[0]["status"], "CURRENT");
}
