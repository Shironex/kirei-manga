//! The `kirei-cover` URI scheme: serves cover thumbnails to the webview.
//!
//! URLs look like `kirei-cover://localhost/<cover hash>` on macOS and
//! `http://kirei-cover.localhost/<cover hash>` on Windows;
//! `convertFileSrc(hash, 'kirei-cover')` builds the right one. The hash is the
//! only input and must be a cover hash (64 lowercase hex digits), so a request
//! can never name a path: the file is looked up inside the cover cache by the
//! library. Thumbnails are keyed by the content hash of their source, so a
//! URL always names the same bytes and the webview may cache it for good.

use std::path::Path;

use kirei_library::Library;
use tauri::http::{Response, StatusCode, header};

use crate::protocol::{fallback, matches_etag, status};

pub(crate) const SCHEME: &str = "kirei-cover";

/// Same hash, same bytes: no revalidation needed.
const CACHE_CONTROL: &str = "public, max-age=31536000, immutable";

/// Answers one request; `library` is `None` when the database could not be
/// opened. Pure apart from reading the file, so it is tested without a
/// webview.
pub(crate) fn respond(
    library: Option<&Library>,
    path: &str,
    if_none_match: Option<&str>,
) -> Response<Vec<u8>> {
    let hash = path.trim_matches('/');
    let Some(library) = library else {
        return status(StatusCode::SERVICE_UNAVAILABLE, "library unavailable");
    };
    let Some(file) = library.cover_path(hash) else {
        return status(StatusCode::BAD_REQUEST, "expected /<cover hash>");
    };
    let tag = format!("\"{hash}\"");
    if if_none_match.is_some_and(|tags| matches_etag(tags, &tag)) {
        return Response::builder()
            .status(StatusCode::NOT_MODIFIED)
            .header(header::ETAG, tag)
            .header(header::CACHE_CONTROL, CACHE_CONTROL)
            .body(Vec::new())
            .unwrap_or_else(|_| fallback());
    }
    match read(&file) {
        Some(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "image/jpeg")
            .header(header::ETAG, tag)
            .header(header::CACHE_CONTROL, CACHE_CONTROL)
            .body(bytes)
            .unwrap_or_else(|_| fallback()),
        None => status(StatusCode::NOT_FOUND, "no such cover"),
    }
}

fn read(file: &Path) -> Option<Vec<u8>> {
    std::fs::read(file).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    const HASH: &str = "ab00000000000000000000000000000000000000000000000000000000000001";

    fn library_with_cover() -> (tempfile::TempDir, Library) {
        let dir = tempfile::tempdir().unwrap();
        let library = Library::open_in_memory(dir.path()).unwrap();
        let file = library.cover_path(HASH).unwrap();
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, [0xff, 0xd8, 0xff, 0xd9]).unwrap();
        (dir, library)
    }

    fn get(library: &Library, path: &str, tag: Option<&str>) -> Response<Vec<u8>> {
        respond(Some(library), path, tag)
    }

    #[test]
    fn serves_a_cover_by_hash_with_immutable_caching() {
        let (_dir, library) = library_with_cover();
        let response = get(&library, &format!("/{HASH}"), None);
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_TYPE], "image/jpeg");
        assert_eq!(response.headers()[header::ETAG], format!("\"{HASH}\""));
        assert_eq!(response.headers()[header::CACHE_CONTROL], CACHE_CONTROL);
        assert_eq!(response.body(), &[0xff, 0xd8, 0xff, 0xd9]);
    }

    #[test]
    fn revalidation_gets_not_modified() {
        let (_dir, library) = library_with_cover();
        let response = get(&library, HASH, Some(&format!("W/\"{HASH}\"")));
        assert_eq!(response.status(), StatusCode::NOT_MODIFIED);
        assert!(response.body().is_empty());
    }

    #[test]
    fn paths_and_malformed_hashes_are_refused() {
        let (_dir, library) = library_with_cover();
        for path in [
            "/../library.sqlite3",
            "/ab/ab000.jpg",
            "/%2E%2E%2Fetc%2Fpasswd",
            &format!("/{}", HASH.to_uppercase()),
            &format!("/{HASH}/x"),
            "/",
        ] {
            assert_eq!(
                get(&library, path, None).status(),
                StatusCode::BAD_REQUEST,
                "{path}"
            );
        }
    }

    #[test]
    fn a_missing_thumbnail_is_not_found() {
        let (_dir, library) = library_with_cover();
        let other = HASH.replace("ab", "cd");
        assert_eq!(
            get(&library, &format!("/{other}"), None).status(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn an_unavailable_library_says_so() {
        assert_eq!(
            respond(None, &format!("/{HASH}"), None).status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
    }
}
