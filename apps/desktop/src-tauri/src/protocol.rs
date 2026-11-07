//! The `kirei-page` URI scheme: serves page bytes to the webview.
//!
//! URLs look like `kirei-page://localhost/<source id>/<page index>` on macOS
//! and `http://kirei-page.localhost/<source id>/<page index>` on Windows;
//! `convertFileSrc(`${id}/${index}`, 'kirei-page')` builds the right one and
//! percent-encodes the slash, which is decoded here.

use tauri::http::{Response, StatusCode, header};

use crate::library::Library;

pub(crate) const SCHEME: &str = "kirei-page";

/// Answers one request path. Pure, so it is tested without a webview.
pub(crate) fn respond(library: &Library, path: &str) -> Response<Vec<u8>> {
    let Some((id, index)) = parse_path(path) else {
        return status(
            StatusCode::BAD_REQUEST,
            "expected /<source id>/<page index>",
        );
    };
    let Some(source) = library.source(id) else {
        return status(StatusCode::NOT_FOUND, "unknown source");
    };
    let Some(page) = source.pages().get(index) else {
        return status(StatusCode::NOT_FOUND, "page out of range");
    };
    let mime = page.format.mime();
    match library.page(id, index) {
        Some(Ok(bytes)) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, mime)
            // Ids are never reused within a run, so a page URL always means
            // the same bytes and the webview may keep it.
            .header(header::CACHE_CONTROL, "private, max-age=3600, immutable")
            .body(bytes.to_vec())
            .unwrap_or_else(|_| fallback()),
        Some(Err(error)) => status(StatusCode::UNPROCESSABLE_ENTITY, &error.to_string()),
        None => status(StatusCode::NOT_FOUND, "unknown source"),
    }
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
        let first = respond(&library, &format!("/{id}%2F0"));
        assert_eq!(first.status(), StatusCode::OK);
        assert_eq!(first.headers()[header::CONTENT_TYPE], "image/jpeg");
        assert_eq!(first.body(), b"one");
        let second = respond(&library, &format!("/{id}/1"));
        assert_eq!(second.headers()[header::CONTENT_TYPE], "image/png");
        assert_eq!(second.body(), b"two");
    }

    #[test]
    fn unknown_sources_and_pages_are_not_found() {
        let (_dir, library, id) = library_with_cbz();
        assert_eq!(respond(&library, "/999/0").status(), StatusCode::NOT_FOUND);
        assert_eq!(
            respond(&library, &format!("/{id}/2")).status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(respond(&library, "/nope").status(), StatusCode::BAD_REQUEST);
        library.close(id);
        assert_eq!(
            respond(&library, &format!("/{id}/0")).status(),
            StatusCode::NOT_FOUND
        );
    }
}
