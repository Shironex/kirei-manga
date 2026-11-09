//! Folder and file names for downloaded chapters, matching the library
//! scanner's rules (`crates/kirei-library/src/naming.rs`):
//!
//! - one folder per series directly inside the downloads root, so the scanner
//!   groups every chapter of a series by its folder;
//! - one archive per chapter, named
//!   `[Group] Vol.02 Ch.011 - Title {5c0a1b2c}.cbz`. The leading tag is read
//!   as the scan group, `Vol.` and `Ch.` give the numbers, the text after
//!   them is the chapter title, and the trailing `{...}` tag (the start of the
//!   MangaDex chapter id) keeps two uploads of one chapter apart and is
//!   dropped by the parser.
//!
//! `ComicInfo.xml` inside the archive carries the same facts and wins over
//! the name, so the name only has to be good enough for other readers and
//! for a human browsing the folder.
//!
//! Names are safe on Windows and macOS: no reserved characters, no leading
//! dot (the scanner skips hidden files), no trailing dot or space, no
//! reserved device names, and a bounded length.

use kirei_mangadex::Chapter;

/// Longest series folder name, in bytes.
const MAX_FOLDER_BYTES: usize = 120;
/// Longest group tag and chapter title inside a file name, in bytes.
const MAX_GROUP_BYTES: usize = 48;
const MAX_TITLE_BYTES: usize = 80;

const RESERVED_NAMES: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Makes one path component safe: characters Windows refuses, brackets the
/// scanner reads as tags, and control characters become spaces; runs of
/// spaces collapse; leading dots and trailing dots or spaces go.
pub fn sanitize(text: &str, max_bytes: usize) -> String {
    let replaced: String = text
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => ' ',
            '[' | ']' | '{' | '}' | '(' | ')' => ' ',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    let collapsed = replaced.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = truncate(collapsed.trim_start_matches('.'), max_bytes);
    let trimmed = trimmed.trim_end_matches(['.', ' ']).trim_start();
    if trimmed.is_empty() {
        return String::new();
    }
    let stem = trimmed.split('.').next().unwrap_or(trimmed);
    if RESERVED_NAMES
        .iter()
        .any(|reserved| stem.eq_ignore_ascii_case(reserved))
    {
        // Windows reserves the device name whatever the extension, so the
        // mark goes on the stem.
        format!("{stem}_{}", &trimmed[stem.len()..])
    } else {
        trimmed.to_owned()
    }
}

/// The longest prefix of `text` within `max_bytes`, cut at a char boundary.
fn truncate(text: &str, max_bytes: usize) -> &str {
    if text.len() <= max_bytes {
        return text;
    }
    let mut end = max_bytes;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

/// The series folder for a title. Falls back to `Untitled`.
pub fn series_folder(title: &str) -> String {
    let name = sanitize(title, MAX_FOLDER_BYTES);
    if name.is_empty() {
        "Untitled".to_owned()
    } else {
        name
    }
}

/// A second folder name for a series whose title collides with another
/// series already in the downloads folder.
pub fn series_folder_with_id(title: &str, manga_id: &str) -> String {
    let short: String = manga_id.chars().take(8).collect();
    format!("{} {short}", series_folder(title))
}

/// `"11"` becomes `011`, `"11.5"` becomes `011.5`, so file names sort in
/// order in any file browser. Text that is not a number is kept as it is.
fn padded(number: &str, width: usize) -> String {
    let number = number.trim();
    let (whole, fraction) = match number.split_once(['.', ',']) {
        Some((whole, fraction)) => (whole, Some(fraction)),
        None => (number, None),
    };
    if whole.is_empty() || !whole.chars().all(|c| c.is_ascii_digit()) {
        return sanitize(number, 16);
    }
    let whole = whole.trim_start_matches('0');
    let whole = if whole.is_empty() { "0" } else { whole };
    match fraction {
        Some(fraction) if !fraction.is_empty() => format!("{whole:0>width$}.{fraction}"),
        _ => format!("{whole:0>width$}"),
    }
}

/// Group names to credit: the scanlation groups, or the uploader when the
/// chapter was posted without one.
pub fn credits(chapter: &Chapter) -> Option<String> {
    let groups: Vec<&str> = chapter
        .groups
        .iter()
        .map(|group| group.name.trim())
        .filter(|name| !name.is_empty())
        .collect();
    if !groups.is_empty() {
        return Some(groups.join(", "));
    }
    chapter
        .uploader
        .as_ref()
        .and_then(|uploader| uploader.username.as_deref())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
}

fn non_empty(text: Option<&str>) -> Option<&str> {
    text.map(str::trim).filter(|text| !text.is_empty())
}

/// The archive name for a chapter: `[Group] Vol.02 Ch.011 - Title {id}.cbz`.
pub fn chapter_file(chapter: &Chapter) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(credits) = credits(chapter) {
        let group = sanitize(&credits.replace(", ", " & "), MAX_GROUP_BYTES);
        if !group.is_empty() {
            parts.push(format!("[{group}]"));
        }
    }
    let volume = non_empty(chapter.volume.as_deref());
    let number = non_empty(chapter.chapter.as_deref());
    if let Some(volume) = volume {
        parts.push(format!("Vol.{}", padded(volume, 2)));
    }
    match number {
        Some(number) => parts.push(format!("Ch.{}", padded(number, 3))),
        None if volume.is_none() => parts.push("Oneshot".to_owned()),
        None => {}
    }
    if let Some(title) = non_empty(chapter.title.as_deref()) {
        let title = sanitize(title, MAX_TITLE_BYTES);
        if !title.is_empty() {
            parts.push(format!("- {title}"));
        }
    }
    let short: String = chapter
        .id
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .take(8)
        .collect();
    parts.push(format!("{{{short}}}"));
    format!("{}.cbz", parts.join(" "))
}

