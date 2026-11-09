// Tests may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

mod common;

use common::{CHAPTER_PL_1, MOONLIT, NIGHT_TRAIN, USER_AGENT, client, fixture, json};
use kirei_mangadex::{
    ChapterListOptions, ContentRating, CoverSize, Demographic, LanguageOutcome, LanguagePrefs,
    MangaDexError, PublicationStatus, SearchQuery,
};
use wiremock::matchers::{header, method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

#[tokio::test]
async fn search_sends_the_reader_filters_and_parses_results() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/manga"))
        .and(header("user-agent", USER_AGENT))
        .and(query_param("title", "moonlit"))
        .and(query_param("availableTranslatedLanguage[]", "pl"))
        .and(query_param("contentRating[]", "safe"))
        .and(query_param("includes[]", "cover_art"))
        .and(query_param("order[relevance]", "desc"))
        .respond_with(json("search_manga.json"))
        .expect(1)
        .mount(&server)
        .await;

    let md = client(&server);
    let page = md.search(&SearchQuery::title("moonlit")).await.unwrap();
    assert_eq!(page.total, 2);
    assert!(!page.has_more());

    let moonlit = &page.items[0];
    assert_eq!(
        moonlit.display_title(md.languages().chain()),
        Some("The Moonlit Bookshop")
    );
    assert_eq!(
        moonlit.description.best(md.languages().chain()).unwrap().0,
        "pl"
    );
    assert_eq!(moonlit.status, Some(PublicationStatus::Ongoing));
    assert_eq!(moonlit.demographic, Some(Demographic::Seinen));
    assert_eq!(moonlit.content_rating, ContentRating::Safe);
    assert_eq!(moonlit.anilist_id(), Some(123_456));
    assert_eq!(moonlit.authors[0].name, "Hinata Okawa");
    assert_eq!(moonlit.artists.len(), 1);
    assert_eq!(moonlit.last_chapter, None);
    let cover = moonlit.cover.as_ref().unwrap();
    assert_eq!(cover.volume.as_deref(), Some("1"));

    // The second series has the API's loose shapes: `[]` for an empty
    // description and links, relationships without attributes.
    let night = &page.items[1];
    assert!(night.description.is_empty());
    assert!(night.links.is_empty());
    assert!(night.cover.is_none());
    assert_eq!(night.authors[0].name, "");
    assert_eq!(
        night.display_title(&["pl".into()]),
        Some("Yakou Ressha Nikki")
    );
}

#[tokio::test]
async fn hot_reads_are_served_from_the_cache() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path(format!("/manga/{MOONLIT}")))
        .respond_with(json("manga.json"))
        .expect(1)
        .mount(&server)
        .await;

    let md = client(&server);
    let first = md.manga(MOONLIT).await.unwrap();
    let second = md.manga(MOONLIT).await.unwrap();
    assert_eq!(first, second);

    // A manual refresh goes back to the server.
    md.clear_cache();
    server.reset().await;
    Mock::given(method("GET"))
        .and(path(format!("/manga/{MOONLIT}")))
        .respond_with(json("manga.json"))
        .expect(1)
        .mount(&server)
        .await;
    md.manga(MOONLIT).await.unwrap();
}

#[tokio::test]
async fn cover_urls_follow_the_uploads_layout() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path(format!("/manga/{MOONLIT}")))
        .respond_with(json("manga.json"))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(format!(
            "/uploads/covers/{MOONLIT}/c0ffee00-1111-4222-8333-444455556666.jpg.256.jpg"
        )))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(vec![0xFF, 0xD8, 0xFF]))
        .expect(1)
        .mount(&server)
        .await;

    let md = client(&server);
    let manga = md.manga(MOONLIT).await.unwrap();
    let cover = manga.cover.unwrap();
    let url = md.cover_url(MOONLIT, &cover, CoverSize::Medium512).unwrap();
    assert!(url.as_str().ends_with(&format!(
        "/uploads/covers/{MOONLIT}/c0ffee00-1111-4222-8333-444455556666.jpg.512.jpg"
    )));
    let bytes = md
        .cover(MOONLIT, &cover, CoverSize::Small256)
        .await
        .unwrap();
    assert_eq!(&bytes[..], &[0xFF, 0xD8, 0xFF]);
}

