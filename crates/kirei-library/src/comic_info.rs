//! The fields of `ComicInfo.xml` (the Anansi schema used by ComicRack, Komga,
//! Kavita and most downloaders) that the library stores.

use quick_xml::Reader;
use quick_xml::events::Event;

/// Parsed `ComicInfo.xml`. Every field is optional; empty elements are `None`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ComicInfo {
    pub series: Option<String>,
    pub title: Option<String>,
    pub number: Option<f64>,
    pub volume: Option<f64>,
    pub summary: Option<String>,
    pub writer: Option<String>,
    pub year: Option<i64>,
    pub language: Option<String>,
    pub genres: Vec<String>,
    /// `<Manga>`: `Yes`, `No` or `YesAndRightToLeft`.
    pub manga: Option<String>,
    pub scan_group: Option<String>,
    /// Index of the page marked `Type="FrontCover"`, if any.
    pub front_cover: Option<usize>,
    /// `<Web>`: one or more links, separated by spaces.
    pub web: Option<String>,
    /// The MangaDex series id, read from a `mangadex.org/title/<id>` link in
    /// `<Web>`. Downloaded chapters carry it so the library can tie them to
    /// the series online.
    pub mangadex_id: Option<String>,
}

/// Parses the XML. Malformed input yields whatever was read before the error,
/// so one broken tag never hides the rest of a chapter.
pub fn parse(bytes: &[u8]) -> ComicInfo {
    let mut info = ComicInfo::default();
    let mut reader = Reader::from_reader(bytes);
    let mut buf = Vec::new();
    let mut path: Vec<String> = Vec::new();
    // Text of the current element. Entity references arrive as their own
    // events, so text is gathered piece by piece and assigned on close.
    let mut text = String::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(start)) => {
                path.push(start.local_name().as_ref().to_owned());
                text.clear();
            }
            Ok(Event::End(_)) => {
                if path.len() == 2 {
                    assign(&mut info, &path[1], text.trim());
                }
                path.pop();
                text.clear();
            }
            Ok(Event::Empty(element)) => {
                if element.local_name().as_ref() == "Page" && info.front_cover.is_none() {
                    read_page(&element, &mut info);
                }
            }
            Ok(Event::Text(chunk)) => text.push_str(&chunk.xml10_content()),
            Ok(Event::CData(chunk)) => text.push_str(&chunk.xml10_content()),
            Ok(Event::GeneralRef(reference)) => {
                if let Ok(Some(c)) = reference.resolve_char_ref() {
                    text.push(c);
                } else if let Some(resolved) =
                    quick_xml::escape::resolve_predefined_entity(&reference)
                {
                    text.push_str(resolved);
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            Ok(_) => {}
        }
        buf.clear();
    }
    info
}

fn read_page(element: &quick_xml::events::BytesStart<'_>, info: &mut ComicInfo) {
    let mut image = None;
    let mut front = false;
    for attr in element.attributes().flatten() {
        let value = attr.value.trim();
        match attr.key.local_name().as_ref() {
            "Image" => image = value.parse::<usize>().ok(),
            "Type" => front = value.eq_ignore_ascii_case("FrontCover"),
            _ => {}
        }
    }
    if front {
        info.front_cover = image;
    }
}

fn assign(info: &mut ComicInfo, field: &str, value: &str) {
    if value.is_empty() {
        return;
    }
    let text = || Some(value.to_owned());
    match field {
        "Series" => info.series = text(),
        "Title" => info.title = text(),
        "Number" => info.number = value.replace(',', ".").parse().ok(),
        "Volume" => info.volume = value.replace(',', ".").parse().ok(),
        "Summary" => info.summary = text(),
        "Writer" => info.writer = text(),
        "Year" => info.year = value.parse().ok().filter(|y: &i64| *y > 0),
        "LanguageISO" => info.language = text(),
        "Genre" => {
            info.genres = value
                .split(',')
                .map(str::trim)
                .filter(|g| !g.is_empty())
                .map(str::to_owned)
                .collect();
        }
        "Manga" => info.manga = text(),
        "ScanInformation" | "Translator" if info.scan_group.is_none() => info.scan_group = text(),
        "Web" => {
            info.web = text();
            info.mangadex_id = value.split_whitespace().find_map(mangadex_title_id);
        }
        _ => {}
    }
}

