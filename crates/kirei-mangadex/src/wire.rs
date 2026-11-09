//! MangaDex's JSON as it arrives, and the conversion into [`crate::model`].
//!
//! Parsing is lenient where the API is loose: an empty localized string or
//! link map arrives as `[]` instead of `{}`, optional fields may be missing or
//! `null`, and relationship attributes are present only when the request
//! expanded them.

use std::collections::BTreeMap;

use serde::de::{DeserializeOwned, Error as _};
use serde::{Deserialize, Deserializer};
use serde_json::Value;

use crate::error::{MangaDexError, Result};
use crate::model::{
    Chapter, ContentRating, Cover, Demographic, LocalizedText, Manga, Page, Person,
    PublicationStatus, ScanlationGroup, Tag, Uploader,
};

pub(crate) fn parse<T: DeserializeOwned>(body: &[u8]) -> Result<T> {
    serde_json::from_slice(body).map_err(MangaDexError::decode)
}

/// A map that may arrive as `{}`, `[]` or `null`.
fn map_or_empty<'de, D, V>(deserializer: D) -> std::result::Result<BTreeMap<String, V>, D::Error>
where
    D: Deserializer<'de>,
    V: DeserializeOwned,
{
    match Option::<Value>::deserialize(deserializer)? {
        Some(map @ Value::Object(_)) => serde_json::from_value(map).map_err(D::Error::custom),
        _ => Ok(BTreeMap::new()),
    }
}

fn localized<'de, D>(deserializer: D) -> std::result::Result<LocalizedText, D::Error>
where
    D: Deserializer<'de>,
{
    map_or_empty(deserializer).map(LocalizedText)
}

fn localized_list<'de, D>(deserializer: D) -> std::result::Result<Vec<LocalizedText>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    struct Item(#[serde(deserialize_with = "localized")] LocalizedText);
    Ok(Option::<Vec<Item>>::deserialize(deserializer)?
        .unwrap_or_default()
        .into_iter()
        .map(|item| item.0)
        .collect())
}

fn links<'de, D>(deserializer: D) -> std::result::Result<BTreeMap<String, String>, D::Error>
where
    D: Deserializer<'de>,
{
    // Link values are strings, but be ready for anything else and skip it.
    let raw: BTreeMap<String, Value> = map_or_empty(deserializer)?;
    Ok(raw
        .into_iter()
        .filter_map(|(key, value)| value.as_str().map(|text| (key, text.to_string())))
        .collect())
}

#[derive(Debug, Deserialize)]
pub(crate) struct Entity<T> {
    pub(crate) data: T,
}

#[derive(Debug, Deserialize)]
pub(crate) struct Collection<T> {
    pub(crate) data: Vec<T>,
    #[serde(default)]
    pub(crate) offset: u32,
    #[serde(default)]
    pub(crate) limit: u32,
    #[serde(default)]
    pub(crate) total: u32,
}

impl<T> Collection<T> {
    pub(crate) fn into_page<U>(self, convert: impl FnMut(T) -> U) -> Page<U> {
        Page {
            items: self.data.into_iter().map(convert).collect(),
            offset: self.offset,
            limit: self.limit,
            total: self.total,
        }
    }
}

#[derive(Debug, Deserialize)]
pub(crate) struct Relationship {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    attributes: Option<Value>,
}

impl Relationship {
    fn attributes<T: DeserializeOwned>(&self) -> Option<T> {
        self.attributes
            .as_ref()
            .and_then(|value| serde_json::from_value(value.clone()).ok())
    }
}

