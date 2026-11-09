// Tests may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

mod common;

use common::{MOONLIT, NIGHT_TRAIN, client, fixture, json, with_sink};
use kirei_mangadex::{
    ClientCredentials, FeedQuery, MangaDexError, ReadingStatus, Secret, TokenSet,
};
use wiremock::matchers::{body_json, body_string_contains, header, method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn personal_client() -> ClientCredentials {
    ClientCredentials {
        client_id: "personal-client-kirei-test".into(),
        client_secret: Secret::new("client-secret-value"),
    }
}

async fn token_endpoint(server: &MockServer) {
    Mock::given(method("POST"))
        .and(path("/auth/token"))
        .and(header("content-type", "application/x-www-form-urlencoded"))
        .and(body_string_contains("grant_type=password"))
        .and(body_string_contains("username=reader"))
        .and(body_string_contains("password=p%40ss+word"))
        .and(body_string_contains("client_id=personal-client-kirei-test"))
        .and(body_string_contains("client_secret=client-secret-value"))
        .respond_with(json("token.json"))
        .expect(1)
        .mount(server)
        .await;
}

async fn signed_in(
    server: &MockServer,
) -> (
    kirei_mangadex::MangaDex,
    std::sync::Arc<common::RecordingSink>,
) {
    token_endpoint(server).await;
    let (md, sink) = with_sink(server);
    md.sign_in(personal_client(), "reader", &Secret::new("p@ss word"))
        .await
        .unwrap();
    (md, sink)
}

#[tokio::test]
async fn sign_in_uses_the_password_grant_and_hands_tokens_to_the_sink() {
    let server = MockServer::start().await;
    let (md, sink) = signed_in(&server).await;
    assert!(md.is_signed_in().await);

    let events = sink.events.lock().unwrap();
    assert_eq!(events.len(), 1);
    let tokens = events[0].as_ref().unwrap();
    assert_eq!(tokens.access_token.expose(), "fixture-access-token-1");
    assert_eq!(tokens.refresh_token.expose(), "fixture-refresh-token-1");
    assert!(tokens.refresh_expires_at.is_some());
}

#[tokio::test]
async fn refused_credentials_give_the_servers_reason() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/auth/token"))
        .respond_with(
            ResponseTemplate::new(401).set_body_string(fixture("token_invalid_grant.json")),
        )
        .mount(&server)
        .await;
    let md = client(&server);
    let error = md
        .sign_in(personal_client(), "reader", &Secret::new("wrong"))
        .await
        .unwrap_err();
    match error {
        MangaDexError::SignIn(message) => assert_eq!(message, "Invalid user credentials"),
        other => panic!("{other:?}"),
    }
    assert!(!md.is_signed_in().await);
}

#[tokio::test]
async fn user_calls_need_a_session() {
    let server = MockServer::start().await;
    let error = client(&server).follow(MOONLIT).await.unwrap_err();
    assert!(matches!(error, MangaDexError::NotSignedIn));
    assert!(server.received_requests().await.unwrap().is_empty());
}

#[tokio::test]
async fn follows_and_statuses_carry_the_bearer() {
    let server = MockServer::start().await;
    let (md, _) = signed_in(&server).await;
    let bearer = || header("authorization", "Bearer fixture-access-token-1");

    Mock::given(method("POST"))
        .and(path(format!("/manga/{MOONLIT}/follow")))
        .and(bearer())
        .respond_with(json("ok.json"))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("DELETE"))
        .and(path(format!("/manga/{MOONLIT}/follow")))
        .and(bearer())
        .respond_with(json("ok.json"))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(format!("/user/follows/manga/{MOONLIT}")))
        .respond_with(json("ok.json"))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(format!("/user/follows/manga/{NIGHT_TRAIN}")))
        .respond_with(ResponseTemplate::new(404).set_body_string(r#"{"result":"ok"}"#))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/user/follows/manga"))
        .and(bearer())
        .and(query_param("includes[]", "cover_art"))
        .respond_with(json("search_manga.json"))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/manga/status"))
        .and(bearer())
        .respond_with(json("statuses.json"))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(format!("/manga/{MOONLIT}/status")))
        .and(bearer())
        .respond_with(json("status.json"))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path(format!("/manga/{MOONLIT}/status")))
        .and(bearer())
        .and(body_json(serde_json::json!({ "status": "re_reading" })))
        .respond_with(json("ok.json"))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path(format!("/manga/{NIGHT_TRAIN}/status")))
        .and(body_json(serde_json::json!({ "status": null })))
        .respond_with(json("ok.json"))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/user/follows/manga/feed"))
        .and(bearer())
        .and(query_param("order[readableAt]", "desc"))
        .and(query_param("translatedLanguage[]", "pl"))
        .respond_with(json("feed_page1.json"))
        .mount(&server)
        .await;

    md.follow(MOONLIT).await.unwrap();
    md.unfollow(MOONLIT).await.unwrap();
    assert!(md.is_following(MOONLIT).await.unwrap());
    assert!(!md.is_following(NIGHT_TRAIN).await.unwrap());

    let follows = md.followed_manga(100, 0).await.unwrap();
    assert_eq!(follows.items.len(), 2);

    let statuses = md.reading_statuses(None).await.unwrap();
    assert_eq!(statuses[MOONLIT], ReadingStatus::Reading);
    assert_eq!(statuses[NIGHT_TRAIN], ReadingStatus::PlanToRead);
    assert_eq!(
        md.reading_status(MOONLIT).await.unwrap(),
        Some(ReadingStatus::OnHold)
    );
    md.set_reading_status(MOONLIT, Some(ReadingStatus::ReReading))
        .await
        .unwrap();
    md.set_reading_status(NIGHT_TRAIN, None).await.unwrap();

    let feed = md.followed_feed(&FeedQuery::default()).await.unwrap();
    assert_eq!(feed.items[0].manga_id.as_deref(), Some(MOONLIT));
}