#[tokio::test]
async fn polish_chapters_win_and_gaps_fall_back_to_english() {
    let server = MockServer::start().await;
    let feed = format!("/manga/{MOONLIT}/feed");
    Mock::given(method("GET"))
        .and(path(&feed))
        .and(query_param("offset", "0"))
        .and(query_param("limit", "500"))
        .and(query_param("translatedLanguage[]", "pl"))
        .and(query_param("translatedLanguage[]", "en"))
        .and(query_param("includes[]", "scanlation_group"))
        .and(query_param("order[chapter]", "asc"))
        .respond_with(json("feed_page1.json"))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(&feed))
        .and(query_param("offset", "2"))
        .respond_with(json("feed_page2.json"))
        .expect(1)
        .mount(&server)
        .await;

    let md = client(&server);
    let result = md
        .chapters(MOONLIT, ChapterListOptions::default())
        .await
        .unwrap();
    let picked: Vec<(&str, &str)> = result
        .chapters
        .iter()
        .map(|c| (c.chapter.as_deref().unwrap(), c.language.as_str()))
        .collect();
    assert_eq!(picked, [("1", "pl"), ("2", "en"), ("3", "pl")]);
    assert_eq!(
        result.outcome,
        LanguageOutcome::Mixed {
            preferred_count: 2,
            fallback_count: 1,
            fallback_languages: vec!["en".into()],
        }
    );
    assert!(result.used_fallback());

    // Credits: the group on a grouped chapter, the uploader on the other.
    let first = &result.chapters[0];
    assert_eq!(first.groups[0].name, "Nocne Tłumaczenia");
    assert_eq!(
        first.groups[0].website.as_deref(),
        Some("https://nocne.example")
    );
    assert_eq!(first.manga_id.as_deref(), Some(MOONLIT));
    let third = &result.chapters[2];
    assert!(third.groups.is_empty());
    assert_eq!(
        third.uploader.as_ref().unwrap().username.as_deref(),
        Some("kasia")
    );
    assert_eq!(third.title, None);
}

#[tokio::test]
async fn says_when_only_the_fallback_language_has_chapters() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path(format!("/manga/{NIGHT_TRAIN}/feed")))
        .respond_with(json("feed_english_only.json"))
        .mount(&server)
        .await;

    let md = client(&server);
    let result = md
        .chapters(NIGHT_TRAIN, ChapterListOptions::default())
        .await
        .unwrap();
    assert_eq!(result.preferred, "pl");
    assert_eq!(
        result.outcome,
        LanguageOutcome::FallbackOnly {
            languages: vec!["en".into()]
        }
    );
}

#[tokio::test]
async fn only_my_language_asks_for_polish_alone() {
    let server = MockServer::start().await;
    // The server only answers a request that names Polish and nothing else.
    Mock::given(method("GET"))
        .and(path(format!("/manga/{NIGHT_TRAIN}/feed")))
        .and(query_param("translatedLanguage[]", "pl"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_string(r#"{"result":"ok","data":[],"limit":500,"offset":0,"total":0}"#),
        )
        .expect(1)
        .mount(&server)
        .await;

    let md = client(&server);
    md.set_languages(LanguagePrefs::new(["pl", "en"], true).unwrap());
    let result = md
        .chapters(NIGHT_TRAIN, ChapterListOptions::default())
        .await
        .unwrap();
    assert_eq!(result.outcome, LanguageOutcome::Nothing);

    let requests = server.received_requests().await.unwrap();
    let query = requests[0].url.query().unwrap();
    assert!(!query.contains("translatedLanguage%5B%5D=en"), "{query}");
}

#[tokio::test]
async fn a_chapter_carries_its_credits() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path(format!("/chapter/{CHAPTER_PL_1}")))
        .and(query_param("includes[]", "user"))
        .respond_with(json("chapter.json"))
        .mount(&server)
        .await;

    let chapter = client(&server).chapter(CHAPTER_PL_1).await.unwrap();
    assert_eq!(chapter.language, "pl");
    assert_eq!(chapter.groups[0].name, "Nocne Tłumaczenia");
    assert!(chapter.is_readable());
    assert_eq!(
        chapter.web_url(),
        format!("https://mangadex.org/chapter/{CHAPTER_PL_1}")
    );
}

#[tokio::test]
async fn tags_parse() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/manga/tag"))
        .respond_with(json("tags.json"))
        .mount(&server)
        .await;
    let tags = client(&server).tags().await.unwrap();
    assert_eq!(tags.len(), 2);
    assert_eq!(tags[1].group, "format");
}

#[tokio::test]
async fn missing_series_are_not_found_errors() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path(format!("/manga/{MOONLIT}")))
        .respond_with(ResponseTemplate::new(404).set_body_string(fixture("error_not_found.json")))
        .mount(&server)
        .await;
    let error = client(&server).manga(MOONLIT).await.unwrap_err();
    assert!(
        matches!(error, MangaDexError::NotFound("manga")),
        "{error:?}"
    );
}

#[tokio::test]
async fn bad_ids_never_reach_the_network() {
    let server = MockServer::start().await;
    let md = client(&server);
    let error = md.manga("../user/me").await.unwrap_err();
    assert!(matches!(error, MangaDexError::InvalidInput(_)));
    assert!(server.received_requests().await.unwrap().is_empty());
}
