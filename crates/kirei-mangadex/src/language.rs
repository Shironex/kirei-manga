//! The reader's language chain and how chapters are picked from it.
//!
//! The chain is ordered, Polish then English by default. A chapter list is
//! fetched once for every language in the chain (one request instead of one
//! per language), then each chapter number is filled from the first language
//! that has it. The result says plainly whether the preferred language
//! covered everything, part of the list, or nothing at all.

use std::collections::{BTreeSet, HashMap};

use serde::{Deserialize, Serialize};

use crate::error::{MangaDexError, Result};
use crate::model::Chapter;

/// Language codes MangaDex accepts in filters: `^[a-zA-Z\-]{2,5}$`.
pub(crate) fn check_language(code: &str) -> Result<()> {
    let valid =
        (2..=5).contains(&code.len()) && code.chars().all(|c| c.is_ascii_alphabetic() || c == '-');
    if valid {
        Ok(())
    } else {
        Err(MangaDexError::InvalidInput(format!(
            "{code:?} is not a MangaDex language code"
        )))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", try_from = "RawPrefs")]
pub struct LanguagePrefs {
    chain: Vec<String>,
    only_preferred: bool,
}

/// Stored settings go through [`LanguagePrefs::new`] too, so a hand-edited
/// or old settings file cannot produce an empty or invalid chain.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawPrefs {
    chain: Vec<String>,
    #[serde(default)]
    only_preferred: bool,
}

impl TryFrom<RawPrefs> for LanguagePrefs {
    type Error = MangaDexError;

    fn try_from(raw: RawPrefs) -> Result<Self> {
        Self::new(raw.chain, raw.only_preferred)
    }
}

impl Default for LanguagePrefs {
    fn default() -> Self {
        Self {
            chain: vec!["pl".into(), "en".into()],
            only_preferred: false,
        }
    }
}

impl LanguagePrefs {
    /// `chain` is ordered by preference; duplicates are dropped. With
    /// `only_preferred`, only the first language is ever asked for.
    pub fn new<I, S>(chain: I, only_preferred: bool) -> Result<Self>
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        let mut seen = BTreeSet::new();
        let mut ordered = Vec::new();
        for code in chain {
            let code = code.into().trim().to_ascii_lowercase();
            check_language(&code)?;
            if seen.insert(code.clone()) {
                ordered.push(code);
            }
        }
        if ordered.is_empty() {
            return Err(MangaDexError::InvalidInput(
                "the language chain needs at least one language".into(),
            ));
        }
        Ok(Self {
            chain: ordered,
            only_preferred,
        })
    }

    pub fn chain(&self) -> &[String] {
        &self.chain
    }

    pub fn preferred(&self) -> &str {
        // `new` and `default` never build an empty chain.
        self.chain.first().map_or("en", String::as_str)
    }

    pub fn only_preferred(&self) -> bool {
        self.only_preferred
    }

    /// The languages to request: the whole chain, or just the first.
    pub fn requested(&self) -> &[String] {
        if self.only_preferred {
            &self.chain[..self.chain.len().min(1)]
        } else {
            &self.chain
        }
    }
}

/// How well the preferred language covered a chapter list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum LanguageOutcome {
    /// Every chapter is in the preferred language.
    Preferred,
    /// The preferred language had some chapters; the rest come from later
    /// languages of the chain.
    #[serde(rename_all = "camelCase")]
    Mixed {
        preferred_count: usize,
        fallback_count: usize,
        fallback_languages: Vec<String>,
    },
    /// The preferred language had nothing; everything comes from later
    /// languages of the chain.
    #[serde(rename_all = "camelCase")]
    FallbackOnly { languages: Vec<String> },
    /// No language of the chain (or the preferred language alone, with
    /// "only my language" on) has any chapter.
    Nothing,
}

/// A chapter list resolved against the language chain.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizedChapters {
    /// In the order MangaDex returned them (volume, then chapter). A
    /// chapter number may appear more than once when several groups
    /// translated it into the chosen language.
    pub chapters: Vec<Chapter>,
    pub preferred: String,
    pub outcome: LanguageOutcome,
}

impl LocalizedChapters {
    /// True when anything had to come from a fallback language.
    pub fn used_fallback(&self) -> bool {
        matches!(
            self.outcome,
            LanguageOutcome::Mixed { .. } | LanguageOutcome::FallbackOnly { .. }
        )
    }
}

fn chapter_key(chapter: &Chapter, by_volume: bool) -> String {
    match (&chapter.chapter, by_volume) {
        (Some(number), true) => format!(
            "{}|{}",
            chapter.volume.as_deref().unwrap_or(""),
            normalize_number(number)
        ),
        (Some(number), false) => normalize_number(number),
        // Oneshots and unnumbered extras stand alone.
        (None, _) => format!("id:{}", chapter.id),
    }
}

/// `"01"`, `"1"` and `"1.0"` are the same chapter.
fn normalize_number(number: &str) -> String {
    let trimmed = number.trim();
    match trimmed.parse::<f64>() {
        Ok(value) if value.is_finite() => format!("{value}"),
        _ => trimmed.to_string(),
    }
}

