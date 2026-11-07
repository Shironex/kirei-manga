//! Loose parsing of chapter, volume and series names out of file and folder
//! names, the way people actually name them:
//!
//! - `Vol.02 Ch.011 - The Night Customer`
//! - `[Group] Title - 011 (2019) [Digital]`
//! - `Title v02c011`, `Title c011.5`
//! - `Wiedźma z Bieszczad - Tom 1 Rozdział 3`
//! - `月夜の書店 第3巻 第11話`
//!
//! Nothing here touches the disk. The parser never fails: anything it cannot
//! read is left as `None` and the caller falls back to the plain name.

use std::sync::LazyLock;

use regex::Regex;

/// What a name says about a chapter.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ParsedName {
    /// Series title: the text before the first volume or chapter marker.
    pub title: Option<String>,
    pub volume: Option<f64>,
    pub chapter: Option<f64>,
    /// Scanlation group from a leading `[Group]` or `(Group)` tag.
    pub group: Option<String>,
    /// Text after the chapter number, such as `The Night Customer`.
    pub chapter_title: Option<String>,
}

// Built once; the patterns are constants, so a failure to compile is a bug
// that every test run would catch on the first name.
#[allow(clippy::unwrap_used)]
fn re(pattern: &str) -> Regex {
    Regex::new(pattern).unwrap()
}

/// `[...]`, `{...}` and `(...)` tags: groups, years, `Digital`, revisions.
static TAGS: LazyLock<Regex> = LazyLock::new(|| re(r"\[[^\]]*\]|\{[^}]*\}|\([^)]*\)"));
/// A leading tag, read as the group.
static LEADING_TAG: LazyLock<Regex> = LazyLock::new(|| re(r"^\s*(?:\[([^\]]+)\]|\(([^)]+)\))"));
/// `011v2`: a release revision glued to a number, not a volume.
static REVISION: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)(\d)v\d+\b"));

const NUMBER: &str = r"(\d+(?:[.,]\d+)?)";

