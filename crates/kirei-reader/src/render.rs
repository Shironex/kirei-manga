//! Turns a page's archive bytes into what the webview gets: the original bytes
//! when they already fit the viewport, otherwise a decode, a downscale to the
//! viewport box and a re-encode.
//!
//! What is cached is this output, not decoded pixels. A decoded 1800x2700 page
//! is 4.9 MB in grayscale and 19 MB in RGBA, and the webview needs encoded
//! bytes anyway, so caching pixels would cost several times the memory and
//! still need an encode on every request. Caching the output makes a hit a
//! memcpy, and a downscaled page is usually a quarter of the original's bytes.

use std::io::Cursor;

use fast_image_resize::{FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer, images::Image};
use image::codecs::png::{self, PngEncoder};
use image::{DynamicImage, ExtendedColorType, ImageEncoder, ImageReader, Limits};
use jpeg_encoder::{ColorType as JpegColor, Encoder as JpegEncoder};
use kirei_core::{ImageFormat, PageInfo};

/// Downscale only when the page is this much larger than the box (the scale
/// factor is below this). Smaller gains are not worth a re-encode.
const DOWNSCALE_BELOW: f64 = 0.9;
/// JPEG quality for downscaled opaque pages. High enough that screentone and
/// line art show no blocking at reading distance.
const JPEG_QUALITY: u8 = 90;
/// Ceiling for one decode. A 16k x 16k RGBA page is 1 GiB; anything past this
/// is served as is and left to the webview rather than risking the app.
const MAX_DECODE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_DIMENSION: u32 = 20_000;

/// Resampling filter for the downscale.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum Resample {
    /// Sharpest, the default for line art and text.
    #[default]
    Lanczos3,
    /// Softer, less ringing around hard edges.
    Mitchell,
    /// No filtering. Fastest, keeps pixel art crisp.
    Nearest,
}

impl Resample {
    fn algorithm(self) -> ResizeAlg {
        match self {
            Self::Lanczos3 => ResizeAlg::Convolution(FilterType::Lanczos3),
            Self::Mitchell => ResizeAlg::Convolution(FilterType::Mitchell),
            Self::Nearest => ResizeAlg::Nearest,
        }
    }
}

/// How pages are rendered for the webview. Every change bumps the reader's
/// render revision and drops pages rendered under the old settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub struct RenderSettings {
    /// Largest width a page is shown at, in device pixels. `None` is no limit.
    pub max_width: Option<u32>,
    /// Largest height a page is shown at, in device pixels. `None` is no limit
    /// (for example a webtoon strip fitted to width).
    pub max_height: Option<u32>,
    pub resample: Resample,
}

/// A page ready to serve.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderedPage {
    pub bytes: Vec<u8>,
    pub mime: &'static str,
    /// Pixel size of `bytes`, when known.
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// True when `bytes` were downscaled, false when they are the original.
    pub downscaled: bool,
    /// Render revision the page was produced under.
    pub revision: u64,
}

impl RenderedPage {
    pub fn len(&self) -> usize {
        self.bytes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.bytes.is_empty()
    }
}

/// Why a render served the original bytes or stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Outcome {
    /// Downscaled.
    Downscaled,
    /// Already fits, or a format the pipeline passes through.
    Original,
    /// Should have been downscaled but could not be decoded; served as is.
    Fallback,
}

/// The size a `width` x `height` page is served at under `settings`, or
/// `None` when it is served at its own size.
pub fn target_size(width: u32, height: u32, settings: &RenderSettings) -> Option<(u32, u32)> {
    if width == 0 || height == 0 {
        return None;
    }
    let scale_for =
        |limit: Option<u32>, size: u32| limit.map_or(1.0, |l| f64::from(l) / f64::from(size));
    let scale = scale_for(settings.max_width, width).min(scale_for(settings.max_height, height));
    if scale >= DOWNSCALE_BELOW {
        return None;
    }
    let scaled = |size: u32| ((f64::from(size) * scale).round() as u32).max(1);
    Some((scaled(width), scaled(height)))
}