/// Picks, for every chapter number, the chapters in the earliest language of
/// the chain that has it. Chapters in languages outside the request are
/// dropped. `by_volume` keys chapters by volume as well, for series whose
/// numbering restarts each volume.
pub fn resolve_chapters(
    chapters: Vec<Chapter>,
    prefs: &LanguagePrefs,
    by_volume: bool,
) -> LocalizedChapters {
    let requested = prefs.requested();
    let rank = |language: &str| requested.iter().position(|code| code == language);

    let mut best: HashMap<String, usize> = HashMap::new();
    for chapter in &chapters {
        if let Some(position) = rank(&chapter.language) {
            best.entry(chapter_key(chapter, by_volume))
                .and_modify(|current| *current = (*current).min(position))
                .or_insert(position);
        }
    }

    let kept: Vec<Chapter> = chapters
        .into_iter()
        .filter(|chapter| {
            rank(&chapter.language).is_some_and(|position| {
                best.get(&chapter_key(chapter, by_volume)) == Some(&position)
            })
        })
        .collect();

    let preferred = prefs.preferred().to_string();
    let preferred_count = kept
        .iter()
        .filter(|chapter| chapter.language == preferred)
        .count();
    let fallback_count = kept.len() - preferred_count;
    let fallback_languages: Vec<String> = requested
        .iter()
        .skip(1)
        .filter(|code| kept.iter().any(|chapter| &chapter.language == *code))
        .cloned()
        .collect();

    let outcome = match (preferred_count, fallback_count) {
        (0, 0) => LanguageOutcome::Nothing,
        (_, 0) => LanguageOutcome::Preferred,
        (0, _) => LanguageOutcome::FallbackOnly {
            languages: fallback_languages,
        },
        (_, _) => LanguageOutcome::Mixed {
            preferred_count,
            fallback_count,
            fallback_languages,
        },
    };
    LocalizedChapters {
        chapters: kept,
        preferred,
        outcome,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chapter(id: &str, number: Option<&str>, language: &str) -> Chapter {
        Chapter {
            id: id.into(),
            manga_id: None,
            title: None,
            volume: None,
            chapter: number.map(Into::into),
            pages: 10,
            language: language.into(),
            external_url: None,
            publish_at: None,
            readable_at: None,
            updated_at: None,
            groups: Vec::new(),
            uploader: None,
        }
    }

    fn ids(result: &LocalizedChapters) -> Vec<&str> {
        result.chapters.iter().map(|c| c.id.as_str()).collect()
    }

    #[test]
    fn prefs_validate_and_dedupe() {
        let prefs = LanguagePrefs::new(["PL", "en", "pl"], false).unwrap();
        assert_eq!(prefs.chain(), ["pl", "en"]);
        assert!(LanguagePrefs::new(Vec::<String>::new(), false).is_err());
        assert!(LanguagePrefs::new(["pl&x=1"], false).is_err());
        let stored: std::result::Result<LanguagePrefs, _> =
            serde_json::from_str(r#"{"chain":[],"onlyPreferred":true}"#);
        assert!(stored.is_err());
    }

    #[test]
    fn polish_chapters_are_found_when_they_exist() {
        let prefs = LanguagePrefs::default();
        let result = resolve_chapters(
            vec![
                chapter("en1", Some("1"), "en"),
                chapter("pl1", Some("1"), "pl"),
                chapter("en2", Some("2"), "en"),
                chapter("pl2", Some("2.0"), "pl"),
            ],
            &prefs,
            false,
        );
        assert_eq!(ids(&result), ["pl1", "pl2"]);
        assert_eq!(result.outcome, LanguageOutcome::Preferred);
        assert!(!result.used_fallback());
    }

    #[test]
    fn gaps_are_filled_from_the_fallback_and_reported() {
        let prefs = LanguagePrefs::default();
        let result = resolve_chapters(
            vec![
                chapter("pl1", Some("1"), "pl"),
                chapter("en1", Some("1"), "en"),
                chapter("en2", Some("2"), "en"),
                chapter("de2", Some("2"), "de"),
            ],
            &prefs,
            false,
        );
        assert_eq!(ids(&result), ["pl1", "en2"]);
        assert_eq!(
            result.outcome,
            LanguageOutcome::Mixed {
                preferred_count: 1,
                fallback_count: 1,
                fallback_languages: vec!["en".into()],
            }
        );
    }

    #[test]
    fn says_so_when_the_preferred_language_has_nothing() {
        let prefs = LanguagePrefs::default();
        let result = resolve_chapters(
            vec![
                chapter("en1", Some("1"), "en"),
                chapter("en2", Some("2"), "en"),
            ],
            &prefs,
            false,
        );
        assert_eq!(
            result.outcome,
            LanguageOutcome::FallbackOnly {
                languages: vec!["en".into()]
            }
        );
        assert!(result.used_fallback());
    }

    #[test]
    fn only_my_language_never_falls_back() {
        let prefs = LanguagePrefs::new(["pl", "en"], true).unwrap();
        let result = resolve_chapters(vec![chapter("en1", Some("1"), "en")], &prefs, false);
        assert!(result.chapters.is_empty());
        assert_eq!(result.outcome, LanguageOutcome::Nothing);
    }

    #[test]
    fn keeps_every_group_of_the_chosen_language_and_oneshots() {
        let prefs = LanguagePrefs::default();
        let result = resolve_chapters(
            vec![
                chapter("pl1a", Some("1"), "pl"),
                chapter("pl1b", Some("1"), "pl"),
                chapter("en-oneshot", None, "en"),
            ],
            &prefs,
            false,
        );
        assert_eq!(ids(&result), ["pl1a", "pl1b", "en-oneshot"]);
    }

    #[test]
    fn volume_keys_keep_restarted_numbering_apart() {
        let prefs = LanguagePrefs::default();
        let mut v1 = chapter("pl-v1c1", Some("1"), "pl");
        v1.volume = Some("1".into());
        let mut v2 = chapter("en-v2c1", Some("1"), "en");
        v2.volume = Some("2".into());
        let merged = resolve_chapters(vec![v1.clone(), v2.clone()], &prefs, false);
        assert_eq!(ids(&merged), ["pl-v1c1"]);
        let split = resolve_chapters(vec![v1, v2], &prefs, true);
        assert_eq!(ids(&split), ["pl-v1c1", "en-v2c1"]);
    }
}
