// Tests may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

mod common;

use common::{CHAPTER_PL_1, MOONLIT, NIGHT_TRAIN, json, with_sink};
use kirei_mangadex::{ClientCredentials, MangaDex, MangaDexError, Secret};
use wiremock::matchers::{body_json, header, method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

const CHAPTER_PL_2: &str = "5c0a1b2c-0000-4000-8000-000000000002";

async fn signed_in(server: &MockServer) -> MangaDex {
    Mock::given(method("POST"))
        .and(path("/auth/token"))
        .respond_with(json("token.json"))
        .mount(server)
        .await;
    let (md, _) = with_sink(server);
    md.sign_in(
        ClientCredentials {
            client_id: "personal-client-kirei-test".into(),
            client_secret: Secret::new("client-secret-value"),
        },
        "reader",
        &Secret::new("password"),
    )
    .await
    .unwrap();
    md
}

fn bearer() -> wiremock::matchers::HeaderExactMatcher {
    header("authorization", "Bearer fixture-access-token-1")
}

#[tokio::test]
async fn reads_the_markers_of_one_series() {
    let server = MockServer::start().await;
    let md = signed_in(&server).await;
    Mock::given(method("GET"))
        .and(path(format!("/manga/{MOONLIT}/read")))
        .and(bearer())
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "result": "ok",
            "data": [CHAPTER_PL_1, CHAPTER_PL_2],
        })))
        .expect(1)
        .mount(&server)
        .await;

    let read = md.read_markers(MOONLIT).await.unwrap();
    assert_eq!(
        read,
        vec![CHAPTER_PL_1.to_string(), CHAPTER_PL_2.to_string()]
    );
}

#[tokio::test]
async fn reads_markers_grouped_by_series_and_accepts_an_empty_list() {
    let server = MockServer::start().await;
    let md = signed_in(&server).await;
    Mock::given(method("GET"))
        .and(path("/manga/read"))
        .and(query_param("grouped", "true"))
        .and(query_param("ids[]", MOONLIT))
        .and(bearer())
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "result": "ok",
            "data": { MOONLIT: [CHAPTER_PL_1] },
        })))
        .expect(1)
        .mount(&server)
        .await;

    let grouped = md
        .read_markers_for(&[MOONLIT.to_string(), NIGHT_TRAIN.to_string()])
        .await
        .unwrap();
    assert_eq!(grouped[MOONLIT], vec![CHAPTER_PL_1.to_string()]);
    assert!(!grouped.contains_key(NIGHT_TRAIN));

    server.reset().await;
    Mock::given(method("GET"))
        .and(path("/manga/read"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({ "result": "ok", "data": [] })),
        )
        .mount(&server)
        .await;
    let none = md
        .read_markers_for(&[NIGHT_TRAIN.to_string()])
        .await
        .unwrap();
    assert!(none.is_empty());
}

#[tokio::test]
async fn writes_read_and_unread_markers_in_one_request() {
    let server = MockServer::start().await;
    let md = signed_in(&server).await;
    Mock::given(method("POST"))
        .and(path(format!("/manga/{MOONLIT}/read")))
        .and(query_param("updateHistory", "true"))
        .and(bearer())
        .and(body_json(serde_json::json!({
            "chapterIdsRead": [CHAPTER_PL_1],
            "chapterIdsUnread": [CHAPTER_PL_2],
        })))
        .respond_with(json("ok.json"))
        .expect(1)
        .mount(&server)
        .await;

    md.set_read_markers(
        MOONLIT,
        &[CHAPTER_PL_1.to_string()],
        &[CHAPTER_PL_2.to_string()],
    )
    .await
    .unwrap();
    // Nothing to change sends nothing.
    md.set_read_markers(MOONLIT, &[], &[]).await.unwrap();
}

#[tokio::test]
async fn markers_need_a_session_and_valid_ids() {
    let server = MockServer::start().await;
    let md = common::client(&server);
    assert!(matches!(
        md.read_markers(MOONLIT).await,
        Err(MangaDexError::NotSignedIn)
    ));
    let md = signed_in(&server).await;
    assert!(matches!(
        md.set_read_markers(MOONLIT, &["../etc".to_string()], &[])
            .await,
        Err(MangaDexError::InvalidInput(_))
    ));
}
