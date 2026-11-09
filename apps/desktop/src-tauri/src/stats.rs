//! Reading stats commands: the stats for a year, clearing them, cover bytes
//! for drawing the year in review card, and saving that card as a PNG. See
//! `docs/stats.md`.
//!
//! Everything stays on the machine: the stats come from the library
//! database, and the card is written only to the path the user picked in the
//! save dialog.

use std::path::{Path, PathBuf};

use kirei_library::{Library, ReadingClock, ReadingStats};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, Runtime};

use crate::catalog::{Catalog, with_library};

/// Header that carries the target path of `stats_save_card`, percent-encoded
/// (`encodeURIComponent`), since the body is the PNG itself.
pub(crate) const PATH_HEADER: &str = "x-kirei-path";

const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

/// Stats for `year` in the reader's time zone (`utc_offset_min`, minutes
/// east of UTC), with all-time totals and streaks.
#[tauri::command]
pub(crate) async fn stats_get<R: Runtime>(
    app: AppHandle<R>,
    year: i64,
    utc_offset_min: i32,
) -> Result<ReadingStats, String> {
    with_library(&app, move |library| {
        library.reading_stats(year, ReadingClock::now(utc_offset_min))
    })
    .await
}

/// How many reading sessions `stats_clear` would delete, for the confirm
/// step. Deletes nothing.
#[tauri::command]
pub(crate) async fn stats_count<R: Runtime>(app: AppHandle<R>) -> Result<usize, String> {
    with_library(&app, Library::count_reading_sessions).await
}

/// Deletes every reading session (the stats start over). Progress, series
/// settings and the library stay. Returns how many were deleted.
#[tauri::command]
pub(crate) async fn stats_clear<R: Runtime>(app: AppHandle<R>) -> Result<usize, String> {
    with_library(&app, Library::clear_reading_sessions).await
}

/// The JPEG bytes of a cover thumbnail. The card draws covers from these
/// rather than from `kirei-cover` URLs, which are another origin and would
/// taint the canvas and block the export.
#[tauri::command]
pub(crate) async fn stats_cover<R: Runtime>(
    app: AppHandle<R>,
    hash: String,
) -> Result<Response, String> {
    let library = app.state::<Catalog>().library()?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = library
            .cover_path(&hash)
            .ok_or_else(|| "not a cover hash".to_owned())?;
        std::fs::read(&path)
            .map(Response::new)
            .map_err(|error| format!("cannot read the cover: {error}"))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Writes the year in review card. The body is the PNG the renderer drew;
/// the target path, from the save dialog, is in [`PATH_HEADER`]. Returns the
/// path written, with `.png` added when the picker dropped it.
#[tauri::command]
pub(crate) async fn stats_save_card(request: Request<'_>) -> Result<PathBuf, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected the PNG bytes as the request body".to_owned());
    };
    let encoded = request
        .headers()
        .get(PATH_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| format!("missing the {PATH_HEADER} header"))?;
    let path = PathBuf::from(percent_decode(encoded)?);
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || save_png(&path, &bytes))
        .await
        .map_err(|error| error.to_string())?
}

/// Writes `bytes` to `path` (with a `.png` extension) through a temporary
/// file, so a failed write leaves nothing half written. Only a PNG is
/// accepted: this command writes the card, nothing else.
fn save_png(path: &Path, bytes: &[u8]) -> Result<PathBuf, String> {
    if !bytes.starts_with(PNG_SIGNATURE) {
        return Err("the card is not a PNG image".to_owned());
    }
    if !path.is_absolute() {
        return Err("expected an absolute path from the save dialog".to_owned());
    }
    let is_png = path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("png"));
    let target = if is_png {
        path.to_path_buf()
    } else {
        let mut name = path.as_os_str().to_owned();
        name.push(".png");
        PathBuf::from(name)
    };
    let mut partial = target.as_os_str().to_owned();
    partial.push(".partial");
    let partial = PathBuf::from(partial);
    let written = std::fs::write(&partial, bytes).and_then(|()| std::fs::rename(&partial, &target));
    if let Err(error) = written {
        let _ = std::fs::remove_file(&partial);
        return Err(format!("cannot save {}: {error}", target.display()));
    }
    Ok(target)
}

/// Undoes `encodeURIComponent`. Refuses malformed escapes and non UTF-8.
fn percent_decode(text: &str) -> Result<String, String> {
    let bad = || format!("{PATH_HEADER} is not a percent-encoded path");
    let mut out = Vec::with_capacity(text.len());
    let mut bytes = text.bytes();
    while let Some(byte) = bytes.next() {
        if byte == b'%' {
            let hex = [bytes.next().ok_or_else(bad)?, bytes.next().ok_or_else(bad)?];
            let hex = std::str::from_utf8(&hex).map_err(|_| bad())?;
            out.push(u8::from_str_radix(hex, 16).map_err(|_| bad())?);
        } else {
            out.push(byte);
        }
    }
    String::from_utf8(out).map_err(|_| bad())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png() -> Vec<u8> {
        let mut bytes = PNG_SIGNATURE.to_vec();
        bytes.extend_from_slice(b"rest of the image");
        bytes
    }

    #[test]
    fn percent_decoding_undoes_encode_uri_component() {
        assert_eq!(
            percent_decode("%2FUsers%2Fme%2FKirei%20card.png").unwrap(),
            "/Users/me/Kirei card.png"
        );
        assert_eq!(
            percent_decode("C%3A%5CUsers%5Cme%5Cr%C3%B3%C5%BCa.png").unwrap(),
            r"C:\Users\me\róża.png"
        );
        assert!(percent_decode("%2").is_err());
        assert!(percent_decode("%zz").is_err());
        assert!(percent_decode("%ff").is_err());
    }

    #[test]
    fn the_card_is_written_with_a_png_extension() {
        let dir = tempfile::tempdir().unwrap();
        let written = save_png(&dir.path().join("year"), &png()).unwrap();
        assert_eq!(written, dir.path().join("year.png"));
        assert_eq!(std::fs::read(&written).unwrap(), png());
        let kept = save_png(&dir.path().join("card.PNG"), &png()).unwrap();
        assert_eq!(kept, dir.path().join("card.PNG"));
        assert!(!dir.path().join("card.PNG.partial").exists());
    }

    #[test]
    fn only_a_png_at_an_absolute_path_is_written() {
        let dir = tempfile::tempdir().unwrap();
        assert!(save_png(&dir.path().join("x.png"), b"#!/bin/sh").is_err());
        assert!(!dir.path().join("x.png").exists());
        assert!(save_png(Path::new("relative.png"), &png()).is_err());
    }

    #[test]
    fn a_failed_write_leaves_nothing_behind() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("missing").join("card.png");
        assert!(save_png(&target, &png()).is_err());
        assert!(!dir.path().join("missing").exists());
    }
}