/// `Vol. 2 Ch. 11 · Title`, for the queue list.
pub fn chapter_label(chapter: &Chapter) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(volume) = non_empty(chapter.volume.as_deref()) {
        parts.push(format!("Vol. {volume}"));
    }
    match non_empty(chapter.chapter.as_deref()) {
        Some(number) => parts.push(format!("Ch. {number}")),
        None if parts.is_empty() => parts.push("Oneshot".to_owned()),
        None => {}
    }
    let numbers = parts.join(" ");
    match non_empty(chapter.title.as_deref()) {
        Some(title) => format!("{numbers} \u{b7} {title}"),
        None => numbers,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use kirei_mangadex::{ScanlationGroup, Uploader};

    pub(crate) fn chapter(
        volume: Option<&str>,
        number: Option<&str>,
        title: Option<&str>,
    ) -> Chapter {
        Chapter {
            id: "5c0a1b2c-0000-4000-8000-000000000001".into(),
            manga_id: Some("0b1f2c3d-0000-4000-8000-000000000001".into()),
            title: title.map(str::to_owned),
            volume: volume.map(str::to_owned),
            chapter: number.map(str::to_owned),
            pages: 3,
            language: "pl".into(),
            external_url: None,
            publish_at: None,
            readable_at: None,
            updated_at: None,
            groups: vec![ScanlationGroup {
                id: "g".into(),
                name: "Nocne Tłumaczenia".into(),
                website: None,
                official: false,
            }],
            uploader: Some(Uploader {
                id: "u".into(),
                username: Some("kasia".into()),
            }),
        }
    }

    #[test]
    fn names_carry_group_numbers_title_and_id() {
        let name = chapter_file(&chapter(Some("2"), Some("11.5"), Some("Nocny klient")));
        assert_eq!(
            name,
            "[Nocne Tłumaczenia] Vol.02 Ch.011.5 - Nocny klient {5c0a1b2c}.cbz"
        );
    }

    #[test]
    fn oneshots_and_volume_only_releases_are_named() {
        assert_eq!(
            chapter_file(&chapter(None, None, None)),
            "[Nocne Tłumaczenia] Oneshot {5c0a1b2c}.cbz"
        );
        assert_eq!(
            chapter_file(&chapter(Some("3"), None, None)),
            "[Nocne Tłumaczenia] Vol.03 {5c0a1b2c}.cbz"
        );
    }

    #[test]
    fn the_uploader_is_credited_without_a_group() {
        let mut solo = chapter(None, Some("1"), None);
        solo.groups.clear();
        assert_eq!(credits(&solo).as_deref(), Some("kasia"));
        assert!(chapter_file(&solo).starts_with("[kasia] Ch.001"));
        solo.uploader = None;
        assert_eq!(chapter_file(&solo), "Ch.001 {5c0a1b2c}.cbz");
    }

    #[test]
    fn unsafe_characters_never_reach_the_disk() {
        assert_eq!(
            sanitize("Re:Zero / Part [2] (2019)?", 120),
            "Re Zero Part 2 2019"
        );
        assert_eq!(sanitize("...hidden", 120), "hidden");
        assert_eq!(sanitize("ends with dots...", 120), "ends with dots");
        assert_eq!(sanitize("con", 120), "con_");
        assert_eq!(sanitize("Nul.txt", 120), "Nul_.txt");
        assert_eq!(sanitize("line\nbreak\ttab", 120), "line break tab");
        assert_eq!(series_folder(" ::: "), "Untitled");
    }

    #[test]
    fn long_names_are_cut_at_a_character_boundary() {
        let long = "ż".repeat(200);
        let folder = series_folder(&long);
        assert!(folder.len() <= MAX_FOLDER_BYTES);
        assert!(folder.chars().all(|c| c == 'ż'));
    }

    #[test]
    fn numbers_are_padded_for_sorting() {
        assert_eq!(padded("1", 3), "001");
        assert_eq!(padded("0", 3), "000");
        assert_eq!(padded("120", 3), "120");
        assert_eq!(padded("1234", 3), "1234");
        assert_eq!(padded("7,5", 3), "007.5");
        assert_eq!(padded("Extra", 3), "Extra");
    }

    #[test]
    fn labels_read_well() {
        assert_eq!(
            chapter_label(&chapter(Some("1"), Some("3"), Some("Księga"))),
            "Vol. 1 Ch. 3 \u{b7} Księga"
        );
        assert_eq!(chapter_label(&chapter(None, None, None)), "Oneshot");
    }

    #[test]
    fn a_colliding_series_gets_its_id() {
        assert_eq!(
            series_folder_with_id("Moon", "0b1f2c3d-0000"),
            "Moon 0b1f2c3d"
        );
    }
}
