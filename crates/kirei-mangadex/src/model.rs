//! The client's own types: what callers get back, already resolved from
//! MangaDex's JSON:API shaped responses. All of them serialize to camelCase
//! so the desktop shell can hand them to the UI as they are.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// Text in several languages, keyed by MangaDex language code (`en`, `pl`,
/// `ja-ro`, ...).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct LocalizedText(pub BTreeMap<String, String>);

impl LocalizedText {
    pub fn get(&self, language: &str) -> Option<&str> {
        self.0.get(language).map(String::as_str)
    }

    pub fn is_empty(&self) -> bool {
        self.0.values().all(|text| text.trim().is_empty())
    }

    /// The best text for a reader whose languages are `chain`, in order:
    /// each language of the chain, then English, then a romanized title
    /// (`ja-ro`, `ko-ro`, ...), then whatever exists. Returns the language
    /// used with the text.
    pub fn best<'a>(&'a self, chain: &[String]) -> Option<(&'a str, &'a str)> {
        let usable = |(language, text): (&'a String, &'a String)| {
            (!text.trim().is_empty()).then_some((language.as_str(), text.as_str()))
        };
        chain
            .iter()
            .map(String::as_str)
            .chain(std::iter::once("en"))
            .find_map(|wanted| self.0.get_key_value(wanted).and_then(usable))
            .or_else(|| {
                self.0
                    .iter()
                    .filter(|(language, _)| language.ends_with("-ro"))
                    .find_map(usable)
            })
            .or_else(|| self.0.iter().find_map(usable))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ContentRating {
    Safe,
    Suggestive,
    Erotica,
    Pornographic,
}

impl ContentRating {
    pub fn as_api(self) -> &'static str {
        match self {
            Self::Safe => "safe",
            Self::Suggestive => "suggestive",
            Self::Erotica => "erotica",
            Self::Pornographic => "pornographic",
        }
    }

    /// Unknown values map to the strictest rating, so a new rating MangaDex
    /// adds is hidden by the filters rather than shown by accident.
    pub(crate) fn from_api(value: &str) -> Self {
        match value {
            "safe" => Self::Safe,
            "suggestive" => Self::Suggestive,
            "erotica" => Self::Erotica,
            _ => Self::Pornographic,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PublicationStatus {
    Ongoing,
    Completed,
    Hiatus,
    Cancelled,
}

impl PublicationStatus {
    pub fn as_api(self) -> &'static str {
        match self {
            Self::Ongoing => "ongoing",
            Self::Completed => "completed",
            Self::Hiatus => "hiatus",
            Self::Cancelled => "cancelled",
        }
    }

    pub(crate) fn from_api(value: &str) -> Option<Self> {
        Some(match value {
            "ongoing" => Self::Ongoing,
            "completed" => Self::Completed,
            "hiatus" => Self::Hiatus,
            "cancelled" => Self::Cancelled,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Demographic {
    Shounen,
    Shoujo,
    Josei,
    Seinen,
    /// Search filter for series with no demographic set.
    None,
}

impl Demographic {
    pub fn as_api(self) -> &'static str {
        match self {
            Self::Shounen => "shounen",
            Self::Shoujo => "shoujo",
            Self::Josei => "josei",
            Self::Seinen => "seinen",
            Self::None => "none",
        }
    }

    pub(crate) fn from_api(value: &str) -> Option<Self> {
        Some(match value {
            "shounen" => Self::Shounen,
            "shoujo" => Self::Shoujo,
            "josei" => Self::Josei,
            "seinen" => Self::Seinen,
            _ => return None,
        })
    }
}

/// A user's reading status for a series on MangaDex.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReadingStatus {
    Reading,
    OnHold,
    PlanToRead,
    Dropped,
    ReReading,
    Completed,
}

impl ReadingStatus {
    pub fn as_api(self) -> &'static str {
        match self {
            Self::Reading => "reading",
            Self::OnHold => "on_hold",
            Self::PlanToRead => "plan_to_read",
            Self::Dropped => "dropped",
            Self::ReReading => "re_reading",
            Self::Completed => "completed",
        }
    }

    pub(crate) fn from_api(value: &str) -> Option<Self> {
        Some(match value {
            "reading" => Self::Reading,
            "on_hold" => Self::OnHold,
            "plan_to_read" => Self::PlanToRead,
            "dropped" => Self::Dropped,
            "re_reading" => Self::ReReading,
            "completed" => Self::Completed,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: LocalizedText,
    /// `genre`, `theme`, `format` or `content`.
    pub group: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Person {
    pub id: String,
    pub name: String,
}

/// A cover image. Build its URL with [`crate::MangaDex::cover_url`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cover {
    pub id: String,
    pub file_name: String,
    pub volume: Option<String>,
    pub locale: Option<String>,
}

/// Cover image sizes MangaDex serves: the original or a thumbnail 512 or 256
/// pixels wide.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CoverSize {
    Original,
    Medium512,
    Small256,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manga {
    pub id: String,
    pub title: LocalizedText,
    pub alt_titles: Vec<LocalizedText>,
    pub description: LocalizedText,
    pub original_language: String,
    pub status: Option<PublicationStatus>,
    pub demographic: Option<Demographic>,
    pub content_rating: ContentRating,
    pub year: Option<u32>,
    pub last_volume: Option<String>,
    pub last_chapter: Option<String>,
    pub tags: Vec<Tag>,
    /// Languages with at least one chapter.
    pub available_languages: Vec<String>,
    pub chapter_numbers_reset_on_new_volume: bool,
    /// Ids on other sites, keyed by MangaDex's short codes (`al` AniList,
    /// `mal` MyAnimeList, `mu` MangaUpdates, ...).
    pub links: BTreeMap<String, String>,
    /// The main cover, when the request expanded it.
    pub cover: Option<Cover>,
    pub authors: Vec<Person>,
    pub artists: Vec<Person>,
    pub updated_at: Option<String>,
}

impl Manga {
    /// The best title for the reader's language chain.
    pub fn display_title(&self, chain: &[String]) -> Option<&str> {
        self.title
            .best(chain)
            .or_else(|| self.alt_titles.iter().find_map(|alt| alt.best(chain)))
            .map(|(_, text)| text)
    }

    /// The AniList id from the series links, for tracking.
    pub fn anilist_id(&self) -> Option<u64> {
        self.links.get("al").and_then(|id| id.trim().parse().ok())
    }

    pub fn web_url(&self) -> String {
        format!("https://mangadex.org/title/{}", self.id)
    }
}

/// A scanlation group, credited on every chapter that is read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanlationGroup {
    pub id: String,
    pub name: String,
    pub website: Option<String>,
    pub official: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Uploader {
    pub id: String,
    pub username: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    pub id: String,
    pub manga_id: Option<String>,
    pub title: Option<String>,
    pub volume: Option<String>,
    /// The chapter number as MangaDex stores it (`"12"`, `"12.5"`); `None`
    /// for a oneshot.
    pub chapter: Option<String>,
    pub pages: u32,
    pub language: String,
    /// Set when the chapter is hosted elsewhere and cannot be read here.
    pub external_url: Option<String>,
    pub publish_at: Option<String>,
    pub readable_at: Option<String>,
    pub updated_at: Option<String>,
    /// Groups to credit. Empty when the uploader posted without a group, in
    /// which case credit the uploader.
    pub groups: Vec<ScanlationGroup>,
    pub uploader: Option<Uploader>,
}

impl Chapter {
    pub fn web_url(&self) -> String {
        format!("https://mangadex.org/chapter/{}", self.id)
    }

    /// Whether the pages can be fetched from MangaDex@Home.
    pub fn is_readable(&self) -> bool {
        self.external_url.is_none() && self.pages > 0
    }
}

/// One page of a paginated list.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub items: Vec<T>,
    pub offset: u32,
    pub limit: u32,
    pub total: u32,
}

impl<T> Page<T> {
    /// Whether items lie beyond this page. Counts what arrived rather than
    /// the limit, since MangaDex may return fewer items than asked for.
    pub fn has_more(&self) -> bool {
        let seen = self.offset as usize + self.items.len();
        !self.items.is_empty() && seen < self.total as usize
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(pairs: &[(&str, &str)]) -> LocalizedText {
        LocalizedText(
            pairs
                .iter()
                .map(|(lang, text)| (lang.to_string(), text.to_string()))
                .collect(),
        )
    }

    #[test]
    fn best_text_follows_the_chain_then_english_then_romanized() {
        let chain = vec!["pl".to_string(), "en".to_string()];
        let both = text(&[("en", "The Moon"), ("pl", "Księżyc"), ("ja-ro", "Tsuki")]);
        assert_eq!(both.best(&chain), Some(("pl", "Księżyc")));

        let romanized = text(&[("ja", "月"), ("ja-ro", "Tsuki")]);
        assert_eq!(romanized.best(&chain), Some(("ja-ro", "Tsuki")));

        let only_other = text(&[("ja", "月")]);
        assert_eq!(only_other.best(&chain), Some(("ja", "月")));

        let blank_polish = text(&[("pl", "  "), ("en", "The Moon")]);
        assert_eq!(blank_polish.best(&chain), Some(("en", "The Moon")));
    }

    #[test]
    fn unknown_ratings_count_as_the_strictest() {
        assert_eq!(
            ContentRating::from_api("brand-new"),
            ContentRating::Pornographic
        );
    }
}
