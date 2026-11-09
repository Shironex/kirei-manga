//! `ComicInfo.xml` for a downloaded chapter (the Anansi schema v2.0 that
//! ComicRack, Komga, Kavita and the KireiManga library read).
//!
//! Elements follow the schema's order. Credits go to the scanlation groups
//! (the uploader when there is none) as both `Translator` and
//! `ScanInformation`; `Web` links the series page first and the chapter
//! second, and the library reads the MangaDex series id back from it.

use kirei_mangadex::{Chapter, ContentRating, Manga};
use quick_xml::escape::escape;

use crate::naming::credits;

fn element(xml: &mut String, name: &str, value: Option<&str>) {
    if let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) {
        xml.push_str("  <");
        xml.push_str(name);
        xml.push('>');
        xml.push_str(&escape(value));
        xml.push_str("</");
        xml.push_str(name);
        xml.push_str(">\n");
    }
}

fn age_rating(rating: ContentRating) -> &'static str {
    match rating {
        ContentRating::Safe => "Everyone",
        ContentRating::Suggestive => "Teen",
        ContentRating::Erotica => "Mature 17+",
        ContentRating::Pornographic => "Adults Only 18+",
    }
}

/// Builds the XML. `series_title` is the title the folder was named after,
/// `languages` the reader's chain (for the summary), `pages` the page count.
pub fn comic_info_xml(
    chapter: &Chapter,
    manga: &Manga,
    series_title: &str,
    languages: &[String],
    pages: usize,
) -> String {
    let names = |people: &[kirei_mangadex::Person]| {
        let joined = people
            .iter()
            .map(|person| person.name.trim())
            .filter(|name| !name.is_empty())
            .collect::<Vec<_>>()
            .join(", ");
        (!joined.is_empty()).then_some(joined)
    };
    let genres = manga
        .tags
        .iter()
        .filter(|tag| tag.group == "genre")
        .filter_map(|tag| tag.name.best(&[]).map(|(_, name)| name.to_owned()))
        .collect::<Vec<_>>()
        .join(", ");
    let summary = manga.description.best(languages).map(|(_, text)| text);
    let credits = credits(chapter);
    let web = format!("{} {}", manga.web_url(), chapter.web_url());
    let year = manga.year.map(|year| year.to_string());
    let page_count = pages.to_string();
    let reading = if manga.original_language == "ja" {
        "YesAndRightToLeft"
    } else {
        "Yes"
    };
    let notes = format!(
        "Downloaded from MangaDex. Series {}, chapter {}.",
        manga.id, chapter.id
    );

    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<ComicInfo xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\">\n",
    );
    element(&mut xml, "Title", chapter.title.as_deref());
    element(&mut xml, "Series", Some(series_title));
    element(&mut xml, "Number", chapter.chapter.as_deref());
    element(&mut xml, "Volume", chapter.volume.as_deref());
    element(&mut xml, "Summary", summary);
    element(&mut xml, "Notes", Some(&notes));
    element(&mut xml, "Year", year.as_deref());
    element(&mut xml, "Writer", names(&manga.authors).as_deref());
    element(&mut xml, "Penciller", names(&manga.artists).as_deref());
    element(&mut xml, "Translator", credits.as_deref());
    element(&mut xml, "Genre", Some(&genres));
    element(&mut xml, "Web", Some(&web));
    element(&mut xml, "PageCount", Some(&page_count));
    element(&mut xml, "LanguageISO", Some(&chapter.language));
    element(&mut xml, "Manga", Some(reading));
    element(&mut xml, "ScanInformation", credits.as_deref());
    element(
        &mut xml,
        "AgeRating",
        Some(age_rating(manga.content_rating)),
    );
    // No <Pages> list: marking page 0 as the front cover would stop the
    // library from skipping a wide credits page when it picks a cover.
    xml.push_str("</ComicInfo>\n");
    xml
}
