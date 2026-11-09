//! Signing in through the system browser.
//!
//! AniList's implicit grant: the browser opens
//! `anilist.co/api/v2/oauth/authorize?client_id=..&response_type=token`, the
//! user approves, and AniList redirects to the redirect URL registered for
//! the client with the token in the URL fragment. No client secret is
//! involved, so nothing secret ships in the app.
//!
//! The registered redirect URL is `http://127.0.0.1:<port>/anilist/callback`.
//! While a sign in runs, [`SignInListener`] serves that address on the
//! loopback interface only. Browsers never send the fragment to a server, so
//! the callback answers with a tiny page whose script posts the fragment back
//! to the listener together with a per sign in nonce. Another web page cannot
//! read that nonce, so it cannot plant a token of its own account.
//!
//! Why a loopback listener and not a custom URL scheme: it needs no admin
//! rights and no registry or Info.plist entry, works the same on Windows and
//! macOS and in `tauri dev`, and does not depend on the OS routing a scheme to
//! the running instance. Binding 127.0.0.1 (not 0.0.0.0) does not trigger the
//! Windows firewall prompt.

use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::time::{Instant, timeout_at};
use url::Url;

use crate::config::Endpoints;
use crate::error::{AniListError, Result};
use crate::token::{AccessToken, DEFAULT_TOKEN_LIFETIME_SECS};

/// The path of the redirect URL.
pub const CALLBACK_PATH: &str = "/anilist/callback";
/// Where the callback page posts the fragment.
const TOKEN_PATH: &str = "/anilist/token";
/// Largest request head and body the listener reads.
const MAX_HEAD: usize = 16 * 1024;
const MAX_BODY: usize = 8 * 1024;
/// How long one browser connection may take to send its request.
const READ_TIMEOUT: Duration = Duration::from_secs(10);

/// The redirect URL to register on AniList for `port`.
pub fn redirect_uri(port: u16) -> String {
    format!("http://127.0.0.1:{port}{CALLBACK_PATH}")
}

/// The authorize page for the implicit grant.
pub fn authorize_url(endpoints: &Endpoints, client_id: &str) -> Result<Url> {
    let client_id = client_id.trim();
    if client_id.is_empty() || !client_id.chars().all(|c| c.is_ascii_digit()) {
        return Err(AniListError::InvalidInput(
            "this build has no AniList client id; see docs/tracking.md".into(),
        ));
    }
    let mut url = endpoints.authorize.clone();
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("response_type", "token");
    Ok(url)
}

/// Serves the redirect URL on 127.0.0.1 for the length of one sign in.
#[derive(Debug)]
pub struct SignInListener {
    listener: TcpListener,
    port: u16,
    nonce: String,
}

enum Outcome {
    Token(AccessToken),
    Refused(String),
}

