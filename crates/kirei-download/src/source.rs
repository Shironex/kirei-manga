//! What the downloader needs from MangaDex.
//!
//! The app hands in its one shared [`MangaDex`] client, so downloads count
//! against the same rate limits as browsing, and the client's page fetch
//! already reports to MangaDex@Home and fails over to a new server. The trait
//! exists so tests can swap in a source with no network at all (for example
//! to check the page budget on a paused clock).

use std::future::Future;

use kirei_mangadex::{Chapter, ImageQuality, Manga, MangaDex, MangaDexError, PageImage};

/// The MangaDex calls a download makes.
pub trait ChapterSource: Clone + Send + Sync + 'static {
    /// One chapter with its groups and uploader.
    fn chapter(&self, id: &str) -> impl Future<Output = Result<Chapter, MangaDexError>> + Send;

    /// The chapter's series, for titles and ComicInfo.
    fn manga(&self, id: &str) -> impl Future<Output = Result<Manga, MangaDexError>> + Send;

    /// How many pages the image server lists for the chapter.
    fn page_count(
        &self,
        chapter_id: &str,
        quality: ImageQuality,
    ) -> impl Future<Output = Result<usize, MangaDexError>> + Send;

    /// One page (zero based).
    fn page(
        &self,
        chapter_id: &str,
        index: usize,
        quality: ImageQuality,
    ) -> impl Future<Output = Result<PageImage, MangaDexError>> + Send;

    /// The reader's language chain, which picks the series title.
    fn languages(&self) -> Vec<String>;
}

impl ChapterSource for MangaDex {
    async fn chapter(&self, id: &str) -> Result<Chapter, MangaDexError> {
        MangaDex::chapter(self, id).await
    }

    async fn manga(&self, id: &str) -> Result<Manga, MangaDexError> {
        MangaDex::manga(self, id).await
    }

    async fn page_count(
        &self,
        chapter_id: &str,
        quality: ImageQuality,
    ) -> Result<usize, MangaDexError> {
        Ok(self.at_home_server(chapter_id).await?.page_count(quality))
    }

    async fn page(
        &self,
        chapter_id: &str,
        index: usize,
        quality: ImageQuality,
    ) -> Result<PageImage, MangaDexError> {
        MangaDex::page(self, chapter_id, index, quality).await
    }

    fn languages(&self) -> Vec<String> {
        MangaDex::languages(self).chain().to_vec()
    }
}
