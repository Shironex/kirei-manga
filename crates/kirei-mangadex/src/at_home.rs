//! MangaDex@Home: the image servers chapter pages come from.
//!
//! `GET /at-home/server/{chapter}` names a server and the page files. A page
//! URL is `{baseUrl}/{data|data-saver}/{hash}/{file}`. The base URL is good
//! for at least 15 minutes; when a page fails, ask for a server again. Every
//! image load from a server outside mangadex.org is reported to the
//! MangaDex@Home network, successful or not, so it can tell healthy servers
//! from broken ones. Images are fetched without any auth header.

use bytes::Bytes;
use serde::{Deserialize, Serialize};

use crate::wire::AtHomeBody;

/// Original pages, or the smaller recompressed data-saver set.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImageQuality {
    #[default]
    Data,
    DataSaver,
}

impl ImageQuality {
    fn path(self) -> &'static str {
        match self {
            Self::Data => "data",
            Self::DataSaver => "data-saver",
        }
    }
}

/// A server assignment for one chapter.
///
/// The base URL embeds a temporary access token, so it is not serialized and
/// `Debug` leaves it out; never hand it to the webview (images must be
/// proxied through the app, MangaDex does not allow hotlinking).
#[derive(Clone, PartialEq, Eq)]
pub struct AtHomeServer {
    base_url: String,
    hash: String,
    data: Vec<String>,
    data_saver: Vec<String>,
}

impl std::fmt::Debug for AtHomeServer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AtHomeServer")
            .field("hash", &self.hash)
            .field("pages", &self.data.len())
            .field("data_saver_pages", &self.data_saver.len())
            .finish_non_exhaustive()
    }
}

impl From<AtHomeBody> for AtHomeServer {
    fn from(body: AtHomeBody) -> Self {
        Self {
            base_url: body.base_url.trim_end_matches('/').to_string(),
            hash: body.chapter.hash,
            data: body.chapter.data,
            data_saver: body.chapter.data_saver,
        }
    }
}

impl AtHomeServer {
    fn files(&self, quality: ImageQuality) -> &[String] {
        match quality {
            ImageQuality::Data => &self.data,
            ImageQuality::DataSaver => &self.data_saver,
        }
    }

    pub fn page_count(&self, quality: ImageQuality) -> usize {
        self.files(quality).len()
    }

    /// The page file names, which carry the image extension.
    pub fn file_names(&self, quality: ImageQuality) -> &[String] {
        self.files(quality)
    }

    pub(crate) fn page_url(&self, quality: ImageQuality, index: usize) -> Option<String> {
        let file = self.files(quality).get(index)?;
        Some(format!(
            "{}/{}/{}/{}",
            self.base_url,
            quality.path(),
            self.hash,
            file
        ))
    }

    /// MangaDex's own servers are not part of the MangaDex@Home network and
    /// are not reported.
    pub(crate) fn reports(&self) -> bool {
        let host = url::Url::parse(&self.base_url)
            .ok()
            .and_then(|url| url.host_str().map(str::to_ascii_lowercase));
        !host.is_some_and(|host| host == "mangadex.org" || host.ends_with(".mangadex.org"))
    }
}

/// One downloaded page.
#[derive(Debug, Clone)]
pub struct PageImage {
    pub bytes: Bytes,
    /// The server's `Content-Type`, when it sent one.
    pub content_type: Option<String>,
    /// The page's file name, with its extension.
    pub file_name: String,
}

/// The body of a MangaDex@Home report.
#[derive(Serialize)]
pub(crate) struct Report<'a> {
    pub(crate) url: &'a str,
    pub(crate) success: bool,
    pub(crate) cached: bool,
    pub(crate) bytes: usize,
    /// Milliseconds for the whole download, not the time to first byte.
    pub(crate) duration: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wire::{AtHomeBody, AtHomeChapter};

    fn server(base: &str) -> AtHomeServer {
        AtHomeBody {
            base_url: base.into(),
            chapter: AtHomeChapter {
                hash: "abc".into(),
                data: vec!["1-x.png".into()],
                data_saver: vec!["1-y.jpg".into()],
            },
        }
        .into()
    }

    #[test]
    fn builds_page_urls_for_both_qualities() {
        let server = server("https://node.example.mangadex.network:44300/token/");
        assert_eq!(
            server.page_url(ImageQuality::Data, 0).as_deref(),
            Some("https://node.example.mangadex.network:44300/token/data/abc/1-x.png")
        );
        assert_eq!(
            server.page_url(ImageQuality::DataSaver, 0).as_deref(),
            Some("https://node.example.mangadex.network:44300/token/data-saver/abc/1-y.jpg")
        );
        assert_eq!(server.page_url(ImageQuality::Data, 1), None);
    }

    #[test]
    fn only_home_network_servers_are_reported() {
        assert!(server("https://node.example.mangadex.network/t").reports());
        assert!(!server("https://uploads.mangadex.org").reports());
        assert!(!server("https://mangadex.org").reports());
    }

    #[test]
    fn debug_output_hides_the_base_url() {
        let printed = format!(
            "{:?}",
            server("https://node.example.mangadex.network/secret-token")
        );
        assert!(!printed.contains("secret-token"));
    }
}