static VOLUME: LazyLock<Regex> = LazyLock::new(|| {
    re(&format!(
        r"(?i)(?:^|[^\p{{L}}])(?:volume|vol|tome|tom|v|t)\s*\.?\s*{NUMBER}"
    ))
});
static CHAPTER: LazyLock<Regex> = LazyLock::new(|| {
    re(&format!(
        r"(?i)(?:^|[^\p{{L}}])(?:(?:chapter|chap|ch|rozdział|rozdzial|rozdz|roz|episode|ep|c)\s*\.?\s*|(?:r\.?|\#)\s?){NUMBER}(?:\s*[-~]\s*\d+(?:[.,]\d+)?)?"
    ))
});
static JP_VOLUME: LazyLock<Regex> = LazyLock::new(|| re(r"第?\s*(\d+)\s*巻"));
static JP_CHAPTER: LazyLock<Regex> = LazyLock::new(|| re(r"第?\s*(\d+(?:\.\d+)?)\s*[話话]"));
/// A bare number token, the fallback when no marker is present.
static BARE_NUMBER: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?:^|[\s\-#])(\d+(?:[.,]\d+)?)(?:$|[\s\-:])"));

/// Characters trimmed off the ends of titles.
const SEPARATORS: &[char] = &[
    ' ', '-', '_', '.', ',', ':', '#', '~', '|', '\u{2013}', '\u{2014}',
];

/// Parses a file or folder name. Pass the name without its extension.
pub fn parse_name(raw: &str) -> ParsedName {
    let underscored = raw.replace('_', " ");
    let group = LEADING_TAG.captures(&underscored).and_then(|caps| {
        let text = caps.get(1).or_else(|| caps.get(2))?.as_str().trim();
        // `(2019)` or `[001]` at the front is not a group.
        (!text.is_empty() && !text.chars().all(|c| c.is_ascii_digit())).then(|| text.to_owned())
    });
    let untagged = TAGS.replace_all(&underscored, " ");
    let unrevised = REVISION.replace_all(&untagged, "$1");
    let text = collapse_spaces(&unrevised);

    let mut spans: Vec<(usize, usize)> = Vec::new();
    let volume = first_number(&JP_VOLUME, &text, &mut spans)
        .or_else(|| first_number(&VOLUME, &text, &mut spans));
    let mut chapter = first_number(&JP_CHAPTER, &text, &mut spans)
        .or_else(|| first_number(&CHAPTER, &text, &mut spans));

    if volume.is_none() && chapter.is_none() {
        chapter = fallback_number(&text, &mut spans);
    }

    let (title, chapter_title) = match (
        spans.iter().map(|s| s.0).min(),
        spans.iter().map(|s| s.1).max(),
    ) {
        (Some(start), Some(end)) => (clean(&text[..start]), clean(&text[end..])),
        _ => (clean(&text), None),
    };

    ParsedName {
        title,
        volume,
        chapter,
        group,
        chapter_title,
    }
}

/// Folds a title into a grouping key: lowercase, letters and digits only
/// (diacritics kept), single spaces.
pub fn title_key(title: &str) -> String {
    let mapped: String = title
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .flat_map(char::to_lowercase)
        .collect();
    collapse_spaces(&mapped)
}

/// Strips scanner tags and separators off a folder name to get a display
/// title: `[Group] The Title (2019) [Digital]` becomes `The Title`.
pub fn clean_title(raw: &str) -> String {
    let untagged = TAGS.replace_all(&raw.replace('_', " "), " ").into_owned();
    clean(&collapse_spaces(&untagged)).unwrap_or_else(|| raw.trim().to_owned())
}

fn first_number(pattern: &Regex, text: &str, spans: &mut Vec<(usize, usize)>) -> Option<f64> {
    let caps = pattern.captures(text)?;
    let whole = caps.get(0)?;
    let number = caps.get(1)?;
    // Skip the non-letter that anchors the match, so it stays in the title.
    let start = text[whole.start()..number.start()]
        .char_indices()
        .find(|(_, c)| c.is_alphabetic() || *c == '#' || *c == '第' || c.is_ascii_digit())
        .map_or(number.start(), |(offset, _)| whole.start() + offset);
    spans.push((start, whole.end()));
    parse_number(number.as_str())
}

/// With no marker, a number after ` - ` wins, then a number that ends the
/// name. `Mob Psycho 100 - 001` gives 1; `Title 011` gives 11.
fn fallback_number(text: &str, spans: &mut Vec<(usize, usize)>) -> Option<f64> {
    let mut last = None;
    for caps in BARE_NUMBER.captures_iter(text) {
        let Some(number) = caps.get(1) else {
            continue;
        };
        let before = text[..number.start()].trim_end();
        if before.ends_with('-') || before.ends_with('#') {
            let start = before.len().saturating_sub(1);
            spans.push((start, number.end()));
            return parse_number(number.as_str());
        }
        last = Some(number);
    }
    let number = last?;
    if !text[number.end()..].trim().is_empty() {
        return None;
    }
    spans.push((number.start(), number.end()));
    parse_number(number.as_str())
}

fn parse_number(text: &str) -> Option<f64> {
    text.replace(',', ".")
        .parse::<f64>()
        .ok()
        .filter(|n| n.is_finite())
}

fn clean(text: &str) -> Option<String> {
    let trimmed = text.trim_matches(SEPARATORS).trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

fn collapse_spaces(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    type Row = (
        &'static str,
        Option<&'static str>,
        Option<f64>,
        Option<f64>,
        Option<&'static str>,
    );

    /// (name, title, volume, chapter, group). Real world shapes: scanlation
    /// releases, publisher digital files, Polish and Japanese naming.
    const NAMES: &[Row] = &[
        ("Vol.02 Ch.011", None, Some(2.0), Some(11.0), None),
        (
            "Vol.02 Ch.011 - The Night Customer",
            None,
            Some(2.0),
            Some(11.0),
            None,
        ),
        ("c011", None, None, Some(11.0), None),
        (
            "[Group] Title - 011",
            Some("Title"),
            None,
            Some(11.0),
            Some("Group"),
        ),
        (
            "[Moonbeam TL] The Moonlit Bookshop - 041 [v2]",
            Some("The Moonlit Bookshop"),
            None,
            Some(41.0),
            Some("Moonbeam TL"),
        ),
        (
            "The Moonlit Bookshop - c041 (v05) [Paper Lantern Scans]",
            Some("The Moonlit Bookshop"),
            None,
            Some(41.0),
            None,
        ),
        (
            "Stardust Relay v03 c012",
            Some("Stardust Relay"),
            Some(3.0),
            Some(12.0),
            None,
        ),
        (
            "Stardust_Relay_v03c012",
            Some("Stardust Relay"),
            Some(3.0),
            Some(12.0),
            None,
        ),
        (
            "Ash and Ember c140.5",
            Some("Ash and Ember"),
            None,
            Some(140.5),
            None,
        ),
        (
            "Ash and Ember - Chapter 88",
            Some("Ash and Ember"),
            None,
            Some(88.0),
            None,
        ),
        (
            "Ash and Ember - Chapter 88 - Smoke Signals",
            Some("Ash and Ember"),
            None,
            Some(88.0),
            None,
        ),
        (
            "Akane Signal Volume 4",
            Some("Akane Signal"),
            Some(4.0),
            None,
            None,
        ),
        (
            "Akane Signal v04 (2019) (Digital) (1r0n)",
            Some("Akane Signal"),
            Some(4.0),
            None,
            None,
        ),
        (
            "Sumire Archive Vol. 1 Ch. 5",
            Some("Sumire Archive"),
            Some(1.0),
            Some(5.0),
            None,
        ),
        (
            "Sumire Archive 005",
            Some("Sumire Archive"),
            None,
            Some(5.0),
            None,
        ),
        (
            "Mob Psycho 100 - 001",
            Some("Mob Psycho 100"),
            None,
            Some(1.0),
            None,
        ),
        ("001", None, None, Some(1.0), None),
        ("Ch.001-005", None, None, Some(1.0), None),
        (
            "Kuroshio Divers #12",
            Some("Kuroshio Divers"),
            None,
            Some(12.0),
            None,
        ),
        (
            "(Nocna Biblioteka) Jade Lantern - 039",
            Some("Jade Lantern"),
            None,
            Some(39.0),
            Some("Nocna Biblioteka"),
        ),
        (
            "Wiedźma z Bieszczad - Tom 1 Rozdział 3",
            Some("Wiedźma z Bieszczad"),
            Some(1.0),
            Some(3.0),
            None,
        ),
        (
            "Wiedźma z Bieszczad rozdz. 12",
            Some("Wiedźma z Bieszczad"),
            None,
            Some(12.0),
            None,
        ),
        (
            "Szklany Smok t02 r009",
            Some("Szklany Smok"),
            Some(2.0),
            Some(9.0),
            None,
        ),
        (
            "Szklany Smok - Rozdzial 7,5",
            Some("Szklany Smok"),
            None,
            Some(7.5),
            None,
        ),
        (
            "Żółć i Gęśl Tom 3",
            Some("Żółć i Gęśl"),
            Some(3.0),
            None,
            None,
        ),
        (
            "[Grupa Kitsune] Łąka Snów - 017",
            Some("Łąka Snów"),
            None,
            Some(17.0),
            Some("Grupa Kitsune"),
        ),
        (
            "月夜の書店 第3巻",
            Some("月夜の書店"),
            Some(3.0),
            None,
            None,
        ),
        (
            "月夜の書店 第11話",
            Some("月夜の書店"),
            None,
            Some(11.0),
            None,
        ),
        (
            "Matsuri Ronin Ep 7",
            Some("Matsuri Ronin"),
            None,
            Some(7.0),
            None,
        ),
        (
            "Sakura Debug Oneshot",
            Some("Sakura Debug Oneshot"),
            None,
            None,
            None,
        ),
        (
            "The Ice Garden (2018) [Digital-HD]",
            Some("The Ice Garden"),
            None,
            None,
            None,
        ),
        (
            "Chainsaw Notes c003",
            Some("Chainsaw Notes"),
            None,
            Some(3.0),
            None,
        ),
    ];

    #[test]
    fn real_world_names_parse() {
        assert!(NAMES.len() >= 25);
        let mut failures = Vec::new();
        for (name, title, volume, chapter, group) in NAMES {
            let parsed = parse_name(name);
            let expected = (
                title.map(str::to_owned),
                *volume,
                *chapter,
                group.map(str::to_owned),
            );
            let got = (
                parsed.title.clone(),
                parsed.volume,
                parsed.chapter,
                parsed.group.clone(),
            );
            if expected != got {
                failures.push(format!("{name:?}: expected {expected:?}, got {got:?}"));
            }
        }
        assert!(failures.is_empty(), "\n{}", failures.join("\n"));
    }

    #[test]
    fn chapter_titles_come_after_the_number() {
        assert_eq!(
            parse_name("Vol.02 Ch.011 - The Night Customer")
                .chapter_title
                .as_deref(),
            Some("The Night Customer")
        );
        assert_eq!(parse_name("[Group] Title - 011").chapter_title, None);
    }

    #[test]
    fn title_keys_fold_case_and_punctuation_but_keep_diacritics() {
        assert_eq!(title_key("The  Moonlit-Bookshop!"), "the moonlit bookshop");
        assert_eq!(title_key("Wiedźma z Bieszczad"), "wiedźma z bieszczad");
        assert_ne!(title_key("Wiedźma"), title_key("Wiedzma"));
    }

    #[test]
    fn folder_names_lose_their_tags() {
        assert_eq!(
            clean_title("[Group] The Title (2019) [Digital]"),
            "The Title"
        );
        assert_eq!(clean_title("Ash_and_Ember"), "Ash and Ember");
        assert_eq!(clean_title("[only tags]"), "[only tags]");
    }
}
