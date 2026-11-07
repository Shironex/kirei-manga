//! On-disk cover thumbnails, keyed by the content hash of the source image.
//!
//! The same cover in two archives (a re-release, a duplicate folder) is
//! decoded and stored once. Files live under `<cache dir>/<hh>/<hash>.jpg`
//! and are written through a temporary file and a rename, so a crash never
//! leaves a half written thumbnail behind. The cache only ever writes inside
//! its own directory; the user's archives are opened read-only.

use std::io::Cursor;
use std::path::{Path, PathBuf};

use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{ImageReader, Limits};

use crate::palette::{self, Palette};
use crate::{LibraryError, Result};

/// Thumbnails fit inside this box, keeping the aspect ratio. Covers in the
/// library grid draw at up to about 200 CSS px wide, so 400 covers 2x screens.
pub const THUMB_MAX_WIDTH: u32 = 400;
pub const THUMB_MAX_HEIGHT: u32 = 600;
const JPEG_QUALITY: u8 = 85;
/// Ceilings for decoding a cover, against decompression bombs.
const MAX_DIMENSION: u32 = 20_000;
const MAX_DECODE_BYTES: u64 = 512 * 1024 * 1024;

/// A thumbnail that was just written.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct NewCover {
    pub(crate) hash: String,
    /// Relative to the cache directory, with `/` separators.
    pub(crate) file: String,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) palette: Palette,
}

#[derive(Debug, Clone)]
pub(crate) struct CoverCache {
    dir: PathBuf,
}

impl CoverCache {
    pub(crate) fn new(dir: impl Into<PathBuf>) -> Result<Self> {
        let dir = dir.into();
        std::fs::create_dir_all(&dir).map_err(|source| LibraryError::io(&dir, source))?;
        Ok(Self { dir })
    }

    pub(crate) fn dir(&self) -> &Path {
        &self.dir
    }

    /// Absolute path of a stored thumbnail.
    pub(crate) fn absolute(&self, file: &str) -> PathBuf {
        file.split('/')
            .fold(self.dir.clone(), |path, part| path.join(part))
    }

    pub(crate) fn hash(bytes: &[u8]) -> String {
        blake3::hash(bytes).to_hex().to_string()
    }

    pub(crate) fn relative_file(hash: &str) -> String {
        format!("{}/{hash}.jpg", &hash[..2])
    }

    /// Decodes `bytes`, writes the thumbnail and samples the palette.
    /// Returns a message rather than an error: a cover that will not decode
    /// is a property of the user's file, not a failure of the scan.
    pub(crate) fn make(&self, hash: &str, bytes: &[u8]) -> std::result::Result<NewCover, String> {
        let mut reader = ImageReader::new(Cursor::new(bytes))
            .with_guessed_format()
            .map_err(|e| e.to_string())?;
        let mut limits = Limits::default();
        limits.max_image_width = Some(MAX_DIMENSION);
        limits.max_image_height = Some(MAX_DIMENSION);
        limits.max_alloc = Some(MAX_DECODE_BYTES);
        reader.limits(limits);
        let decoded = reader.decode().map_err(|e| e.to_string())?;

        let thumb = if decoded.width() > THUMB_MAX_WIDTH || decoded.height() > THUMB_MAX_HEIGHT {
            decoded.resize(THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT, FilterType::Triangle)
        } else {
            decoded
        };
        let rgb = thumb.to_rgb8();
        let palette = palette::sample(&rgb);

        let mut encoded = Vec::new();
        JpegEncoder::new_with_quality(&mut encoded, JPEG_QUALITY)
            .encode_image(&rgb)
            .map_err(|e| e.to_string())?;

        let file = Self::relative_file(hash);
        let path = self.absolute(&file);
        write_atomically(&path, &encoded).map_err(|e| e.to_string())?;
        Ok(NewCover {
            hash: hash.to_owned(),
            file,
            width: rgb.width(),
            height: rgb.height(),
            palette,
        })
    }
}

fn write_atomically(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // A per-thread suffix: two workers can produce the same hash at once.
    let tmp = path
        .with_extension(format!("{:?}.tmp", std::thread::current().id()).replace(['(', ')'], ""));
    std::fs::write(&tmp, bytes)?;
    match std::fs::rename(&tmp, path) {
        Ok(()) => Ok(()),
        // Another worker won the race with identical content: keep theirs.
        Err(_) if path.exists() => std::fs::remove_file(&tmp),
        Err(error) => {
            let _ = std::fs::remove_file(&tmp);
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(width: u32, height: u32, rgb: [u8; 3]) -> Vec<u8> {
        let image = image::RgbImage::from_pixel(width, height, image::Rgb(rgb));
        let mut out = Vec::new();
        image
            .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
            .unwrap();
        out
    }

    #[test]
    fn writes_a_bounded_jpeg_keyed_by_hash() {
        let dir = tempfile::tempdir().unwrap();
        let cache = CoverCache::new(dir.path().join("covers")).unwrap();
        let bytes = png(1200, 1800, [200, 60, 40]);
        let hash = CoverCache::hash(&bytes);
        let cover = cache.make(&hash, &bytes).unwrap();
        assert_eq!((cover.width, cover.height), (400, 600));
        let path = cache.absolute(&cover.file);
        assert!(path.starts_with(cache.dir()));
        let written = std::fs::read(&path).unwrap();
        assert_eq!(&written[..2], &[0xff, 0xd8], "a JPEG");
        assert!(!cover.palette.fallback);
    }

    #[test]
    fn small_covers_are_not_upscaled() {
        let dir = tempfile::tempdir().unwrap();
        let cache = CoverCache::new(dir.path()).unwrap();
        let bytes = png(100, 150, [40, 120, 200]);
        let cover = cache.make(&CoverCache::hash(&bytes), &bytes).unwrap();
        assert_eq!((cover.width, cover.height), (100, 150));
    }

    #[test]
    fn garbage_reports_instead_of_panicking() {
        let dir = tempfile::tempdir().unwrap();
        let cache = CoverCache::new(dir.path()).unwrap();
        assert!(cache.make("ab", b"not an image").is_err());
    }
}