impl SignInListener {
    /// Listens on `127.0.0.1:port`. Port 0 picks a free one (tests only: the
    /// registered redirect URL names a fixed port).
    pub async fn bind(port: u16) -> Result<Self> {
        let listener = TcpListener::bind(("127.0.0.1", port))
            .await
            .map_err(|error| {
                AniListError::SignIn(format!(
                    "cannot listen on 127.0.0.1:{port} for the AniList redirect ({error}); \
                     close the program using that port and try again"
                ))
            })?;
        let port = listener
            .local_addr()
            .map_err(|error| AniListError::SignIn(error.to_string()))?
            .port();
        Ok(Self {
            listener,
            port,
            nonce: new_nonce()?,
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn redirect_uri(&self) -> String {
        redirect_uri(self.port)
    }

    /// Answers browser requests until the redirect delivers a token or a
    /// refusal, or `limit` passes. Drop the future to cancel.
    pub async fn wait(self, limit: Duration) -> Result<AccessToken> {
        let deadline = Instant::now() + limit;
        loop {
            let accepted = timeout_at(deadline, self.listener.accept())
                .await
                .map_err(|_| {
                    AniListError::SignIn("the browser did not come back in time".into())
                })?;
            let Ok((stream, _)) = accepted else { continue };
            match timeout_at(Instant::now() + READ_TIMEOUT, self.serve(stream)).await {
                Ok(Some(Outcome::Token(token))) => return Ok(token),
                Ok(Some(Outcome::Refused(reason))) => return Err(AniListError::SignIn(reason)),
                // A favicon, a stray request or a slow connection: keep waiting.
                Ok(None) | Err(_) => {}
            }
        }
    }

    async fn serve(&self, mut stream: TcpStream) -> Option<Outcome> {
        let request = read_request(&mut stream).await?;
        let hosts = [
            format!("127.0.0.1:{}", self.port),
            format!("localhost:{}", self.port),
        ];
        // A page on another site that resolves its own name to 127.0.0.1
        // still sends its own Host header.
        if !request
            .host
            .as_ref()
            .is_some_and(|host| hosts.contains(host))
        {
            let _ = respond(&mut stream, 421, "text/plain", "Misdirected request", None).await;
            return None;
        }
        let path = request.target.split('?').next().unwrap_or_default();
        match (request.method.as_str(), path) {
            ("GET", CALLBACK_PATH) => {
                let page = callback_page(&self.nonce);
                let csp = format!(
                    "default-src 'none'; script-src 'nonce-{}'; style-src 'unsafe-inline'; \
                     connect-src 'self'; base-uri 'none'; form-action 'none'",
                    self.nonce
                );
                let _ = respond(
                    &mut stream,
                    200,
                    "text/html; charset=utf-8",
                    &page,
                    Some(&csp),
                )
                .await;
                None
            }
            ("POST", TOKEN_PATH) => {
                let same_origin = request
                    .origin
                    .as_ref()
                    .is_none_or(|origin| hosts.iter().any(|h| *origin == format!("http://{h}")));
                let outcome = if same_origin {
                    parse_callback(&request.body, &self.nonce)
                } else {
                    None
                };
                let message = match &outcome {
                    Some(Outcome::Token(_)) => {
                        "Signed in to AniList. You can close this tab and go back to KireiManga."
                    }
                    Some(Outcome::Refused(_)) => {
                        "AniList did not sign you in. Go back to KireiManga to try again."
                    }
                    None => "This sign in link has expired. Start again from KireiManga.",
                };
                let status = if outcome.is_some() { 200 } else { 400 };
                let _ = respond(
                    &mut stream,
                    status,
                    "text/plain; charset=utf-8",
                    message,
                    None,
                )
                .await;
                outcome
            }
            _ => {
                let _ = respond(&mut stream, 404, "text/plain", "Not found", None).await;
                None
            }
        }
    }
}

/// Reads the fields the callback posts: the nonce, then either the token
/// (`access_token`, `expires_in`) or AniList's refusal (`error`).
fn parse_callback(body: &str, nonce: &str) -> Option<Outcome> {
    let mut sent_nonce = None;
    let mut token = None;
    let mut expires_in = None;
    let mut error = None;
    let mut description = None;
    for (key, value) in url::form_urlencoded::parse(body.as_bytes()) {
        match key.as_ref() {
            // The first nonce counts: the page puts its own first.
            "nonce" if sent_nonce.is_none() => sent_nonce = Some(value.into_owned()),
            "access_token" => token = Some(value.into_owned()),
            "expires_in" => expires_in = value.trim().parse::<u64>().ok(),
            "error" => error = Some(value.into_owned()),
            "error_description" => description = Some(value.into_owned()),
            _ => {}
        }
    }
    if sent_nonce.as_deref() != Some(nonce) {
        return None;
    }
    if let Some(token) = token.filter(|t| !t.trim().is_empty()) {
        let lifetime = expires_in
            .filter(|secs| *secs > 0)
            .unwrap_or(DEFAULT_TOKEN_LIFETIME_SECS);
        return Some(Outcome::Token(AccessToken::new(token.trim(), lifetime)));
    }
    let reason = match (error.as_deref(), description) {
        (Some("access_denied"), _) => "the sign in was cancelled on AniList".to_owned(),
        (_, Some(description)) if !description.trim().is_empty() => description,
        (Some(error), _) => error.to_owned(),
        (None, _) => "AniList sent no token".to_owned(),
    };
    Some(Outcome::Refused(reason))
}

fn callback_page(nonce: &str) -> String {
    // The fragment is read, removed from the address bar and posted back.
    // AniList puts errors in the query, so that is read too.
    format!(
        r#"<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>KireiManga</title>
<meta name="referrer" content="no-referrer">
<style>body{{margin:0;height:100vh;display:grid;place-items:center;background:#0f0e13;color:#ece8f4;font:16px system-ui,sans-serif}}p{{max-width:32ch;text-align:center;line-height:1.5}}</style>
</head><body><p id="m">Finishing the AniList sign in.</p>
<script nonce="{nonce}">
(function () {{
  var raw = location.hash.slice(1) || location.search.slice(1);
  history.replaceState(null, '', location.pathname);
  var m = document.getElementById('m');
  if (!raw) {{ m.textContent = 'Nothing to finish here. Start the sign in from KireiManga.'; return; }}
  fetch('{TOKEN_PATH}', {{
    method: 'POST',
    headers: {{ 'Content-Type': 'application/x-www-form-urlencoded' }},
    body: 'nonce={nonce}&' + raw
  }}).then(function (r) {{ return r.text(); }})
    .then(function (t) {{ m.textContent = t; }})
    .catch(function () {{ m.textContent = 'KireiManga stopped waiting. Start the sign in again.'; }});
}})();
</script></body></html>"#
    )
}

struct HttpRequest {
    method: String,
    target: String,
    host: Option<String>,
    origin: Option<String>,
    body: String,
}

async fn read_request(stream: &mut TcpStream) -> Option<HttpRequest> {
    let mut buf = Vec::with_capacity(2048);
    let mut chunk = [0u8; 2048];
    let head_end = loop {
        if let Some(at) = find(&buf, b"\r\n\r\n") {
            break at;
        }
        if buf.len() > MAX_HEAD {
            return None;
        }
        let read = stream.read(&mut chunk).await.ok()?;
        if read == 0 {
            return None;
        }
        buf.extend_from_slice(&chunk[..read]);
    };
    let head = std::str::from_utf8(&buf[..head_end]).ok()?;
    let mut lines = head.split("\r\n");
    let mut request_line = lines.next()?.split(' ');
    let method = request_line.next()?.to_owned();
    let target = request_line.next()?.to_owned();
    let mut host = None;
    let mut origin = None;
    let mut length = 0usize;
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.trim();
        match name.trim().to_ascii_lowercase().as_str() {
            "host" => host = Some(value.to_ascii_lowercase()),
            "origin" => origin = Some(value.to_ascii_lowercase()),
            "content-length" => length = value.parse().ok()?,
            _ => {}
        }
    }
    if length > MAX_BODY {
        return None;
    }
    let mut body = buf[head_end + 4..].to_vec();
    while body.len() < length {
        let read = stream.read(&mut chunk).await.ok()?;
        if read == 0 {
            return None;
        }
        body.extend_from_slice(&chunk[..read]);
    }
    body.truncate(length);
    Some(HttpRequest {
        method,
        target,
        host,
        origin,
        body: String::from_utf8(body).ok()?,
    })
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

async fn respond(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &str,
    csp: Option<&str>,
) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        421 => "Misdirected Request",
        _ => "Error",
    };
    let csp = csp
        .map(|csp| format!("Content-Security-Policy: {csp}\r\n"))
        .unwrap_or_default();
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\n\
         Content-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\n\
         X-Content-Type-Options: nosniff\r\n{csp}Connection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(response.as_bytes()).await?;
    stream.shutdown().await
}

fn new_nonce() -> Result<String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes)
        .map_err(|error| AniListError::SignIn(format!("no randomness for the sign in: {error}")))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authorize_url_asks_for_a_token() {
        let url = authorize_url(&Endpoints::production(), " 12345 ").unwrap();
        assert_eq!(
            url.as_str(),
            "https://anilist.co/api/v2/oauth/authorize?client_id=12345&response_type=token"
        );
        assert!(authorize_url(&Endpoints::production(), "").is_err());
        assert!(authorize_url(&Endpoints::production(), "12&x=1").is_err());
    }

    #[test]
    fn the_callback_needs_the_nonce() {
        assert!(parse_callback("access_token=abc", "n1").is_none());
        assert!(parse_callback("nonce=other&access_token=abc", "n1").is_none());
        // A second nonce in the fragment does not replace the page's own.
        assert!(parse_callback("nonce=other&nonce=n1&access_token=abc", "n1").is_none());
        match parse_callback(
            "nonce=n1&access_token=abc&token_type=Bearer&expires_in=60",
            "n1",
        ) {
            Some(Outcome::Token(token)) => {
                assert_eq!(token.access_token.expose(), "abc");
                assert!(!token.is_expired());
            }
            _ => panic!("expected a token"),
        }
    }

    #[test]
    fn a_refusal_carries_a_reason() {
        match parse_callback("nonce=n1&error=access_denied", "n1") {
            Some(Outcome::Refused(reason)) => assert!(reason.contains("cancelled")),
            _ => panic!("expected a refusal"),
        }
        match parse_callback("nonce=n1", "n1") {
            Some(Outcome::Refused(reason)) => assert!(reason.contains("no token")),
            _ => panic!("expected a refusal"),
        }
    }

    #[test]
    fn a_missing_lifetime_falls_back_to_a_year() {
        match parse_callback("nonce=n1&access_token=abc&expires_in=garbage", "n1") {
            Some(Outcome::Token(token)) => {
                let days = (token.expires_at - crate::token::now_ms()) / 86_400_000;
                assert!((364..=365).contains(&days));
            }
            _ => panic!("expected a token"),
        }
    }

    #[test]
    fn nonces_differ() {
        let a = new_nonce().unwrap();
        assert_eq!(a.len(), 32);
        assert_ne!(a, new_nonce().unwrap());
    }
}
