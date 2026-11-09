// Tests may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

mod common;

use std::time::Duration;

use common::{TOKEN, USER_AGENT, config, json, signed_in};
use kirei_anilist::{AniList, AniListError, EntryUpdate, ListStatus};
use serde_json::Value;
use wiremock::matchers::{body_string_contains, header, method, path};
use wiremock::{Mock, MockServer, Request, ResponseTemplate};

fn variables(request: &Request) -> Value {
    let body: Value = serde_json::from_slice(&request.body).unwrap();
    body["variables"].clone()
}

#[tokio::test]
async fn viewer_sends_the_required_headers_and_the_token() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/graphql"))
        .and(header("content-type", "application/json"))
        .and(header("accept", "application/json"))
        .and(header("authorization", format!("Bearer {TOKEN}").as_str()))
        .and(header("user-agent", USER_AGENT))
        .and(body_string_contains("Viewer"))
        .respond_with(json(200, "viewer.json"))
        .expect(1)
        .mount(&server)
        .await;
    let viewer = signed_in(&server).viewer().await.unwrap();
    assert_eq!(viewer.id, 4242);
    assert_eq!(viewer.name, "Shirone");
    assert!(viewer.avatar.unwrap().ends_with("b4242.png"));
}

#[tokio::test]
async fn signed_out_calls_that_need_a_token_send_nothing() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(json(200, "viewer.json"))
        .expect(0)
        .mount(&server)
        .await;
    let client = AniList::new(config(&server)).unwrap();
    assert!(matches!(
        client.viewer().await,
        Err(AniListError::NotSignedIn)
    ));
    assert!(matches!(
        client
            .save_entry(
                1,
                &EntryUpdate {
                    progress: Some(1),
                    ..Default::default()
                }
            )
            .await,
        Err(AniListError::NotSignedIn)
    ));
}

#[tokio::test]
async fn a_rejected_token_asks_for_a_new_sign_in() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(json(400, "invalid_token.json"))
        .mount(&server)
        .await;
    let error = signed_in(&server).viewer().await.unwrap_err();
    assert!(matches!(error, AniListError::TokenRejected));
    assert!(error.needs_sign_in());
    assert!(!error.to_string().contains(TOKEN));
}

#[tokio::test]
async fn search_reads_titles_entries_and_paging() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(body_string_contains("SEARCH_MATCH"))
        .and(body_string_contains("isAdult: false"))
        .respond_with(json(200, "search.json"))
        .expect(1)
        .mount(&server)
        .await;
    let page = signed_in(&server)
        .search_manga("  moonlit road ", 1, 100, false)
        .await
        .unwrap();
    assert!(page.has_next_page);
    assert_eq!(page.media.len(), 2);
    let first = &page.media[0];
    assert_eq!(first.id, 30013);
    assert_eq!(first.title.display(), "Tsuki no Michi");
    assert_eq!(first.chapters, Some(20));
    assert_eq!(first.start_year, Some(2014));
    let entry = first.list_entry.as_ref().unwrap();
    assert_eq!(entry.progress, 7);
    assert_eq!(entry.status, Some(ListStatus::Current));
    assert_eq!(page.media[1].list_entry, None);
    assert_eq!(page.media[1].cover, None);

    let requests = server.received_requests().await.unwrap();
    let vars = variables(&requests[0]);
    assert_eq!(vars["search"], "moonlit road");
    assert_eq!(vars["perPage"], 25, "page size is capped");
}

#[tokio::test]
async fn search_works_signed_out_without_list_entries() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(json(200, "search.json"))
        .mount(&server)
        .await;
    let client = AniList::new(config(&server)).unwrap();
    client.search_manga("moonlit", 1, 10, false).await.unwrap();
    let requests = server.received_requests().await.unwrap();
    assert!(!requests[0].headers.contains_key("authorization"));
    let body = String::from_utf8(requests[0].body.clone()).unwrap();
    assert!(!body.contains("mediaListEntry"));
    assert!(matches!(
        client.search_manga("   ", 1, 10, false).await,
        Err(AniListError::InvalidInput(_))
    ));
}

