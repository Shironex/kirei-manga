//! Search and feed filters, and how they become query strings.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use url::Url;

use crate::error::{MangaDexError, Result};
use crate::language::{LanguagePrefs, check_language};
use crate::model::{ContentRating, Demographic, PublicationStatus};

/// MangaDex ids are UUIDs. Checking the shape before an id goes into a URL
/// path keeps `../` and query characters out of it.
pub(crate) fn check_id(id: &str) -> Result<()> {
    let bytes = id.as_bytes();
    let valid = bytes.len() == 36
        && bytes.iter().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => *byte == b'-',
            _ => byte.is_ascii_hexdigit(),
        });
    if valid {
        Ok(())
    } else {
        Err(MangaDexError::InvalidInput(format!(
            "{id:?} is not a MangaDex id"
        )))
    }
}

/// `YYYY-MM-DDTHH:MM:SS` in UTC, the only date format MangaDex filters take.
pub(crate) fn format_utc(time: SystemTime) -> String {
    let secs = time
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    let days = (secs / 86_400) as i64;
    let rest = secs % 86_400;
    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}",
        rest / 3_600,
        rest % 3_600 / 60,
        rest % 60
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SortDirection {
    Asc,
    #[default]
    Desc,
}

impl SortDirection {
    fn as_api(self) -> &'static str {
        match self {
            Self::Asc => "asc",
            Self::Desc => "desc",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SearchOrder {
    Relevance,
    LatestUploadedChapter,
    FollowedCount,
    Rating,
    Title,
    Year,
    CreatedAt,
    UpdatedAt,
}

impl SearchOrder {
    fn as_api(self) -> &'static str {
        match self {
            Self::Relevance => "relevance",
            Self::LatestUploadedChapter => "latestUploadedChapter",
            Self::FollowedCount => "followedCount",
            Self::Rating => "rating",
            Self::Title => "title",
            Self::Year => "year",
            Self::CreatedAt => "createdAt",
            Self::UpdatedAt => "updatedAt",
        }
    }
}

/// Which translations a search requires a series to have.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "languages")]
pub enum LanguageScope {
    /// Series readable in the reader's chain (or only the preferred
    /// language, with "only my language" on).
    #[default]
    Preferences,
    /// Any series, whatever it is translated into.
    Any,
    Exactly(Vec<String>),
}

impl LanguageScope {
    fn languages<'a>(&'a self, prefs: &'a LanguagePrefs) -> &'a [String] {
        match self {
            Self::Preferences => prefs.requested(),
            Self::Any => &[],
            Self::Exactly(languages) => languages,
        }
    }
}

/// Filters for [`crate::MangaDex::search`]. Everything is optional; the
/// default lists the latest updated series readable in the reader's
/// languages.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchQuery {
    pub title: Option<String>,
    pub included_tags: Vec<String>,
    pub excluded_tags: Vec<String>,
    pub status: Vec<PublicationStatus>,
    pub demographic: Vec<Demographic>,
    pub original_language: Vec<String>,
    pub year: Option<u32>,
    /// Restrict to these ids (at most 100).
    pub ids: Vec<String>,
    pub languages: LanguageScope,
    /// Overrides the client's content ratings for this search.
    pub content_rating: Option<Vec<ContentRating>>,
    /// Default: relevance when there is a title, else latest upload.
    pub order: Option<(SearchOrder, SortDirection)>,
    /// 1 to 100; default 20.
    pub limit: Option<u32>,
    pub offset: u32,
}

impl SearchQuery {
    pub fn title(title: impl Into<String>) -> Self {
        Self {
            title: Some(title.into()),
            ..Self::default()
        }
    }

