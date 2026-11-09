//! Turns a page's archive bytes into what the webview gets: the original bytes
//! when they already fit the viewport, otherwise a decode, a downscale to the
//! viewport box and a re-encode. With sharpening on, every decodable page is
//! decoded, sharpened (after the downscale, if any) and re-encoded.
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
/// Strongest unsharp mask amount, at sharpen 100: the detail layer is added
/// one and a half times. Past that, screentone starts to shimmer.
const MAX_SHARPEN_AMOUNT: f32 = 1.5;
/// A page at least this many times taller than wide is a tall strip (a
/// webtoon panel run, a long scroll page). The reader UI uses the same ratio
/// (`TALL_RATIO` in `features/reader/model/split.ts`).
pub const TALL_RATIO: u32 = 2;

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
    /// Unsharp mask strength, 0 (off) to 100. Values above 100 act as 100.
    pub sharpen: u8,
    /// Fit tall strips (see [`is_tall`]) to the box width only, so the reader
    /// can show them in screen sized parts instead of shrinking the whole
    /// strip into one screen. Applies when both sides of the box are set.
    pub split_tall: bool,
}

/// A page ready to serve.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderedPage {
    pub bytes: Vec<u8>,
    pub mime: &'static str,
    /// Pixel size of `bytes`, when known.
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// True when `bytes` were downscaled, false when they keep the original
    /// size (the original bytes, or a sharpened copy).
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
    /// Decoded and re-encoded: downscaled, sharpened or both.
    Encoded,
    /// Already fits with nothing to sharpen, or a format the pipeline passes
    /// through.
    Original,
    /// Should have been processed but could not be decoded; served as is.
    Fallback,
}

/// True for a page at least [`TALL_RATIO`] times taller than wide.
pub fn is_tall(width: u32, height: u32) -> bool {
    width > 0 && u64::from(height) >= u64::from(TALL_RATIO) * u64::from(width)
}

