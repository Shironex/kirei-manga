// Tests may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

//! The loopback redirect, driven like a browser would: load the callback
//! page, read the nonce out of it, post the fragment back.

use std::time::Duration;

use kirei_anilist::{AniListError, CALLBACK_PATH, SignInListener};

fn http() -> reqwest::Client {
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder().no_proxy().build().unwrap()
}

/// What the callback page's script would post: its own nonce, then the
/// fragment AniList put on the redirect.
async fn nonce_from_page(port: u16) -> String {
    let page = http()
        .get(format!("http://127.0.0.1:{port}{CALLBACK_PATH}"))
        .send()
        .await
        .unwrap();
    assert_eq!(page.status(), 200);
    let csp = page.headers()["content-security-policy"]
        .to_str()
        .unwrap()
        .to_owned();
    assert!(csp.contains("default-src 'none'"));
    let html = page.text().await.unwrap();
    let start = html.find("nonce=\"").unwrap() + 7;
    let nonce = html[start..start + 32].to_owned();
    assert!(csp.contains(&format!("'nonce-{nonce}'")));
    nonce
}

async fn post(port: u16, body: String) -> reqwest::Response {
    http()
        .post(format!("http://127.0.0.1:{port}/anilist/token"))
        .header("content-type", "application/x-www-form-urlencoded")
        .header("origin", format!("http://127.0.0.1:{port}"))
        .body(body)
        .send()
        .await
        .unwrap()
}

#[tokio::test]
async fn the_redirect_delivers_the_token() {
    let listener = SignInListener::bind(0).await.unwrap();
    let port = listener.port();
    assert_eq!(
        listener.redirect_uri(),
        format!("http://127.0.0.1:{port}/anilist/callback")
    );
    let waiting = tokio::spawn(listener.wait(Duration::from_secs(10)));

    // Stray requests do not end the wait.
    let favicon = http()
        .get(format!("http://127.0.0.1:{port}/favicon.ico"))
        .send()
        .await
        .unwrap();
    assert_eq!(favicon.status(), 404);
    let forged = post(port, "nonce=guess&access_token=planted".into()).await;
    assert_eq!(forged.status(), 400);

    let nonce = nonce_from_page(port).await;
    let answer = post(
        port,
        format!("nonce={nonce}&access_token=eyJ.real&token_type=Bearer&expires_in=31536000"),
    )
    .await;
    assert_eq!(answer.status(), 200);
    assert!(answer.text().await.unwrap().contains("Signed in"));

    let token = waiting.await.unwrap().unwrap();
    assert_eq!(token.access_token.expose(), "eyJ.real");
    assert!(!token.is_expired());
}

#[tokio::test]
async fn a_cancelled_approval_ends_the_wait_with_a_reason() {
    let listener = SignInListener::bind(0).await.unwrap();
    let port = listener.port();
    let waiting = tokio::spawn(listener.wait(Duration::from_secs(10)));
    let nonce = nonce_from_page(port).await;
    post(port, format!("nonce={nonce}&error=access_denied")).await;
    match waiting.await.unwrap() {
        Err(AniListError::SignIn(reason)) => assert!(reason.contains("cancelled")),
        other => panic!("expected a refusal, got {other:?}"),
    }
}

#[tokio::test]
async fn a_foreign_host_or_origin_is_refused() {
    let listener = SignInListener::bind(0).await.unwrap();
    let port = listener.port();
    let waiting = tokio::spawn(listener.wait(Duration::from_secs(10)));

    let rebound = http()
        .get(format!("http://127.0.0.1:{port}{CALLBACK_PATH}"))
        .header("host", format!("evil.example:{port}"))
        .send()
        .await
        .unwrap();
    assert_eq!(rebound.status(), 421);

    let nonce = nonce_from_page(port).await;
    let cross = http()
        .post(format!("http://127.0.0.1:{port}/anilist/token"))
        .header("origin", "https://evil.example")
        .body(format!("nonce={nonce}&access_token=planted"))
        .send()
        .await
        .unwrap();
    assert_eq!(cross.status(), 400);
    assert!(!waiting.is_finished());
    waiting.abort();
}

#[tokio::test]
async fn the_wait_times_out() {
    let listener = SignInListener::bind(0).await.unwrap();
    let error = listener.wait(Duration::from_millis(50)).await.unwrap_err();
    assert!(matches!(error, AniListError::SignIn(_)));
}

#[tokio::test]
async fn a_taken_port_is_reported() {
    let first = SignInListener::bind(0).await.unwrap();
    let error = SignInListener::bind(first.port()).await.unwrap_err();
    assert!(error.to_string().contains("cannot listen"));
}