/// The size a page is shown at, from its header size, without decoding.
pub fn served_size(info: &PageInfo, settings: &RenderSettings) -> Option<(u32, u32)> {
    let (width, height) = (info.width?, info.height?);
    if !decodable(info.format) {
        return Some((width, height));
    }
    Some(target_size(width, height, settings).unwrap_or((width, height)))
}

/// Formats the pipeline decodes. GIF passes through so animations survive;
/// AVIF and JPEG XL pass through to the webview's own decoder.
fn decodable(format: ImageFormat) -> bool {
    matches!(
        format,
        ImageFormat::Jpeg | ImageFormat::Png | ImageFormat::Webp | ImageFormat::Bmp
    )
}

/// Renders one page. `cancelled` is polled between the expensive steps; when
/// it returns true the work stops and `None` comes back.
pub(crate) fn render(
    raw: Vec<u8>,
    info: &PageInfo,
    settings: &RenderSettings,
    revision: u64,
    cancelled: &dyn Fn() -> bool,
) -> Option<(RenderedPage, Outcome)> {
    let size = info.width.zip(info.height).or_else(|| {
        imagesize::blob_size(&raw)
            .ok()
            .map(|s| (s.width as u32, s.height as u32))
    });
    let original = |raw: Vec<u8>, outcome| {
        let page = RenderedPage {
            bytes: raw,
            mime: info.format.mime(),
            width: size.map(|s| s.0),
            height: size.map(|s| s.1),
            downscaled: false,
            revision,
        };
        Some((page, outcome))
    };
    let target = size.and_then(|(w, h)| target_size(w, h, settings));
    let Some(target) = target.filter(|_| decodable(info.format)) else {
        return original(raw, Outcome::Original);
    };
    if cancelled() {
        return None;
    }
    let Some(image) = decode(&raw) else {
        return original(raw, Outcome::Fallback);
    };
    if cancelled() {
        return None;
    }
    let Some(page) = downscale(image, target, settings.resample, revision) else {
        return original(raw, Outcome::Fallback);
    };
    Some((page, Outcome::Downscaled))
}

fn decode(raw: &[u8]) -> Option<DynamicImage> {
    let mut reader = ImageReader::new(Cursor::new(raw))
        .with_guessed_format()
        .ok()?;
    let mut limits = Limits::default();
    limits.max_alloc = Some(MAX_DECODE_BYTES);
    limits.max_image_width = Some(MAX_DIMENSION);
    limits.max_image_height = Some(MAX_DIMENSION);
    reader.limits(limits);
    reader.decode().ok()
}

fn downscale(
    image: DynamicImage,
    (width, height): (u32, u32),
    resample: Resample,
    revision: u64,
) -> Option<RenderedPage> {
    let (src_width, src_height) = (image.width(), image.height());
    let color = image.color();
    let (pixel_type, layout, pixels) = match (color.has_color(), color.has_alpha()) {
        (false, false) => (
            PixelType::U8,
            ExtendedColorType::L8,
            image.into_luma8().into_raw(),
        ),
        (false, true) => (
            PixelType::U8x2,
            ExtendedColorType::La8,
            image.into_luma_alpha8().into_raw(),
        ),
        (true, false) => (
            PixelType::U8x3,
            ExtendedColorType::Rgb8,
            image.into_rgb8().into_raw(),
        ),
        (true, true) => (
            PixelType::U8x4,
            ExtendedColorType::Rgba8,
            image.into_rgba8().into_raw(),
        ),
    };
    let src = Image::from_vec_u8(src_width, src_height, pixels, pixel_type).ok()?;
    let mut dst = Image::new(width, height, pixel_type);
    let options = ResizeOptions::new().resize_alg(resample.algorithm());
    Resizer::new().resize(&src, &mut dst, &options).ok()?;
    drop(src);

    let mut bytes = Vec::new();
    let mime = if color.has_alpha() {
        PngEncoder::new_with_quality(
            &mut bytes,
            png::CompressionType::Fast,
            png::FilterType::Adaptive,
        )
        .write_image(dst.buffer(), width, height, layout)
        .ok()?;
        "image/png"
    } else {
        let jpeg_color = match layout {
            ExtendedColorType::L8 => JpegColor::Luma,
            _ => JpegColor::Rgb,
        };
        JpegEncoder::new(&mut bytes, JPEG_QUALITY)
            .encode(
                dst.buffer(),
                u16::try_from(width).ok()?,
                u16::try_from(height).ok()?,
                jpeg_color,
            )
            .ok()?;
        "image/jpeg"
    };
    Some(RenderedPage {
        bytes,
        mime,
        width: Some(width),
        height: Some(height),
        downscaled: true,
        revision,
    })
}