/// The series id in a `https://mangadex.org/title/<id>[/slug]` link.
fn mangadex_title_id(link: &str) -> Option<String> {
    let rest = link
        .strip_prefix("https://")
        .or_else(|| link.strip_prefix("http://"))?;
    let rest = rest.strip_prefix("www.").unwrap_or(rest);
    let id = rest
        .strip_prefix("mangadex.org/title/")?
        .split(['/', '?', '#'])
        .next()?;
    let valid = id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    valid.then(|| id.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Series>Wiedźma z Bieszczad</Series>
  <Title>Księga długów</Title>
  <Number>3.5</Number>
  <Volume>1</Volume>
  <Summary>A young witch &amp; her forest.</Summary>
  <Writer>Agata Wróbel</Writer>
  <Year>2024</Year>
  <LanguageISO>pl</LanguageISO>
  <Genre>Folk horror, Fantasy ,</Genre>
  <Manga>No</Manga>
  <ScanInformation>Grupa Kitsune</ScanInformation>
  <Pages>
    <Page Image="0" Type="InnerCover"/>
    <Page Image="1" Type="FrontCover"/>
  </Pages>
</ComicInfo>"#;

    #[test]
    fn reads_the_fields_the_library_stores() {
        let info = parse(SAMPLE.as_bytes());
        assert_eq!(info.series.as_deref(), Some("Wiedźma z Bieszczad"));
        assert_eq!(info.title.as_deref(), Some("Księga długów"));
        assert_eq!(info.number, Some(3.5));
        assert_eq!(info.volume, Some(1.0));
        assert_eq!(info.summary.as_deref(), Some("A young witch & her forest."));
        assert_eq!(info.year, Some(2024));
        assert_eq!(info.language.as_deref(), Some("pl"));
        assert_eq!(info.genres, vec!["Folk horror", "Fantasy"]);
        assert_eq!(info.manga.as_deref(), Some("No"));
        assert_eq!(info.scan_group.as_deref(), Some("Grupa Kitsune"));
        assert_eq!(info.front_cover, Some(1));
    }

    #[test]
    fn reads_the_mangadex_id_from_the_web_links() {
        let info = parse(
            br#"<ComicInfo><Web>https://mangadex.org/chapter/5c0a1b2c-0000-4000-8000-000000000001 https://mangadex.org/title/0B1F2C3D-0000-4000-8000-000000000001/moonlit</Web></ComicInfo>"#,
        );
        assert_eq!(
            info.mangadex_id.as_deref(),
            Some("0b1f2c3d-0000-4000-8000-000000000001")
        );
        assert!(
            info.web
                .as_deref()
                .is_some_and(|web| web.contains("/chapter/"))
        );
        let other = parse(b"<ComicInfo><Web>https://example.org/title/x</Web></ComicInfo>");
        assert_eq!(other.mangadex_id, None);
        assert_eq!(mangadex_title_id("https://mangadex.org/title/short"), None);
    }

    #[test]
    fn empty_and_broken_input_never_panics() {
        assert_eq!(parse(b""), ComicInfo::default());
        assert_eq!(parse(b"<ComicInfo/>"), ComicInfo::default());
        let partial = parse(b"<ComicInfo><Series>Half</Series><Title>unterminated");
        assert_eq!(partial.series.as_deref(), Some("Half"));
        assert_eq!(parse(b"\xff\xfe garbage <<<").series, None);
    }

    #[test]
    fn nested_elements_do_not_leak_into_fields() {
        let info = parse(b"<ComicInfo><Pages><Series>nope</Series></Pages></ComicInfo>");
        assert_eq!(info.series, None);
    }
}
