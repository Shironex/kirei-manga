use serde::{Deserialize, Serialize};

/// Where a chapter's pages come from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceKind {
    /// A ZIP container, including `.cbz`.
    Zip,
    /// A RAR container, including `.cbr`.
    Rar,
    /// A plain directory of image files.
    Folder,
}

/// Image container formats a page can be stored in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImageFormat {
    Jpeg,
    Png,
    Webp,
    Gif,
    Bmp,
    Avif,
    Jxl,
}

impl ImageFormat {
    /// Maps a file extension (without the dot, any case) to a format.
    pub fn from_extension(ext: &str) -> Option<Self> {
        let format = match ext.to_ascii_lowercase().as_str() {
            "jpg" | "jpeg" | "jfif" => Self::Jpeg,
            "png" => Self::Png,
            "webp" => Self::Webp,
            "gif" => Self::Gif,
            "bmp" => Self::Bmp,
            "avif" => Self::Avif,
            "jxl" => Self::Jxl,
            _ => return None,
        };
        Some(format)
    }

    /// The MIME type a webview needs to render the bytes.
    pub fn mime(self) -> &'static str {
        match self {
            Self::Jpeg => "image/jpeg",
            Self::Png => "image/png",
            Self::Webp => "image/webp",
            Self::Gif => "image/gif",
            Self::Bmp => "image/bmp",
            Self::Avif => "image/avif",
            Self::Jxl => "image/jxl",
        }
    }
}

/// One page of a chapter, as listed from its source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    /// Position in reading order, starting at 0.
    pub index: usize,
    /// Entry name inside the source (a path relative to the archive root).
    pub name: String,
    pub format: ImageFormat,
    /// Pixel size read from the image header, `None` when the header could not
    /// be parsed without decoding.
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// Uncompressed size in bytes.
    pub byte_len: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extension_lookup_ignores_case() {
        assert_eq!(ImageFormat::from_extension("JPG"), Some(ImageFormat::Jpeg));
        assert_eq!(ImageFormat::from_extension("WebP"), Some(ImageFormat::Webp));
        assert_eq!(ImageFormat::from_extension("txt"), None);
    }

    #[test]
    fn every_format_has_an_image_mime() {
        for format in [
            ImageFormat::Jpeg,
            ImageFormat::Png,
            ImageFormat::Webp,
            ImageFormat::Gif,
            ImageFormat::Bmp,
            ImageFormat::Avif,
            ImageFormat::Jxl,
        ] {
            assert!(format.mime().starts_with("image/"));
        }
    }
}