#[cfg(test)]
mod tests {
    use image::{GrayImage, ImageFormat as Codec, RgbaImage};

    use super::*;

    fn info(format: ImageFormat, width: u32, height: u32) -> PageInfo {
        PageInfo {
            index: 0,
            name: "p".into(),
            format,
            width: Some(width),
            height: Some(height),
            byte_len: 0,
        }
    }

    fn boxed(width: u32, height: u32) -> RenderSettings {
        RenderSettings {
            max_width: Some(width),
            max_height: Some(height),
            ..RenderSettings::default()
        }
    }

    fn encode(image: DynamicImage, codec: Codec) -> Vec<u8> {
        let mut out = Cursor::new(Vec::new());
        image.write_to(&mut out, codec).unwrap();
        out.into_inner()
    }

    fn gray_jpeg(width: u32, height: u32) -> Vec<u8> {
        let image = GrayImage::from_fn(width, height, |x, y| image::Luma([((x ^ y) & 0xff) as u8]));
        encode(DynamicImage::ImageLuma8(image), Codec::Jpeg)
    }

    fn never() -> bool {
        false
    }

    #[test]
    fn target_size_fits_the_box_and_keeps_the_aspect() {
        assert_eq!(
            target_size(1800, 2700, &boxed(1000, 1000)),
            Some((667, 1000))
        );
        assert_eq!(
            target_size(2700, 1800, &boxed(1000, 1000)),
            Some((1000, 667))
        );
        let width_only = RenderSettings {
            max_width: Some(900),
            ..RenderSettings::default()
        };
        assert_eq!(target_size(1800, 20_000, &width_only), Some((900, 10_000)));
    }

    #[test]
    fn small_or_unbounded_pages_keep_their_size() {
        assert_eq!(target_size(800, 1200, &boxed(1000, 1500)), None);
        // Within 10 percent of the box is not worth a re-encode.
        assert_eq!(target_size(1050, 1575, &boxed(1000, 1500)), None);
        assert_eq!(target_size(5000, 5000, &RenderSettings::default()), None);
        assert_eq!(target_size(0, 10, &boxed(1, 1)), None);
    }

    #[test]
    fn served_size_reports_the_render_without_decoding() {
        let settings = boxed(600, 900);
        assert_eq!(
            served_size(&info(ImageFormat::Jpeg, 1200, 1800), &settings),
            Some((600, 900))
        );
        // GIF passes through, so it is served at its own size.
        assert_eq!(
            served_size(&info(ImageFormat::Gif, 1200, 1800), &settings),
            Some((1200, 1800))
        );
        let unknown = PageInfo {
            width: None,
            ..info(ImageFormat::Jpeg, 1, 1)
        };
        assert_eq!(served_size(&unknown, &settings), None);
    }