#[tokio::test]
async fn manga_reads_the_list_entry_or_none() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(json(200, "media_unlisted.json"))
        .mount(&server)
        .await;
    let media = signed_in(&server).manga(30013).await.unwrap();
    assert_eq!(media.list_entry, None);
    assert_eq!(media.chapters, None);
}

#[tokio::test]
async fn a_missing_manga_is_not_found() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(json(404, "not_found.json"))
        .mount(&server)
        .await;
    assert!(matches!(
        signed_in(&server).manga(1).await,
        Err(AniListError::NotFound("manga"))
    ));
}

#[tokio::test]
async fn save_sends_only_the_fields_that_change() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(body_string_contains("SaveMediaListEntry"))
        .respond_with(json(200, "save.json"))
        .mount(&server)
        .await;
    let client = signed_in(&server);
    let entry = client
        .save_entry(
            30013,
            &EntryUpdate {
                progress: Some(9),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(entry.progress, 9);
    client
        .save_entry(
            30013,
            &EntryUpdate {
                status: Some(ListStatus::Paused),
                score: Some(140),
                ..Default::default()
            },
        )
        .await
        .unwrap();

    let requests = server.received_requests().await.unwrap();
    let first = variables(&requests[0]);
    assert_eq!(first["mediaId"], 30013);
    assert_eq!(first["progress"], 9);
    assert!(first.get("status").is_none());
    assert!(first.get("scoreRaw").is_none());
    let second = variables(&requests[1]);
    assert_eq!(second["status"], "PAUSED");
    assert_eq!(second["scoreRaw"], 100, "scores are clamped to 0..=100");
    assert!(second.get("progress").is_none());
}

#[tokio::test]
async fn an_empty_update_is_refused_before_sending() {
    let server = MockServer::start().await;
    let error = signed_in(&server)
        .save_entry(1, &EntryUpdate::default())
        .await
        .unwrap_err();
    assert!(matches!(error, AniListError::InvalidInput(_)));
    assert!(server.received_requests().await.unwrap().is_empty());
}

#[tokio::test]
async fn a_429_waits_for_retry_after_then_succeeds() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(json(429, "too_many.json").insert_header("retry-after", "1"))
        .up_to_n_times(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .respond_with(json(200, "viewer.json"))
        .mount(&server)
        .await;
    let started = std::time::Instant::now();
    signed_in(&server).viewer().await.unwrap();
    assert!(started.elapsed() >= Duration::from_secs(1));
    assert_eq!(server.received_requests().await.unwrap().len(), 2);
}

#[tokio::test]
async fn a_long_retry_after_is_returned_instead_of_slept() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(json(429, "too_many.json").insert_header("retry-after", "60"))
        .mount(&server)
        .await;
    let error = signed_in(&server).viewer().await.unwrap_err();
    match error {
        AniListError::RateLimited { retry_after } => {
            assert_eq!(retry_after, Duration::from_secs(60));
        }
        other => panic!("expected a rate limit, got {other:?}"),
    }
    assert!(
        signed_in(&server)
            .viewer()
            .await
            .unwrap_err()
            .is_transient()
    );
}

#[tokio::test]
async fn server_errors_are_retried() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(502))
        .up_to_n_times(2)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .respond_with(json(200, "viewer.json"))
        .mount(&server)
        .await;
    signed_in(&server).viewer().await.unwrap();
    assert_eq!(server.received_requests().await.unwrap().len(), 3);
}

#[tokio::test]
async fn maintenance_is_reported_as_unavailable() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(json(403, "disabled.json"))
        .mount(&server)
        .await;
    let error = signed_in(&server).viewer().await.unwrap_err();
    assert!(matches!(error, AniListError::Unavailable(_)));
    assert!(error.is_transient());
}

#[tokio::test]
async fn the_budget_follows_the_reported_limit() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(
            json(200, "viewer.json")
                .insert_header("x-ratelimit-limit", "30")
                .insert_header("x-ratelimit-remaining", "29"),
        )
        .mount(&server)
        .await;
    let client = signed_in(&server);
    assert_eq!(client.rate_limit().await, 90);
    client.viewer().await.unwrap();
    assert_eq!(client.rate_limit().await, 30, "degraded mode is followed");
}