#[tokio::test]
async fn a_rejected_token_is_refreshed_once_and_the_call_retried() {
    let server = MockServer::start().await;
    let (md, sink) = signed_in(&server).await;

    Mock::given(method("POST"))
        .and(path(format!("/manga/{MOONLIT}/follow")))
        .and(header("authorization", "Bearer fixture-access-token-1"))
        .respond_with(
            ResponseTemplate::new(401).set_body_string(fixture("error_unauthorized.json")),
        )
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/auth/token"))
        .and(body_string_contains("grant_type=refresh_token"))
        .and(body_string_contains(
            "refresh_token=fixture-refresh-token-1",
        ))
        .and(body_string_contains("client_secret=client-secret-value"))
        .respond_with(json("token_refreshed.json"))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path(format!("/manga/{MOONLIT}/follow")))
        .and(header("authorization", "Bearer fixture-access-token-2"))
        .respond_with(json("ok.json"))
        .expect(1)
        .mount(&server)
        .await;

    md.follow(MOONLIT).await.unwrap();

    // The rotated refresh token reached the sink, for the keychain.
    let events = sink.events.lock().unwrap();
    let latest = events.last().unwrap().as_ref().unwrap();
    assert_eq!(latest.refresh_token.expose(), "fixture-refresh-token-2");
}

#[tokio::test]
async fn an_expired_access_token_is_refreshed_before_use() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/auth/token"))
        .and(body_string_contains("grant_type=refresh_token"))
        .respond_with(json("token_refreshed.json"))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(format!("/manga/{MOONLIT}/status")))
        .and(header("authorization", "Bearer fixture-access-token-2"))
        .respond_with(json("status.json"))
        .expect(2)
        .mount(&server)
        .await;

    let (md, _) = with_sink(&server);
    md.restore_session(
        personal_client(),
        TokenSet {
            access_token: Secret::new("stale"),
            refresh_token: Secret::new("fixture-refresh-token-1"),
            access_expires_at: 0,
            refresh_expires_at: None,
        },
    )
    .await;
    // Two concurrent calls share one refresh.
    let (a, b) = tokio::join!(md.reading_status(MOONLIT), md.reading_status(MOONLIT));
    assert_eq!(a.unwrap(), Some(ReadingStatus::OnHold));
    assert_eq!(b.unwrap(), Some(ReadingStatus::OnHold));
}

#[tokio::test]
async fn a_dead_refresh_token_ends_the_session() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/auth/token"))
        .respond_with(ResponseTemplate::new(400).set_body_string(
            r#"{"error":"invalid_grant","error_description":"Token is not active"}"#,
        ))
        .mount(&server)
        .await;

    let (md, sink) = with_sink(&server);
    md.restore_session(
        personal_client(),
        TokenSet {
            access_token: Secret::new("stale"),
            refresh_token: Secret::new("revoked"),
            access_expires_at: 0,
            refresh_expires_at: None,
        },
    )
    .await;
    let error = md.follow(MOONLIT).await.unwrap_err();
    assert!(matches!(error, MangaDexError::SessionExpired), "{error:?}");
    assert!(!md.is_signed_in().await);
    // The app is told to forget the stored tokens.
    assert_eq!(sink.events.lock().unwrap().last(), Some(&None));
}

#[tokio::test]
async fn sign_out_clears_the_session_and_the_stored_tokens() {
    let server = MockServer::start().await;
    let (md, sink) = signed_in(&server).await;
    md.sign_out().await;
    assert!(!md.is_signed_in().await);
    assert_eq!(sink.events.lock().unwrap().last(), Some(&None));
}

#[tokio::test]
async fn errors_never_show_credentials() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/auth/token"))
        .respond_with(ResponseTemplate::new(500))
        .mount(&server)
        .await;
    let error = client(&server)
        .sign_in(personal_client(), "reader", &Secret::new("p@ss word"))
        .await
        .unwrap_err();
    let printed = format!("{error} {error:?}");
    assert!(!printed.contains("p@ss"));
    assert!(!printed.contains("client-secret-value"));
}
