//! Plain data the client hands to the app. Serialized in camelCase for the
//! webview, deserialized from AniList's own (also camelCase) field names.

use serde::{Deserialize, Serialize};

/// The signed-in AniList user.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Viewer {
    pub id: i64,
    pub name: String,
    pub avatar: Option<String>,
    pub site_url: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaTitle {
    pub romaji: Option<String>,
    pub english: Option<String>,
    pub native: Option<String>,
    /// The title in the language the viewer picked on AniList.
    pub user_preferred: Option<String>,
}

impl MediaTitle {
    /// The best title to show: the viewer's preference, then English, romaji
    /// and native.
    pub fn display(&self) -> &str {
        [
            &self.user_preferred,
            &self.english,
            &self.romaji,
            &self.native,
        ]
        .into_iter()
        .flatten()
        .map(String::as_str)
        .find(|title| !title.trim().is_empty())
        .unwrap_or("Untitled")
    }
}

/// A manga on AniList, with the viewer's list entry when signed in.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    pub id: i64,
    pub title: MediaTitle,
    #[serde(default)]
    pub synonyms: Vec<String>,
    /// `MANGA`, `NOVEL` or `ONE_SHOT`.
    pub format: Option<String>,
    /// `FINISHED`, `RELEASING`, `NOT_YET_RELEASED`, `CANCELLED` or `HIATUS`.
    pub status: Option<String>,
    /// Total chapters; only known once the series has finished.
    pub chapters: Option<i64>,
    pub volumes: Option<i64>,
    pub start_year: Option<i64>,
    pub cover: Option<String>,
    pub site_url: Option<String>,
    #[serde(default)]
    pub is_adult: bool,
    /// The viewer's entry; `None` when not on their list or not signed in.
    pub list_entry: Option<ListEntry>,
}

/// One page of search results.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPage {
    pub media: Vec<Media>,
    pub has_next_page: bool,
}

/// AniList's `MediaListStatus`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ListStatus {
    /// Reading.
    Current,
    Planning,
    Completed,
    Dropped,
    Paused,
    /// Rereading.
    Repeating,
}

impl ListStatus {
    /// The GraphQL enum value, also the form stored in the sync queue.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Current => "CURRENT",
            Self::Planning => "PLANNING",
            Self::Completed => "COMPLETED",
            Self::Dropped => "DROPPED",
            Self::Paused => "PAUSED",
            Self::Repeating => "REPEATING",
        }
    }

    pub fn parse(text: &str) -> Option<Self> {
        Some(match text {
            "CURRENT" => Self::Current,
            "PLANNING" => Self::Planning,
            "COMPLETED" => Self::Completed,
            "DROPPED" => Self::Dropped,
            "PAUSED" => Self::Paused,
            "REPEATING" => Self::Repeating,
            _ => return None,
        })
    }
}

/// The viewer's list entry for one manga.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListEntry {
    pub id: i64,
    pub status: Option<ListStatus>,
    /// Chapters read.
    pub progress: i64,
    /// Score on AniList's 0 to 100 scale, whatever format the user shows.
    /// 0 means unscored.
    pub score: f64,
    /// Times reread.
    pub repeat: i64,
    /// Unix seconds.
    pub updated_at: Option<i64>,
}

/// A change to the viewer's list entry. Fields left `None` are not sent and
/// stay as they are on AniList.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryUpdate {
    pub progress: Option<i64>,
    pub status: Option<ListStatus>,
    /// 0 to 100.
    pub score: Option<i64>,
}

impl EntryUpdate {
    pub fn is_empty(&self) -> bool {
        self.progress.is_none() && self.status.is_none() && self.score.is_none()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_title_prefers_the_viewer_choice_then_english() {
        let mut title = MediaTitle {
            romaji: Some("Tsuki no Michi".into()),
            english: Some("Moonlit Road".into()),
            native: Some("月の道".into()),
            user_preferred: None,
        };
        assert_eq!(title.display(), "Moonlit Road");
        title.user_preferred = Some("Tsuki no Michi".into());
        assert_eq!(title.display(), "Tsuki no Michi");
        assert_eq!(MediaTitle::default().display(), "Untitled");
    }

    #[test]
    fn statuses_round_trip() {
        for status in [
            ListStatus::Current,
            ListStatus::Planning,
            ListStatus::Completed,
            ListStatus::Dropped,
            ListStatus::Paused,
            ListStatus::Repeating,
        ] {
            assert_eq!(ListStatus::parse(status.as_str()), Some(status));
            let json = serde_json::to_string(&status).unwrap();
            assert_eq!(json, format!("\"{}\"", status.as_str()));
        }
        assert_eq!(ListStatus::parse("reading"), None);
    }
}
