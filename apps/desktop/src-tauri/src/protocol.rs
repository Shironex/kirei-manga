//! The `kirei-page` URI scheme: serves page bytes to the webview.
//!
//! URLs look like `kirei-page://localhost/<source id>/<page index>` on macOS
//! and `http://kirei-page.localhost/<source id>/<page index>` on Windows;
//! `convertFileSrc(`${id}/${index}`, 'kirei-page')` builds the right one and
//! percent-encodes the slash, which is decoded here.
//!
//! The path is the only input: the query string is ignored, so the frontend
//! can append `?r=<render revision>` to make the webview fetch a page again
//! after the viewport changed. Every response carries an `ETag` of source,
//! page and render revision, and `Cache-Control: no-cache`, so a webview that
//! revalidates gets a `304` without the page being rendered again.

use tauri::http::{Response, StatusCode, header};

use crate::library::Library;

pub(crate) const SCHEME: &str = "kirei-page";

/// Answers one request from its path and `If-None-Match` header. Pure, so it
/// is tested without a webview.
pub(crate) fn respond(
    library: &Library,
    path: &str,
    if_none_match: Option<&str>,
) -> Response<Vec<u8>> {
    let Some((id, index)) = parse_path(path) else {
        return status(
            StatusCode::BAD_REQUEST,
            "expected /<source id>/<page index>",
        );
    };
    let Some(source) = library.source(id) else {
        return status(StatusCode::NOT_FOUND, "unknown source");
    };
    if index >= source.len() {
        return status(StatusCode::NOT_FOUND, "page out of range");
    }
    // Ids are never reused within a run and every render setting change bumps
    // the revision, so the tag names exactly one rendering of the page.
    let current = etag(id, index, library.reader().render_settings().1);
    if if_none_match.is_some_and(|tags| matches_etag(tags, &current)) {
        return Response::builder()
            .status(StatusCode::NOT_MODIFIED)
            .header(header::ETAG, current)
            .header(header::CACHE_CONTROL, CACHE_CONTROL)
            .body(Vec::new())
            .unwrap_or_else(|_| fallback());
    }
    match library.page(id, index) {
        Some(Ok(page)) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, page.mime)
            .header(header::ETAG, etag(id, index, page.revision))
            .header(header::CACHE_CONTROL, CACHE_CONTROL)
            .body(page.bytes.clone())
            .unwrap_or_else(|_| fallback()),
        Some(Err(error)) => status(StatusCode::UNPROCESSABLE_ENTITY, &error.to_string()),
        None => status(StatusCode::NOT_FOUND, "unknown source"),
    }
}

/// The webview may keep a page but asks again before reusing it, because the
/// same URL serves a new rendering after the viewport changes.
const CACHE_CONTROL: &str = "private, no-cache";

fn etag(id: u64, index: usize, revision: u64) -> String {
    format!("\"{id}-{index}-r{revision}\"")
}

/// True when an `If-None-Match` value lists `etag` (or is `*`).
fn matches_etag(header: &str, etag: &str) -> bool {
    header
        .split(',')
        .map(|tag| tag.trim().trim_start_matches("W/"))
        .any(|tag| tag == "*" || tag == etag)
}

fn status(code: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(code)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(message.as_bytes().to_vec())
        .unwrap_or_else(|_| fallback())
}

fn fallback() -> Response<Vec<u8>> {
    let mut response = Response::new(Vec::new());
    *response.status_mut() = StatusCode::INTERNAL_SERVER_ERROR;
    response
}

/// `/12/34`, `/12%2F34` or `12/34` to `(12, 34)`.
fn parse_path(path: &str) -> Option<(u64, usize)> {
    let decoded = path.replace("%2F", "/").replace("%2f", "/");
    let mut parts = decoded.trim_matches('/').split('/');
    let id = parts.next()?.parse().ok()?;
    let index = parts.next()?.parse().ok()?;
    parts.next().is_none().then_some((id, index))
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use kirei_reader::ReadAheadConfig;
    use zip::write::SimpleFileOptions;

    use super::*;

    fn library_with_cbz() -> (tempfile::TempDir, Library, u64) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("c.cbz");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        for (name, body) in [("2.png", b"two".as_slice()), ("1.jpg", b"one".as_slice())] {
            zip.start_file(name, SimpleFileOptions::default()).unwrap();
            zip.write_all(body).unwrap();
        }
        zip.finish().unwrap();
        let library = Library::with_cache(1024 * 1024, ReadAheadConfig::default());
        let (id, _) = library.open(&path).unwrap();
        (dir, library, id)
    }

    #[test]
    fn parses_plain_and_encoded_paths() {
        assert_eq!(parse_path("/3/7"), Some((3, 7)));
        assert_eq!(parse_path("/3%2F7"), Some((3, 7)));
        assert_eq!(parse_path("3/7/"), Some((3, 7)));
        assert_eq!(parse_path("/3"), None);
        assert_eq!(parse_path("/3/7/9"), None);
        assert_eq!(parse_path("/../etc/passwd"), None);
        assert_eq!(parse_path("/-1/0"), None);
    }

    #[test]
    fn serves_pages_with_their_mime_type() {
        let (_dir, library, id) = library_with_cbz();
        let first = respond(&library, &format!("/{id}%2F0"), None);
        assert_eq!(first.status(), StatusCode::OK);
        assert_eq!(first.headers()[header::CONTENT_TYPE], "image/jpeg");
        assert_eq!(first.body(), b"one");
        let second = respond(&library, &format!("/{id}/1"), None);
        assert_eq!(second.headers()[header::CONTENT_TYPE], "image/png");
        assert_eq!(second.body(), b"two");
    }

    #[test]
    fn unknown_sources_and_pages_are_not_found() {
        let (_dir, library, id) = library_with_cbz();
        assert_eq!(
            respond(&library, "/999/0", None).status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            respond(&library, &format!("/{id}/2"), None).status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            respond(&library, "/nope", None).status(),
            StatusCode::BAD_REQUEST
        );
        library.close(id);
        assert_eq!(
            respond(&library, &format!("/{id}/0"), None).status(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn tags_pages_and_answers_revalidation_with_not_modified() {
        let (_dir, library, id) = library_with_cbz();
        let path = format!("/{id}/0");
        let first = respond(&library, &path, None);
        let tag = first.headers()[header::ETAG].to_str().unwrap().to_owned();
        assert_eq!(tag, format!("\"{id}-0-r0\""));
        assert_eq!(first.headers()[header::CACHE_CONTROL], CACHE_CONTROL);

        let again = respond(&library, &path, Some(&tag));
        assert_eq!(again.status(), StatusCode::NOT_MODIFIED);
        assert!(again.body().is_empty());
        let listed = respond(&library, &path, Some(&format!("\"x\", W/{tag}")));
        assert_eq!(listed.status(), StatusCode::NOT_MODIFIED);

        // A new viewport is a new revision, so the old tag no longer matches.
        library.set_viewport(Some(10), Some(10));
        let after = respond(&library, &path, Some(&tag));
        assert_eq!(after.status(), StatusCode::OK);
        assert_eq!(after.headers()[header::ETAG], format!("\"{id}-0-r1\""));
    }

    #[test]
    fn the_query_string_is_not_part_of_the_page() {
        assert_eq!(parse_path("/3/7"), Some((3, 7)));
        // The scheme handler passes `uri().path()`, which already drops the
        // query; an encoded `?` never reaches a page lookup either.
        assert_eq!(parse_path("/3/7%3Fr=2"), None);
    }
}
