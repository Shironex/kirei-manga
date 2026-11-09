//! The `kirei-online` URI scheme: MangaDex cover art for the webview.
//!
//! URLs look like `kirei-online://localhost/cover/<manga id>/<file>/<size>`
//! (`http://kirei-online.localhost/...` on Windows); `convertFileSrc` builds
//! them and percent-encodes the slashes, which are decoded here. The image is
//! downloaded by the MangaDex client (its own rate limit for covers, no auth
//! header) and handed over as bytes: MangaDex does not allow hotlinking, so
//! no MangaDex URL reaches the webview. Cover files never change under a
//! name, so the webview may keep them.

use kirei_mangadex::{Cover, CoverSize, MangaDexError};
use tauri::http::{Response, StatusCode, header};

use crate::protocol::{fallback, status};

use super::Online;

pub(crate) const SCHEME: &str = "kirei-online";

const CACHE_CONTROL: &str = "public, max-age=31536000, immutable";

/// A cover request taken apart: manga id, file name and size.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct CoverRequest {
    pub(crate) manga_id: String,
    pub(crate) file_name: String,
    pub(crate) size: CoverSize,
}

impl CoverRequest {
    pub(crate) fn cache_key(&self) -> String {
        format!("{}/{}/{:?}", self.manga_id, self.file_name, self.size)
    }
}

fn is_uuid(text: &str) -> bool {
    text.len() == 36
        && text.bytes().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => byte == b'-',
            _ => byte.is_ascii_hexdigit(),
        })
}

/// A cover file name: a UUID-ish stem and an image extension, nothing that
/// could leave the cover folder.
fn is_file_name(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 128
        && !text.starts_with('.')
        && text.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'.' || byte == b'_'
        })
}

/// `/cover/<id>/<file>/<256|512|full>`, plain or percent-encoded.
pub(crate) fn parse_path(path: &str) -> Option<CoverRequest> {
    let decoded = path.replace("%2F", "/").replace("%2f", "/");
    let mut parts = decoded.trim_matches('/').split('/');
    if parts.next()? != "cover" {
        return None;
    }
    let manga_id = parts.next()?;
    let file_name = parts.next()?;
    let size = match parts.next()? {
        "256" => CoverSize::Small256,
        "512" => CoverSize::Medium512,
        "full" => CoverSize::Original,
        _ => return None,
    };
    if parts.next().is_some() || !is_uuid(manga_id) || !is_file_name(file_name) {
        return None;
    }
    Some(CoverRequest {
        manga_id: manga_id.to_owned(),
        file_name: file_name.to_owned(),
        size,
    })
}

fn image(bytes: Vec<u8>, content_type: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, CACHE_CONTROL)
        .body(bytes)
        .unwrap_or_else(|_| fallback())
}

/// Answers one request, from memory when the cover was fetched before.
pub(crate) async fn respond(online: &Online, path: &str) -> Response<Vec<u8>> {
    let Some(request) = parse_path(path) else {
        return status(
            StatusCode::BAD_REQUEST,
            "expected /cover/<id>/<file>/<size>",
        );
    };
    let key = request.cache_key();
    if let Some(bytes) = online.cached_cover(&key) {
        return image(bytes, "image/jpeg");
    }
    let cover = Cover {
        id: String::new(),
        file_name: request.file_name.clone(),
        volume: None,
        locale: None,
    };
    let result = online
        .client()
        .cover(&request.manga_id, &cover, request.size)
        .await;
    match online.track(result) {
        Ok(bytes) => {
            let bytes = bytes.to_vec();
            online.cache_cover(key, bytes.clone());
            image(bytes, "image/jpeg")
        }
        Err(MangaDexError::NotFound(_)) => status(StatusCode::NOT_FOUND, "no such cover"),
        Err(error) => status(StatusCode::BAD_GATEWAY, &error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "0b1f2c3d-0000-4000-8000-000000000001";

    #[test]
    fn parses_plain_and_encoded_paths() {
        let plain = parse_path(&format!("/cover/{ID}/abc-1.jpg/256")).unwrap();
        assert_eq!(plain.manga_id, ID);
        assert_eq!(plain.file_name, "abc-1.jpg");
        assert_eq!(plain.size, CoverSize::Small256);
        let encoded = parse_path(&format!("cover%2F{ID}%2Fabc.png%2F512")).unwrap();
        assert_eq!(encoded.size, CoverSize::Medium512);
    }

    #[test]
    fn refuses_anything_that_is_not_a_cover() {
        for path in [
            "/cover".to_owned(),
            format!("/page/{ID}/a.jpg/256"),
            format!("/cover/{ID}/../secrets/256"),
            format!("/cover/{ID}/a.jpg/1024"),
            format!("/cover/{ID}/a.jpg/256/extra"),
            "/cover/not-a-uuid/a.jpg/256".to_owned(),
            format!("/cover/{ID}/.hidden/256"),
            format!("/cover/{ID}/a%20b.jpg/256"),
        ] {
            assert_eq!(parse_path(&path), None, "{path}");
        }
    }
}
