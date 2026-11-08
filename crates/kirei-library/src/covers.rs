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

use crate::model::CoverCacheUsage;
use crate::palette::{self, Palette};
use crate::{LibraryError, Result};

/// Thumbnails are cropped to the card's 2:3 portrait shape and sized to fill
/// it. The largest place a cover is drawn is the series page hero, 250 CSS px
/// wide at its widest, so 500 x 750 keeps it sharp on a 2x screen.
pub const THUMB_WIDTH: u32 = 500;
pub const THUMB_HEIGHT: u32 = 750;
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

    /// True for a BLAKE3 hex digest as [`Self::hash`] writes it.
    pub(crate) fn is_hash(value: &str) -> bool {
        value.len() == 64
            && value
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
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

        // Crop first, so the resize spends every output pixel on what the
        // card shows, then fill the card. A crop smaller than the card is
        // kept as it is: upscaling here would only add blur the webview
        // adds anyway.
        let (x, y, width, height) = card_crop(decoded.width(), decoded.height());
        let cropped = decoded.crop_imm(x, y, width, height);
        let thumb = if width > THUMB_WIDTH {
            cropped.resize_exact(THUMB_WIDTH, THUMB_HEIGHT, FilterType::CatmullRom)
        } else {
            cropped
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

/// The 2:3 window of a `width` x `height` image the card shows, as
/// `(x, y, width, height)`. Too wide: the middle columns. Too tall: the top
/// rows, where a webtoon strip or a long page keeps its title.
pub(crate) fn card_crop(width: u32, height: u32) -> (u32, u32, u32, u32) {
    let (w, h) = (u64::from(width), u64::from(height));
    let (card_w, card_h) = (u64::from(THUMB_WIDTH), u64::from(THUMB_HEIGHT));
    if w * card_h > h * card_w {
        let crop = u32::try_from((h * card_w / card_h).max(1)).unwrap_or(width);
        ((width - crop) / 2, 0, crop, height)
    } else {
        let crop = u32::try_from((w * card_h / card_w).max(1)).unwrap_or(height);
        (0, 0, width, crop.min(height))
    }
}

impl CoverCache {
    /// Bytes and files the thumbnails take on disk.
    pub(crate) fn usage(&self) -> Result<CoverCacheUsage> {
        let mut usage = CoverCacheUsage::default();
        self.for_each_file(|_, meta| {
            usage.bytes += meta.len();
            usage.files += 1;
            Ok(())
        })?;
        Ok(usage)
    }

    /// Deletes every thumbnail and returns what was freed. Rows in `covers`
    /// stay: the next scan sees the files are gone and makes them again.
    /// Only the cache's own `<hh>/` folders are touched.
    pub(crate) fn clear(&self) -> Result<CoverCacheUsage> {
        let mut freed = CoverCacheUsage::default();
        self.for_each_file(|path, meta| {
            std::fs::remove_file(path).map_err(|source| LibraryError::io(path, source))?;
            freed.bytes += meta.len();
            freed.files += 1;
            Ok(())
        })?;
        for shard in self.shards()? {
            // Best effort: a folder something else wrote into stays.
            let _ = std::fs::remove_dir(shard);
        }
        Ok(freed)
    }

    /// The two-hex-digit shard folders the thumbnails live in.
    fn shards(&self) -> Result<Vec<PathBuf>> {
        let entries =
            std::fs::read_dir(&self.dir).map_err(|source| LibraryError::io(&self.dir, source))?;
        Ok(entries
            .filter_map(std::result::Result::ok)
            .filter(|entry| {
                let name = entry.file_name();
                let name = name.to_string_lossy();
                name.len() == 2
                    && name.bytes().all(|b| b.is_ascii_hexdigit())
                    && entry.file_type().is_ok_and(|t| t.is_dir())
            })
            .map(|entry| entry.path())
            .collect())
    }

    fn for_each_file(
        &self,
        mut visit: impl FnMut(&Path, &std::fs::Metadata) -> Result<()>,
    ) -> Result<()> {
        for shard in self.shards()? {
            let entries =
                std::fs::read_dir(&shard).map_err(|source| LibraryError::io(&shard, source))?;
            for entry in entries.filter_map(std::result::Result::ok) {
                let Ok(meta) = entry.metadata() else { continue };
                if meta.is_file() {
                    visit(&entry.path(), &meta)?;
                }
            }
        }
        Ok(())
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
        assert_eq!((cover.width, cover.height), (THUMB_WIDTH, THUMB_HEIGHT));
        let path = cache.absolute(&cover.file);
        assert!(path.starts_with(cache.dir()));
        let written = std::fs::read(&path).unwrap();
        assert_eq!(&written[..2], &[0xff, 0xd8], "a JPEG");
        assert!(!cover.palette.fallback);
    }

    fn make(width: u32, height: u32) -> NewCover {
        let dir = tempfile::tempdir().unwrap();
        let cache = CoverCache::new(dir.path()).unwrap();
        let bytes = png(width, height, [90, 140, 200]);
        cache.make(&CoverCache::hash(&bytes), &bytes).unwrap()
    }

    #[test]
    fn covers_fill_the_card_at_twice_the_hero_size() {
        // A scan page (Pepper&Carrot), a little wider than 2:3.
        let page = make(2481, 3503);
        assert_eq!((page.width, page.height), (500, 750));
        // A webtoon strip, much taller than 2:3.
        let strip = make(800, 12_000);
        assert_eq!((strip.width, strip.height), (500, 750));
        // A wide page with no portrait page to replace it: the middle 2:3
        // of it, at its own resolution rather than stretched.
        let wide = make(2481, 660);
        assert_eq!((wide.width, wide.height), (440, 660));
    }

    #[test]
    fn the_crop_keeps_the_middle_columns_or_the_top_rows() {
        assert_eq!(card_crop(2481, 3503), (73, 0, 2335, 3503));
        assert_eq!(card_crop(2481, 660), (1020, 0, 440, 660));
        assert_eq!(card_crop(800, 12_000), (0, 0, 800, 1200));
        assert_eq!(card_crop(1200, 1800), (0, 0, 1200, 1800));
        assert_eq!(card_crop(1, 1), (0, 0, 1, 1));
    }

    #[test]
    fn only_hex_digests_are_hashes() {
        assert!(CoverCache::is_hash(&CoverCache::hash(b"cover")));
        assert!(!CoverCache::is_hash(""));
        assert!(!CoverCache::is_hash(&"A".repeat(64)));
        assert!(!CoverCache::is_hash(&format!("../{}", "a".repeat(61))));
        assert!(!CoverCache::is_hash(&"a".repeat(65)));
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

    #[test]
    fn usage_and_clear_cover_the_thumbnails_only() {
        let dir = tempfile::tempdir().unwrap();
        let cache = CoverCache::new(dir.path()).unwrap();
        for rgb in [[200, 30, 30], [30, 200, 30]] {
            let bytes = png(40, 60, rgb);
            cache.make(&CoverCache::hash(&bytes), &bytes).unwrap();
        }
        std::fs::write(dir.path().join("keep.txt"), b"not a cover").unwrap();

        let usage = cache.usage().unwrap();
        assert_eq!(usage.files, 2);
        assert!(usage.bytes > 0);

        assert_eq!(cache.clear().unwrap(), usage);
        assert_eq!(cache.usage().unwrap(), CoverCacheUsage::default());
        assert!(dir.path().join("keep.txt").exists());
    }
}
