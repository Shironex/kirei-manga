use std::path::PathBuf;
use std::time::Instant;

use kirei_core::{AppInfo, PageInfo, SourceKind};
use kirei_reader::{Direction, LatencySummary, ReaderStats, Resample, served_size};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use crate::library::Library;

/// Identity of the running build. Async so it never runs on the main thread,
/// which keeps the convention every later command follows.
#[tauri::command]
pub(crate) async fn app_info() -> AppInfo {
    AppInfo::current(env!("CARGO_PKG_VERSION"))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenedSource {
    id: u64,
    kind: SourceKind,
    pages: Vec<PageInfo>,
    /// Wall time of the open, including the header probe, in milliseconds.
    open_ms: f64,
}

/// Opens a CBZ/ZIP, CBR/RAR or image folder picked by the user.
#[tauri::command]
pub(crate) async fn open_source<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<OpenedSource, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let library = app.state::<Library>();
        let start = Instant::now();
        let (id, source) = library
            .open(&PathBuf::from(path))
            .map_err(|error| error.to_string())?;
        Ok(OpenedSource {
            id,
            kind: source.kind(),
            pages: source.pages().to_vec(),
            open_ms: start.elapsed().as_secs_f64() * 1000.0,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ReadDirection {
    Forward,
    Backward,
}

/// Tells the reader which page is on screen so it reads the next ones ahead.
#[tauri::command]
pub(crate) async fn focus_page<R: Runtime>(
    app: AppHandle<R>,
    id: u64,
    index: usize,
    direction: ReadDirection,
) -> Result<(), String> {
    let direction = match direction {
        ReadDirection::Forward => Direction::Forward,
        ReadDirection::Backward => Direction::Backward,
    };
    if app.state::<Library>().focus(id, index, direction) {
        Ok(())
    } else {
        Err(format!("unknown source {id}"))
    }
}

#[tauri::command]
pub(crate) async fn close_source<R: Runtime>(app: AppHandle<R>, id: u64) {
    app.state::<Library>().close(id);
}

/// Largest viewport side accepted, in device pixels. Far above any display,
/// low enough that a bad hint cannot ask for gigapixel renders.
const MAX_VIEWPORT_SIDE: u32 = 16_384;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ViewportState {
    /// Render revision now in effect. Append it to page URLs (`?r=`) so the
    /// webview fetches pages again after it changes.
    revision: u64,
}

/// Sets the box pages are rendered into, in device pixels (CSS pixels times
/// `devicePixelRatio`). `null` leaves that side unbounded: a webtoon strip
/// fitted to width passes only `maxWidth`. Pages larger than the box are
/// downscaled before they reach the webview. Setting the same box again is
/// free and keeps the revision.
#[tauri::command]
pub(crate) async fn set_viewport<R: Runtime>(
    app: AppHandle<R>,
    max_width: Option<u32>,
    max_height: Option<u32>,
) -> Result<ViewportState, String> {
    for side in [max_width, max_height].into_iter().flatten() {
        if side == 0 || side > MAX_VIEWPORT_SIDE {
            return Err(format!(
                "viewport side {side} is outside 1..={MAX_VIEWPORT_SIDE}"
            ));
        }
    }
    // Changing settings re-queues the read-ahead; keep it off the main thread.
    tauri::async_runtime::spawn_blocking(move || {
        let revision = app.state::<Library>().set_viewport(max_width, max_height);
        ViewportState { revision }
    })
    .await
    .map_err(|error| error.to_string())
}

/// Resampling filter, as the webview names it.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ResampleFilter {
    Lanczos3,
    Mitchell,
    Nearest,
}

impl From<ResampleFilter> for Resample {
    fn from(filter: ResampleFilter) -> Self {
        match filter {
            ResampleFilter::Lanczos3 => Self::Lanczos3,
            ResampleFilter::Mitchell => Self::Mitchell,
            ResampleFilter::Nearest => Self::Nearest,
        }
    }
}

/// Sets how pages are resampled and sharpened in the pipeline (`sharpen` is 0
/// to 100, 0 is off). Tone and colour adjustments stay in the webview as CSS
/// filters. Returns the render revision, like `set_viewport`; the same values
/// again keep it.
#[tauri::command]
pub(crate) async fn set_render_quality<R: Runtime>(
    app: AppHandle<R>,
    resample: ResampleFilter,
    sharpen: u8,
) -> Result<ViewportState, String> {
    if sharpen > 100 {
        return Err(format!("sharpen {sharpen} is outside 0..=100"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let revision = app
            .state::<Library>()
            .set_render_quality(resample.into(), sharpen);
        ViewportState { revision }
    })
    .await
    .map_err(|error| error.to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageMeta {
    #[serde(flatten)]
    info: PageInfo,
    /// Size the page is served at under the current viewport, from the image
    /// header (no decode). `None` when the header gave no size.
    served_width: Option<u32>,
    served_height: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SourcePages {
    revision: u64,
    pages: Vec<PageMeta>,
}

/// Every page of a source with its stored and served size, for layout (fit,
/// spreads, webtoon placeholders) before any page has loaded.
#[tauri::command]
pub(crate) async fn page_meta<R: Runtime>(
    app: AppHandle<R>,
    id: u64,
) -> Result<SourcePages, String> {
    let library = app.state::<Library>();
    let source = library
        .source(id)
        .ok_or_else(|| format!("unknown source {id}"))?;
    let (settings, revision) = library.reader().render_settings();
    let pages = source
        .pages()
        .iter()
        .map(|info| {
            let served = served_size(info, &settings);
            PageMeta {
                info: info.clone(),
                served_width: served.map(|s| s.0),
                served_height: served.map(|s| s.1),
            }
        })
        .collect();
    Ok(SourcePages { revision, pages })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Latency {
    count: u64,
    p50_us: u64,
    p95_us: u64,
    max_us: u64,
}

impl From<LatencySummary> for Latency {
    fn from(summary: LatencySummary) -> Self {
        Self {
            count: summary.count,
            p50_us: summary.p50_us,
            p95_us: summary.p95_us,
            max_us: summary.max_us,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CacheStats {
    hits: u64,
    misses: u64,
    joined: u64,
    prefetched: u64,
    dropped_stale: u64,
    cancelled: u64,
    errors: u64,
    downscaled: u64,
    original: u64,
    decode_fallbacks: u64,
    /// Page request latency on the Rust side, hit or miss.
    serve: Latency,
    /// Archive read to rendered page.
    render: Latency,
    cached_pages: usize,
    cached_bytes: usize,
    budget_bytes: usize,
    revision: u64,
}

/// Cache, read-ahead and latency counters, for the test page and later the
/// debug panel.
#[tauri::command]
pub(crate) async fn reader_stats<R: Runtime>(app: AppHandle<R>) -> CacheStats {
    let library = app.state::<Library>();
    let reader = library.reader();
    let ReaderStats {
        hits,
        misses,
        joined,
        prefetched,
        dropped_stale,
        cancelled,
        errors,
        downscaled,
        original,
        decode_fallbacks,
        serve,
        render,
    } = reader.stats();
    CacheStats {
        hits,
        misses,
        joined,
        prefetched,
        dropped_stale,
        cancelled,
        errors,
        downscaled,
        original,
        decode_fallbacks,
        serve: serve.into(),
        render: render.into(),
        cached_pages: reader.cache().len(),
        cached_bytes: reader.cache().bytes_used(),
        budget_bytes: reader.cache().budget(),
        revision: reader.render_settings().1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_the_crate_version() {
        let info = tauri::async_runtime::block_on(app_info());
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn directions_deserialize_from_camel_case() {
        let forward: ReadDirection = serde_json::from_str("\"forward\"").unwrap();
        assert!(matches!(forward, ReadDirection::Forward));
        let backward: ReadDirection = serde_json::from_str("\"backward\"").unwrap();
        assert!(matches!(backward, ReadDirection::Backward));
    }

    #[test]
    fn filters_deserialize_from_the_settings_names() {
        for (name, expected) in [
            ("lanczos3", Resample::Lanczos3),
            ("mitchell", Resample::Mitchell),
            ("nearest", Resample::Nearest),
        ] {
            let filter: ResampleFilter = serde_json::from_str(&format!("\"{name}\"")).unwrap();
            assert_eq!(Resample::from(filter), expected);
        }
        assert!(serde_json::from_str::<ResampleFilter>("\"bicubic\"").is_err());
    }

    #[test]
    fn page_meta_flattens_the_page_info() {
        let meta = PageMeta {
            info: PageInfo {
                index: 2,
                name: "a/3.jpg".into(),
                format: kirei_core::ImageFormat::Jpeg,
                width: Some(1800),
                height: Some(2700),
                byte_len: 10,
            },
            served_width: Some(1067),
            served_height: Some(1600),
        };
        let json = serde_json::to_value(&meta).unwrap();
        assert_eq!(json["index"], 2);
        assert_eq!(json["width"], 1800);
        assert_eq!(json["servedWidth"], 1067);
        assert_eq!(json["servedHeight"], 1600);
        assert_eq!(json["byteLen"], 10);
    }
}