    pub(crate) fn apply(
        &self,
        url: &mut Url,
        prefs: &LanguagePrefs,
        ratings: &[ContentRating],
    ) -> Result<()> {
        let limit = self.limit.unwrap_or(20);
        if !(1..=100).contains(&limit) {
            return Err(MangaDexError::InvalidInput(
                "search limit must be between 1 and 100".into(),
            ));
        }
        if self.ids.len() > 100 {
            return Err(MangaDexError::InvalidInput(
                "search takes at most 100 ids".into(),
            ));
        }
        for id in self
            .included_tags
            .iter()
            .chain(&self.excluded_tags)
            .chain(&self.ids)
        {
            check_id(id)?;
        }
        let languages = self.languages.languages(prefs);
        for code in languages.iter().chain(&self.original_language) {
            check_language(code)?;
        }

        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("limit", &limit.to_string());
        pairs.append_pair("offset", &self.offset.to_string());
        let title = self
            .title
            .as_deref()
            .map(str::trim)
            .filter(|t| !t.is_empty());
        if let Some(title) = title {
            pairs.append_pair("title", title);
        }
        for tag in &self.included_tags {
            pairs.append_pair("includedTags[]", tag);
        }
        for tag in &self.excluded_tags {
            pairs.append_pair("excludedTags[]", tag);
        }
        for status in &self.status {
            pairs.append_pair("status[]", status.as_api());
        }
        for demographic in &self.demographic {
            pairs.append_pair("publicationDemographic[]", demographic.as_api());
        }
        for code in &self.original_language {
            pairs.append_pair("originalLanguage[]", code);
        }
        if let Some(year) = self.year {
            pairs.append_pair("year", &year.to_string());
        }
        for id in &self.ids {
            pairs.append_pair("ids[]", id);
        }
        for code in languages {
            pairs.append_pair("availableTranslatedLanguage[]", code);
        }
        for rating in self.content_rating.as_deref().unwrap_or(ratings) {
            pairs.append_pair("contentRating[]", rating.as_api());
        }
        let (order, direction) = self.order.unwrap_or(if title.is_some() {
            (SearchOrder::Relevance, SortDirection::Desc)
        } else {
            (SearchOrder::LatestUploadedChapter, SortDirection::Desc)
        });
        pairs.append_pair(&format!("order[{}]", order.as_api()), direction.as_api());
        pairs.append_pair("includes[]", "cover_art");
        pairs.append_pair("includes[]", "author");
        pairs.append_pair("includes[]", "artist");
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FeedOrder {
    /// Reading order: volume, then chapter, ascending.
    #[default]
    ReadingOrder,
    /// Volume and chapter, descending.
    ReverseReadingOrder,
    /// Newest readable first, for an updates feed.
    NewestFirst,
}

/// Filters for chapter feeds.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FeedQuery {
    /// 1 to 500; default 100.
    pub limit: Option<u32>,
    pub offset: u32,
    pub order: FeedOrder,
    /// Only chapters published since then (Unix milliseconds, UTC), for
    /// refreshing an updates feed.
    pub published_since: Option<u64>,
    /// Include chapters hosted on other sites (they cannot be read here).
    pub include_external: bool,
    /// Overrides the reader's language chain for this request.
    pub languages: Option<Vec<String>>,
    /// Overrides the client's content ratings for this request.
    pub content_rating: Option<Vec<ContentRating>>,
}

impl FeedQuery {
    pub(crate) fn apply(
        &self,
        url: &mut Url,
        prefs: &LanguagePrefs,
        ratings: &[ContentRating],
    ) -> Result<()> {
        let limit = self.limit.unwrap_or(100);
        if !(1..=500).contains(&limit) {
            return Err(MangaDexError::InvalidInput(
                "feed limit must be between 1 and 500".into(),
            ));
        }
        let languages = self.languages.as_deref().unwrap_or(prefs.requested());
        for code in languages {
            check_language(code)?;
        }
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("limit", &limit.to_string());
        pairs.append_pair("offset", &self.offset.to_string());
        for code in languages {
            pairs.append_pair("translatedLanguage[]", code);
        }
        for rating in self.content_rating.as_deref().unwrap_or(ratings) {
            pairs.append_pair("contentRating[]", rating.as_api());
        }
        match self.order {
            FeedOrder::ReadingOrder => {
                pairs.append_pair("order[volume]", "asc");
                pairs.append_pair("order[chapter]", "asc");
            }
            FeedOrder::ReverseReadingOrder => {
                pairs.append_pair("order[volume]", "desc");
                pairs.append_pair("order[chapter]", "desc");
            }
            FeedOrder::NewestFirst => {
                pairs.append_pair("order[readableAt]", "desc");
            }
        }
        if let Some(since) = self.published_since {
            let since = UNIX_EPOCH + Duration::from_millis(since);
            pairs.append_pair("publishAtSince", &format_utc(since));
        }
        if !self.include_external {
            pairs.append_pair("includeExternalUrl", "0");
        }
        pairs.append_pair("includeEmptyPages", "0");
        pairs.append_pair("includeFuturePublishAt", "0");
        pairs.append_pair("includes[]", "scanlation_group");
        pairs.append_pair("includes[]", "user");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_must_be_uuids() {
        assert!(check_id("a96676e5-8ae2-425e-b549-7f15dd34a6d8").is_ok());
        assert!(check_id("../manga").is_err());
        assert!(check_id("a96676e5-8ae2-425e-b549-7f15dd34a6d8?x").is_err());
    }

    #[test]
    fn formats_utc_dates() {
        assert_eq!(format_utc(UNIX_EPOCH), "1970-01-01T00:00:00");
        let leap = UNIX_EPOCH + Duration::from_secs(1_709_210_096);
        assert_eq!(format_utc(leap), "2024-02-29T12:34:56");
    }

    #[test]
    fn search_sends_the_chain_and_ratings() {
        let mut url = Url::parse("https://api.mangadex.org/manga").unwrap();
        SearchQuery::title("Księżyc")
            .apply(
                &mut url,
                &LanguagePrefs::default(),
                &[ContentRating::Safe, ContentRating::Suggestive],
            )
            .unwrap();
        let query: Vec<(String, String)> = url.query_pairs().into_owned().collect();
        let has = |key: &str, value: &str| query.iter().any(|(k, v)| k == key && v == value);
        assert!(has("title", "Księżyc"));
        assert!(has("availableTranslatedLanguage[]", "pl"));
        assert!(has("availableTranslatedLanguage[]", "en"));
        assert!(has("contentRating[]", "safe"));
        assert!(!has("contentRating[]", "erotica"));
        assert!(has("order[relevance]", "desc"));
    }

    #[test]
    fn search_rejects_out_of_range_limits() {
        let mut url = Url::parse("https://api.mangadex.org/manga").unwrap();
        let query = SearchQuery {
            limit: Some(101),
            ..SearchQuery::default()
        };
        assert!(
            query
                .apply(&mut url, &LanguagePrefs::default(), &[])
                .is_err()
        );
    }
}