#[derive(Debug, Deserialize)]
pub(crate) struct WireManga {
    id: String,
    attributes: MangaAttributes,
    #[serde(default)]
    relationships: Vec<Relationship>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MangaAttributes {
    #[serde(default, deserialize_with = "localized")]
    title: LocalizedText,
    #[serde(default, deserialize_with = "localized_list")]
    alt_titles: Vec<LocalizedText>,
    #[serde(default, deserialize_with = "localized")]
    description: LocalizedText,
    #[serde(default, deserialize_with = "links")]
    links: BTreeMap<String, String>,
    #[serde(default)]
    original_language: String,
    #[serde(default)]
    last_volume: Option<String>,
    #[serde(default)]
    last_chapter: Option<String>,
    #[serde(default)]
    publication_demographic: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    year: Option<u32>,
    #[serde(default)]
    content_rating: Option<String>,
    #[serde(default)]
    chapter_numbers_reset_on_new_volume: bool,
    #[serde(default)]
    available_translated_languages: Vec<Option<String>>,
    #[serde(default)]
    tags: Vec<WireTag>,
    #[serde(default)]
    updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WireTag {
    id: String,
    attributes: TagAttributes,
}

#[derive(Debug, Deserialize)]
struct TagAttributes {
    #[serde(default, deserialize_with = "localized")]
    name: LocalizedText,
    #[serde(default)]
    group: String,
}

impl From<WireTag> for Tag {
    fn from(tag: WireTag) -> Self {
        Self {
            id: tag.id,
            name: tag.attributes.name,
            group: tag.attributes.group,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CoverAttributes {
    #[serde(default)]
    file_name: String,
    #[serde(default)]
    volume: Option<String>,
    #[serde(default)]
    locale: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NamedAttributes {
    #[serde(default)]
    name: String,
}

impl From<WireManga> for Manga {
    fn from(manga: WireManga) -> Self {
        let attributes = manga.attributes;
        let mut cover = None;
        let mut authors = Vec::new();
        let mut artists = Vec::new();
        for relation in &manga.relationships {
            match relation.kind.as_str() {
                "cover_art" => {
                    cover = relation
                        .attributes::<CoverAttributes>()
                        .filter(|attributes| !attributes.file_name.is_empty())
                        .map(|attributes| cover_from(relation.id.clone(), attributes));
                }
                "author" | "artist" => {
                    let name = relation
                        .attributes::<NamedAttributes>()
                        .map(|attributes| attributes.name)
                        .unwrap_or_default();
                    let person = Person {
                        id: relation.id.clone(),
                        name,
                    };
                    if relation.kind == "author" {
                        authors.push(person);
                    } else {
                        artists.push(person);
                    }
                }
                _ => {}
            }
        }
        Self {
            id: manga.id,
            title: attributes.title,
            alt_titles: attributes.alt_titles,
            description: attributes.description,
            original_language: attributes.original_language,
            status: attributes
                .status
                .as_deref()
                .and_then(PublicationStatus::from_api),
            demographic: attributes
                .publication_demographic
                .as_deref()
                .and_then(Demographic::from_api),
            content_rating: attributes
                .content_rating
                .as_deref()
                .map_or(ContentRating::Pornographic, ContentRating::from_api),
            year: attributes.year,
            last_volume: attributes.last_volume.filter(|value| !value.is_empty()),
            last_chapter: attributes.last_chapter.filter(|value| !value.is_empty()),
            tags: attributes.tags.into_iter().map(Tag::from).collect(),
            available_languages: attributes
                .available_translated_languages
                .into_iter()
                .flatten()
                .collect(),
            chapter_numbers_reset_on_new_volume: attributes.chapter_numbers_reset_on_new_volume,
            links: attributes.links,
            cover,
            authors,
            artists,
            updated_at: attributes.updated_at,
        }
    }
}

fn cover_from(id: String, attributes: CoverAttributes) -> Cover {
    Cover {
        id,
        file_name: attributes.file_name,
        volume: attributes.volume.filter(|value| !value.is_empty()),
        locale: attributes.locale.filter(|value| !value.is_empty()),
    }
}

#[derive(Debug, Deserialize)]
pub(crate) struct WireCover {
    id: String,
    attributes: CoverAttributes,
}

impl From<WireCover> for Cover {
    fn from(cover: WireCover) -> Self {
        cover_from(cover.id, cover.attributes)
    }
}

#[derive(Debug, Deserialize)]
pub(crate) struct WireChapter {
    id: String,
    attributes: ChapterAttributes,
    #[serde(default)]
    relationships: Vec<Relationship>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChapterAttributes {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    volume: Option<String>,
    #[serde(default)]
    chapter: Option<String>,
    #[serde(default)]
    pages: u32,
    #[serde(default)]
    translated_language: String,
    #[serde(default)]
    external_url: Option<String>,
    #[serde(default)]
    publish_at: Option<String>,
    #[serde(default)]
    readable_at: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GroupAttributes {
    #[serde(default)]
    name: String,
    #[serde(default)]
    website: Option<String>,
    #[serde(default)]
    official: bool,
}

#[derive(Debug, Deserialize)]
struct UserAttributes {
    #[serde(default)]
    username: Option<String>,
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|text| !text.trim().is_empty())
}

impl From<WireChapter> for Chapter {
    fn from(chapter: WireChapter) -> Self {
        let attributes = chapter.attributes;
        let mut manga_id = None;
        let mut groups = Vec::new();
        let mut uploader = None;
        for relation in &chapter.relationships {
            match relation.kind.as_str() {
                "manga" => manga_id = Some(relation.id.clone()),
                "scanlation_group" => {
                    let attributes = relation.attributes::<GroupAttributes>();
                    groups.push(ScanlationGroup {
                        id: relation.id.clone(),
                        name: attributes
                            .as_ref()
                            .map(|group| group.name.clone())
                            .unwrap_or_default(),
                        website: attributes
                            .as_ref()
                            .and_then(|group| non_empty(group.website.clone())),
                        official: attributes.is_some_and(|group| group.official),
                    });
                }
                "user" => {
                    uploader = Some(Uploader {
                        id: relation.id.clone(),
                        username: relation
                            .attributes::<UserAttributes>()
                            .and_then(|user| non_empty(user.username)),
                    });
                }
                _ => {}
            }
        }
        Self {
            id: chapter.id,
            manga_id,
            title: non_empty(attributes.title),
            volume: non_empty(attributes.volume),
            chapter: non_empty(attributes.chapter),
            pages: attributes.pages,
            language: attributes.translated_language,
            external_url: non_empty(attributes.external_url),
            publish_at: attributes.publish_at,
            readable_at: attributes.readable_at,
            updated_at: attributes.updated_at,
            groups,
            uploader,
        }
    }
}

/// `{"result":"error","errors":[{"status":404,"title":"...","detail":"..."}]}`
#[derive(Debug, Deserialize)]
pub(crate) struct ErrorBody {
    #[serde(default)]
    errors: Vec<ErrorItem>,
}

#[derive(Debug, Deserialize)]
struct ErrorItem {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    detail: Option<String>,
}

impl ErrorBody {
    /// A readable message from an error body, if it is one.
    pub(crate) fn message(body: &[u8]) -> Option<String> {
        let parsed: Self = serde_json::from_slice(body).ok()?;
        let first = parsed.errors.into_iter().next()?;
        non_empty(first.detail).or_else(|| non_empty(first.title))
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AtHomeBody {
    pub(crate) base_url: String,
    pub(crate) chapter: AtHomeChapter,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AtHomeChapter {
    pub(crate) hash: String,
    #[serde(default)]
    pub(crate) data: Vec<String>,
    #[serde(default)]
    pub(crate) data_saver: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct StatusesBody {
    #[serde(default, deserialize_with = "map_or_empty")]
    pub(crate) statuses: BTreeMap<String, String>,
}

/// `GET /manga/{id}/read`: the ids of the chapters marked read.
#[derive(Debug, Deserialize)]
pub(crate) struct ReadBody {
    #[serde(default)]
    pub(crate) data: Vec<String>,
}

/// `GET /manga/read?grouped=true`: read chapter ids per series. MangaDex
/// sends `[]` instead of `{}` when nothing is read.
#[derive(Debug, Deserialize)]
pub(crate) struct GroupedReadBody {
    #[serde(default, deserialize_with = "map_or_empty")]
    pub(crate) data: BTreeMap<String, Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct StatusBody {
    #[serde(default)]
    pub(crate) status: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_maps_may_arrive_as_lists() {
        let json = br#"{"id":"m","attributes":{"title":{"en":"A"},"description":[],"links":null,"altTitles":[{"pl":"B"},[]]},"relationships":[]}"#;
        let manga: Manga = parse::<WireManga>(json).unwrap().into();
        assert!(manga.description.is_empty());
        assert!(manga.links.is_empty());
        assert_eq!(manga.alt_titles.len(), 2);
        assert_eq!(manga.alt_titles[0].get("pl"), Some("B"));
    }

    #[test]
    fn error_bodies_give_their_detail() {
        let body = br#"{"result":"error","errors":[{"id":"x","status":400,"title":"Bad","detail":"limit is too big"}]}"#;
        assert_eq!(
            ErrorBody::message(body).as_deref(),
            Some("limit is too big")
        );
        assert_eq!(ErrorBody::message(b"<html>"), None);
    }
}
