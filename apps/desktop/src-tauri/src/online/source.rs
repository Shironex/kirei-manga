//! A MangaDex chapter as a page source, so it reads through the same page
//! pipeline as an archive: read-ahead, the render cache, viewport-sized
//! decode and the `kirei-page` protocol.
//!
//! Pages are fetched by the MangaDex client from MangaDex@Home, which reports
//! every load as the network asks and retries on another server. Nothing is
//! hotlinked: the webview only ever sees `kirei-page` URLs.

use std::path::PathBuf;

use kirei_archive::{ArchiveError, PageSource};
use kirei_core::{ImageFormat, PageInfo, SourceKind};
use kirei_mangadex::{ImageQuality, MangaDex, MangaDexError};

pub(crate) struct OnlinePageSource {
    md: MangaDex,
    chapter_id: String,
    quality: ImageQuality,
    pages: Vec<PageInfo>,
}

/// Page list from the file names MangaDex@Home gives for a chapter. Sizes are
/// unknown until a page arrives, so layout falls back to its defaults.
fn page_infos(names: &[String]) -> Vec<PageInfo> {
    names
        .iter()
        .enumerate()
        .map(|(index, name)| PageInfo {
            index,
            name: name.clone(),
            format: name
                .rsplit_once('.')
                .and_then(|(_, ext)| ImageFormat::from_extension(ext))
                .unwrap_or(ImageFormat::Jpeg),
            width: None,
            height: None,
            byte_len: 0,
        })
        .collect()
}

impl OnlinePageSource {
    /// Asks MangaDex@Home for the chapter's server and page list (one
    /// request against the at-home budget, reused while it is valid). Data
    /// saver falls back to full quality for a chapter that has no data saver
    /// files.
    pub(crate) async fn open(
        md: &MangaDex,
        chapter_id: &str,
        data_saver: bool,
    ) -> Result<Self, MangaDexError> {
        let server = md.at_home_server(chapter_id).await?;
        let mut quality = if data_saver {
            ImageQuality::DataSaver
        } else {
            ImageQuality::Data
        };
        if server.page_count(quality) == 0 {
            quality = ImageQuality::Data;
        }
        Ok(Self {
            md: md.clone(),
            chapter_id: chapter_id.to_owned(),
            quality,
            pages: page_infos(server.file_names(quality)),
        })
    }
}

impl PageSource for OnlinePageSource {
    fn kind(&self) -> SourceKind {
        SourceKind::Online
    }

    fn pages(&self) -> &[PageInfo] {
        &self.pages
    }

    /// Blocking: called from the read-ahead workers and the protocol's
    /// blocking pool, never from an async task.
    fn read_page(&self, index: usize) -> kirei_archive::Result<Vec<u8>> {
        if index >= self.pages.len() {
            return Err(ArchiveError::PageOutOfRange {
                index,
                len: self.pages.len(),
            });
        }
        let md = self.md.clone();
        let chapter = self.chapter_id.clone();
        let quality = self.quality;
        tauri::async_runtime::block_on(async move { md.page(&chapter, index, quality).await })
            .map(|page| page.bytes.to_vec())
            .map_err(|error| ArchiveError::Io {
                path: PathBuf::from(format!("MangaDex page {}", index + 1)),
                source: std::io::Error::other(error.to_string()),
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_formats_come_from_the_file_names() {
        let pages = page_infos(&[
            "1-abc.jpg".to_owned(),
            "2-def.png".to_owned(),
            "3-noext".to_owned(),
        ]);
        assert_eq!(pages.len(), 3);
        assert_eq!(pages[1].index, 1);
        assert_eq!(pages[1].format, ImageFormat::Png);
        assert_eq!(pages[2].format, ImageFormat::Jpeg);
        assert!(pages.iter().all(|page| page.width.is_none()));
    }
}
