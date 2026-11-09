// Tests may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

mod common;

use common::{CHAPTER_PL_1, client, config, fixture, json};
use kirei_mangadex::{ImageQuality, MangaDex, MangaDexError};
use serde_json::Value;
use wiremock::matchers::{method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

const PAGE_ONE: &str = "x1-b765e86d5ecbc932cf3f517a8604f6ac6d8a7f379b0277a117dc7c09c53d041e.png";
const SAVER_ONE: &str = "x1-ab2b7c8f30c843aa3a53c29bc8c0e204fba4ab3e75985d761921eb6a52ff6159.jpg";
const HASH: &str = "d9786b687bc5f3fe1d4ae05ff05e0eb5";

fn at_home(base: &str) -> ResponseTemplate {
    ResponseTemplate::new(200).set_body_string(fixture("at_home.json").replace("{{BASE}}", base))
}

async fn reports(server: &MockServer) -> Vec<Value> {
    server
        .received_requests()
        .await
        .unwrap()
        .into_iter()
        .filter(|request| request.url.path() == "/report")
        .map(|request| serde_json::from_slice(&request.body).unwrap())
        .collect()
}

#[tokio::test]
async fn fetches_a_page_and_reports_it() {
    let server = MockServer::start().await;
    let base = format!("{}/node-a/temp-token", server.uri());
    Mock::given(method("GET"))
        .and(path(format!("/at-home/server/{CHAPTER_PL_1}")))
        .respond_with(at_home(&base))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(format!(
            "/node-a/temp-token/data-saver/{HASH}/{SAVER_ONE}"
        )))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "image/jpeg")
                .insert_header("x-cache", "HIT from node-a")
                .set_body_bytes(vec![7u8; 1234]),
        )
        .expect(2)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/report"))
        .respond_with(ResponseTemplate::new(200))
        .mount(&server)
        .await;

    let md = client(&server);
    let page = md
        .page(CHAPTER_PL_1, 0, ImageQuality::DataSaver)
        .await
        .unwrap();
    assert_eq!(page.bytes.len(), 1234);
    assert_eq!(page.content_type.as_deref(), Some("image/jpeg"));
    assert_eq!(page.file_name, SAVER_ONE);
    // The server assignment is reused: one at-home request for two pages.
    md.page(CHAPTER_PL_1, 0, ImageQuality::DataSaver)
        .await
        .unwrap();

    let sent = reports(&server).await;
    assert_eq!(sent.len(), 2);
    assert_eq!(
        sent[0]["url"],
        format!("{base}/data-saver/{HASH}/{SAVER_ONE}")
    );
    assert_eq!(sent[0]["success"], true);
    assert_eq!(sent[0]["cached"], true);
    assert_eq!(sent[0]["bytes"], 1234);
    assert!(sent[0]["duration"].is_u64());

    // Images go out without any auth header.
    let image_requests: Vec<_> = server
        .received_requests()
        .await
        .unwrap()
        .into_iter()
        .filter(|request| request.url.path().contains("/data-saver/"))
        .collect();
    assert!(
        image_requests
            .iter()
            .all(|request| !request.headers.contains_key("authorization"))
    );
}

#[tokio::test]
async fn a_failing_server_is_reported_and_replaced() {
    let server = MockServer::start().await;
    let bad = format!("{}/node-bad/t1", server.uri());
    let good = format!("{}/node-good/t2", server.uri());
    // The first assignment is a broken node, the second a healthy one.
    Mock::given(method("GET"))
        .and(path(format!("/at-home/server/{CHAPTER_PL_1}")))
        .respond_with(at_home(&bad))
        .up_to_n_times(1)
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(format!("/at-home/server/{CHAPTER_PL_1}")))
        .respond_with(at_home(&good))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(format!("/node-bad/t1/data/{HASH}/{PAGE_ONE}")))
        .respond_with(ResponseTemplate::new(502))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(format!("/node-good/t2/data/{HASH}/{PAGE_ONE}")))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(vec![1u8; 99]))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/report"))
        .respond_with(ResponseTemplate::new(200))
        .mount(&server)
        .await;

    let page = client(&server)
        .page(CHAPTER_PL_1, 0, ImageQuality::Data)
        .await
        .unwrap();
    assert_eq!(page.bytes.len(), 99);

    let sent = reports(&server).await;
    assert_eq!(sent.len(), 2);
    assert_eq!(sent[0]["success"], false);
    assert_eq!(sent[0]["bytes"], 0);
    assert_eq!(sent[0]["cached"], false);
    assert!(sent[0]["url"].as_str().unwrap().starts_with(&bad));
    assert_eq!(sent[1]["success"], true);
    assert!(sent[1]["url"].as_str().unwrap().starts_with(&good));
}

#[tokio::test]
async fn gives_up_after_the_configured_attempts() {
    let server = MockServer::start().await;
    let base = format!("{}/node/t", server.uri());
    Mock::given(method("GET"))
        .and(path(format!("/at-home/server/{CHAPTER_PL_1}")))
        .and(query_param("forcePort443", "true"))
        .respond_with(at_home(&base))
        .expect(2)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(format!("/node/t/data/{HASH}/{PAGE_ONE}")))
        .respond_with(ResponseTemplate::new(500))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/report"))
        .respond_with(ResponseTemplate::new(200))
        .mount(&server)
        .await;

    let mut config = config(&server);
    config.image_attempts = 2;
    config.force_port_443 = true;
    let md = MangaDex::new(config).unwrap();
    let error = md
        .page(CHAPTER_PL_1, 0, ImageQuality::Data)
        .await
        .unwrap_err();
    assert!(
        matches!(error, MangaDexError::ImageUnavailable { attempts: 2, .. }),
        "{error:?}"
    );
    assert_eq!(reports(&server).await.len(), 2);
}

#[tokio::test]
async fn out_of_range_pages_are_refused() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path(format!("/at-home/server/{CHAPTER_PL_1}")))
        .respond_with(json("at_home.json"))
        .mount(&server)
        .await;
    let error = client(&server)
        .page(CHAPTER_PL_1, 3, ImageQuality::Data)
        .await
        .unwrap_err();
    assert!(matches!(error, MangaDexError::InvalidInput(_)), "{error:?}");
}

#[tokio::test]
async fn server_assignments_list_the_page_files() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path(format!("/at-home/server/{CHAPTER_PL_1}")))
        .respond_with(at_home("https://uploads.mangadex.org"))
        .mount(&server)
        .await;
    let md = client(&server);
    let assigned = md.at_home_server(CHAPTER_PL_1).await.unwrap();
    assert_eq!(assigned.page_count(ImageQuality::Data), 3);
    assert_eq!(assigned.file_names(ImageQuality::DataSaver)[0], SAVER_ONE);
}