    #[test]
    fn downscales_a_grayscale_jpeg_to_the_box() {
        let raw = gray_jpeg(1200, 1800);
        let (page, outcome) = render(
            raw,
            &info(ImageFormat::Jpeg, 1200, 1800),
            &boxed(400, 600),
            3,
            &never,
        )
        .unwrap();
        assert_eq!(outcome, Outcome::Downscaled);
        assert_eq!(page.mime, "image/jpeg");
        assert_eq!((page.width, page.height), (Some(400), Some(600)));
        assert_eq!(page.revision, 3);
        let decoded = image::load_from_memory(&page.bytes).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (400, 600));
        // Grayscale stays one channel, which keeps the JPEG small.
        assert!(!decoded.color().has_color());
    }

    #[test]
    fn transparent_pages_stay_png() {
        let image = RgbaImage::from_fn(300, 300, |x, _| image::Rgba([255, 0, 0, (x % 256) as u8]));
        let raw = encode(DynamicImage::ImageRgba8(image), Codec::Png);
        let (page, outcome) = render(
            raw,
            &info(ImageFormat::Png, 300, 300),
            &boxed(100, 100),
            0,
            &never,
        )
        .unwrap();
        assert_eq!(outcome, Outcome::Downscaled);
        assert_eq!(page.mime, "image/png");
        let decoded = image::load_from_memory(&page.bytes).unwrap();
        assert!(decoded.color().has_alpha());
        assert_eq!(decoded.width(), 100);
    }

    #[test]
    fn pages_that_fit_are_served_untouched() {
        let raw = gray_jpeg(300, 450);
        let (page, outcome) = render(
            raw.clone(),
            &info(ImageFormat::Jpeg, 300, 450),
            &boxed(1000, 1000),
            0,
            &never,
        )
        .unwrap();
        assert_eq!(outcome, Outcome::Original);
        assert_eq!(page.bytes, raw);
        assert!(!page.downscaled);
    }

    #[test]
    fn missing_header_sizes_are_read_from_the_bytes() {
        let raw = gray_jpeg(800, 800);
        let unknown = PageInfo {
            width: None,
            height: None,
            ..info(ImageFormat::Jpeg, 0, 0)
        };
        let (page, _) = render(raw, &unknown, &boxed(200, 200), 0, &never).unwrap();
        assert_eq!(page.width, Some(200));
    }

    #[test]
    fn undecodable_bytes_fall_back_to_the_original() {
        let raw = b"not a jpeg at all".to_vec();
        let (page, outcome) = render(
            raw.clone(),
            &info(ImageFormat::Jpeg, 4000, 6000),
            &boxed(100, 100),
            0,
            &never,
        )
        .unwrap();
        assert_eq!(outcome, Outcome::Fallback);
        assert_eq!(page.bytes, raw);
    }

    #[test]
    fn gif_passes_through_to_keep_animation() {
        let raw = b"GIF89a....".to_vec();
        let (_, outcome) = render(
            raw,
            &info(ImageFormat::Gif, 4000, 4000),
            &boxed(10, 10),
            0,
            &never,
        )
        .unwrap();
        assert_eq!(outcome, Outcome::Original);
    }

    #[test]
    fn cancelled_renders_stop_before_decoding() {
        let raw = gray_jpeg(1200, 1800);
        let result = render(
            raw,
            &info(ImageFormat::Jpeg, 1200, 1800),
            &boxed(10, 10),
            0,
            &|| true,
        );
        assert!(result.is_none());
    }

    #[test]
    fn every_filter_downscales() {
        for resample in [Resample::Lanczos3, Resample::Mitchell, Resample::Nearest] {
            let settings = RenderSettings {
                resample,
                ..boxed(50, 50)
            };
            let (page, outcome) = render(
                gray_jpeg(200, 200),
                &info(ImageFormat::Jpeg, 200, 200),
                &settings,
                0,
                &never,
            )
            .unwrap();
            assert_eq!(outcome, Outcome::Downscaled, "{resample:?}");
            assert_eq!(page.width, Some(50));
        }
    }
}