/// The size a `width` x `height` page is served at under `settings`, or
/// `None` when it is served at its own size.
pub fn target_size(width: u32, height: u32, settings: &RenderSettings) -> Option<(u32, u32)> {
    if width == 0 || height == 0 {
        return None;
    }
    // A split strip is shown one screen at a time at the box width, so its
    // height is left free.
    let max_height =
        if settings.split_tall && settings.max_width.is_some() && is_tall(width, height) {
            None
        } else {
            settings.max_height
        };
    let scale_for =
        |limit: Option<u32>, size: u32| limit.map_or(1.0, |l| f64::from(l) / f64::from(size));
    let scale = scale_for(settings.max_width, width).min(scale_for(max_height, height));
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
    if !decodable(info.format) || (target.is_none() && settings.sharpen == 0) {
        return original(raw, Outcome::Original);
    }
    if cancelled() {
        return None;
    }
    let Some(image) = decode(&raw) else {
        return original(raw, Outcome::Fallback);
    };
    if cancelled() {
        return None;
    }
    let target = target.unwrap_or((image.width(), image.height()));
    let Some(page) = process(image, target, settings, revision) else {
        return original(raw, Outcome::Fallback);
    };
    Some((page, Outcome::Encoded))
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

/// Resizes `image` to `width` x `height` (a no-op at its own size), sharpens
/// it and encodes it: PNG when it has alpha, JPEG otherwise.
fn process(
    image: DynamicImage,
    (width, height): (u32, u32),
    settings: &RenderSettings,
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
    let downscaled = (width, height) != (src_width, src_height);
    let mut pixels = if downscaled {
        let src = Image::from_vec_u8(src_width, src_height, pixels, pixel_type).ok()?;
        let mut dst = Image::new(width, height, pixel_type);
        let options = ResizeOptions::new().resize_alg(settings.resample.algorithm());
        Resizer::new().resize(&src, &mut dst, &options).ok()?;
        dst.into_vec()
    } else {
        pixels
    };
    let channels = pixel_type.size();
    sharpen(
        &mut pixels,
        width as usize,
        height as usize,
        channels,
        color.has_alpha(),
        settings.sharpen,
    );

    let mut bytes = Vec::new();
    let mime = if color.has_alpha() {
        PngEncoder::new_with_quality(
            &mut bytes,
            png::CompressionType::Fast,
            png::FilterType::Adaptive,
        )
        .write_image(&pixels, width, height, layout)
        .ok()?;
        "image/png"
    } else {
        let jpeg_color = match layout {
            ExtendedColorType::L8 => JpegColor::Luma,
            _ => JpegColor::Rgb,
        };
        JpegEncoder::new(&mut bytes, JPEG_QUALITY)
            .encode(
                &pixels,
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
        downscaled,
        revision,
    })
}

/// Unsharp mask in place: `pixel + amount * (pixel - blurred)`, with a
/// separable [1 2 1] blur (close to a Gaussian of sigma 0.85, about the width
/// of a printed line after a downscale). `channels` is the interleaved channel
/// count; the last channel is left alone when `alpha` is set. `strength` is
/// the 0 to 100 setting. Edges repeat the border pixel.
fn sharpen(
    pixels: &mut [u8],
    width: usize,
    height: usize,
    channels: usize,
    alpha: bool,
    strength: u8,
) {
    if strength == 0 || width == 0 || height == 0 || pixels.len() != width * height * channels {
        return;
    }
    let amount = f32::from(strength.min(100)) / 100.0 * MAX_SHARPEN_AMOUNT;
    let color = if alpha { channels - 1 } else { channels };
    let stride = width * channels;
    // Horizontal pass into u16 (sums of 4), then vertical (sums of 16).
    let mut horizontal = vec![0u16; pixels.len()];
    for (row, out) in pixels
        .chunks_exact(stride)
        .zip(horizontal.chunks_exact_mut(stride))
    {
        for x in 0..width {
            let left = x.saturating_sub(1) * channels;
            let here = x * channels;
            let right = (x + 1).min(width - 1) * channels;
            for c in 0..color {
                out[here + c] = u16::from(row[left + c])
                    + 2 * u16::from(row[here + c])
                    + u16::from(row[right + c]);
            }
        }
    }
    for y in 0..height {
        let up = y.saturating_sub(1) * stride;
        let here = y * stride;
        let down = (y + 1).min(height - 1) * stride;
        for x in 0..width {
            for c in 0..color {
                let i = x * channels + c;
                let blurred =
                    f32::from(horizontal[up + i] + 2 * horizontal[here + i] + horizontal[down + i])
                        / 16.0;
                let original = f32::from(pixels[here + i]);
                let value = original + amount * (original - blurred);
                pixels[here + i] = value.round().clamp(0.0, 255.0) as u8;
            }
        }
    }
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
    fn split_strips_fit_the_box_width() {
        let split = RenderSettings {
            split_tall: true,
            ..boxed(1000, 1000)
        };
        // A strip fits to the width and keeps its full height.
        assert_eq!(target_size(2000, 12_000, &split), Some((1000, 6000)));
        // A narrow strip already within the width is served as stored.
        assert_eq!(target_size(800, 12_000, &split), None);
        // A normal page still fits the whole box.
        assert_eq!(target_size(1800, 2700, &split), Some((667, 1000)));
        // Without the switch, the strip shrinks into the box.
        assert_eq!(
            target_size(2000, 12_000, &boxed(1000, 1000)),
            Some((167, 1000))
        );
        // With no width to fit, the height still bounds it.
        let height_only = RenderSettings {
            max_width: None,
            ..split
        };
        assert_eq!(target_size(2000, 12_000, &height_only), Some((167, 1000)));
    }

    #[test]
    fn tall_means_twice_as_high_as_wide() {
        assert!(is_tall(800, 1600));
        assert!(is_tall(800, 20_000));
        assert!(!is_tall(800, 1599));
        assert!(!is_tall(0, 100));
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
        assert_eq!(outcome, Outcome::Encoded);
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
        assert_eq!(outcome, Outcome::Encoded);
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
    fn sharpen_leaves_flat_areas_alone() {
        let mut pixels = vec![128u8; 5 * 5];
        sharpen(&mut pixels, 5, 5, 1, false, 100);
        assert!(pixels.iter().all(|&p| p == 128));
    }

    #[test]
    fn sharpen_raises_contrast_across_an_edge() {
        // A vertical edge: columns 0 to 2 at 100, 3 to 5 at 200.
        let row = [100u8, 100, 100, 200, 200, 200];
        let mut pixels: Vec<u8> = row.iter().copied().cycle().take(6 * 3).collect();
        sharpen(&mut pixels, 6, 3, 1, false, 100);
        let middle = &pixels[6..12];
        // Blur at column 2 is (100 + 200 + 2 * 100) / 4 = 125, so the dark
        // side drops by 1.5 * 25; the bright side rises by the same.
        assert_eq!(middle, &[100, 100, 63, 238, 200, 200]);
        // Off is a no-op.
        let mut untouched: Vec<u8> = row.iter().copied().cycle().take(6 * 3).collect();
        sharpen(&mut untouched, 6, 3, 1, false, 0);
        assert_eq!(&untouched[6..12], &row);
    }

    #[test]
    fn sharpen_keeps_alpha() {
        let mut pixels = vec![
            0, 10, 0, 20, 255, 30, //
            0, 40, 0, 50, 255, 60, //
            0, 70, 0, 80, 255, 90,
        ];
        sharpen(&mut pixels, 3, 3, 2, true, 100);
        let alpha: Vec<u8> = pixels.iter().skip(1).step_by(2).copied().collect();
        assert_eq!(alpha, [10, 20, 30, 40, 50, 60, 70, 80, 90]);
    }

    #[test]
    fn sharpening_re_encodes_pages_that_fit() {
        let settings = RenderSettings {
            sharpen: 50,
            ..boxed(1000, 1000)
        };
        let (page, outcome) = render(
            gray_jpeg(300, 450),
            &info(ImageFormat::Jpeg, 300, 450),
            &settings,
            0,
            &never,
        )
        .unwrap();
        assert_eq!(outcome, Outcome::Encoded);
        assert!(!page.downscaled);
        assert_eq!((page.width, page.height), (Some(300), Some(450)));
        // GIF still passes through untouched.
        let (_, outcome) = render(
            b"GIF89a....".to_vec(),
            &info(ImageFormat::Gif, 300, 300),
            &settings,
            0,
            &never,
        )
        .unwrap();
        assert_eq!(outcome, Outcome::Original);
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
            assert_eq!(outcome, Outcome::Encoded, "{resample:?}");
            assert_eq!(page.width, Some(50));
        }
    }
}
