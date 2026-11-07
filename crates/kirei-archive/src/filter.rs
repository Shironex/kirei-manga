use kirei_core::ImageFormat;

/// Decides whether an entry is a page and returns its format.
///
/// `name` uses `/` separators (backslashes from Windows-made archives are
/// normalised by [`normalize_name`] first). Skips directories, macOS resource
/// forks (`__MACOSX/`, `._name`), Finder and Explorer metadata, hidden files,
/// and anything whose extension is not an image.
pub(crate) fn page_format(name: &str) -> Option<ImageFormat> {
    if name.ends_with('/') {
        return None;
    }
    if name.split('/').any(|part| part == "__MACOSX") {
        return None;
    }
    let file_name = name.rsplit('/').next().unwrap_or(name);
    if file_name.starts_with('.') || file_name.eq_ignore_ascii_case("thumbs.db") {
        return None;
    }
    let (_, ext) = file_name.rsplit_once('.')?;
    ImageFormat::from_extension(ext)
}

/// True for a `ComicInfo.xml` at the root or one folder down (archives often
/// wrap everything in a single top folder). Any case.
pub(crate) fn is_comic_info(name: &str) -> bool {
    let mut parts = name.rsplit('/');
    let file_name = parts.next().unwrap_or(name);
    let depth = parts.count();
    depth <= 1
        && file_name.eq_ignore_ascii_case("comicinfo.xml")
        && !name.split('/').any(|part| part == "__MACOSX")
}

/// Turns an archive entry name into a safe relative name with `/` separators,
/// or `None` when it is absolute or climbs out of the archive root. Nothing is
/// ever written to disk, but a name like `../../x.jpg` is still a sign of a
/// crafted archive and is dropped rather than shown.
pub(crate) fn normalize_name(raw: &str) -> Option<String> {
    let unified = raw.replace('\\', "/");
    if unified.starts_with('/') || unified.contains('\0') || has_drive_prefix(&unified) {
        return None;
    }
    let mut parts: Vec<&str> = Vec::new();
    for part in unified.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            other => parts.push(other),
        }
    }
    if parts.is_empty() {
        return None;
    }
    let mut name = parts.join("/");
    if unified.ends_with('/') {
        name.push('/');
    }
    Some(name)
}

fn has_drive_prefix(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_images_in_any_case() {
        assert_eq!(page_format("ch1/001.JPG"), Some(ImageFormat::Jpeg));
        assert_eq!(page_format("002.webp"), Some(ImageFormat::Webp));
        assert_eq!(page_format("strona_ąę.png"), Some(ImageFormat::Png));
    }

    #[test]
    fn skips_junk_and_non_images() {
        for name in [
            "__MACOSX/ch1/._001.jpg",
            "ch1/__MACOSX/001.jpg",
            "ch1/._001.jpg",
            ".DS_Store",
            "ch1/.DS_Store",
            "Thumbs.db",
            "ComicInfo.xml",
            "readme.txt",
            "ch1/",
            "noextension",
        ] {
            assert_eq!(page_format(name), None, "{name} should be skipped");
        }
    }

    #[test]
    fn finds_comic_info_near_the_root() {
        assert!(is_comic_info("ComicInfo.xml"));
        assert!(is_comic_info("comicinfo.XML"));
        assert!(is_comic_info("Chapter 1/ComicInfo.xml"));
        assert!(!is_comic_info("a/b/ComicInfo.xml"));
        assert!(!is_comic_info("__MACOSX/ComicInfo.xml"));
        assert!(!is_comic_info("ComicInfo.txt"));
    }

    #[test]
    fn normalizes_separators_and_dots() {
        assert_eq!(
            normalize_name("ch1\\001.jpg").as_deref(),
            Some("ch1/001.jpg")
        );
        assert_eq!(
            normalize_name("./ch1//001.jpg").as_deref(),
            Some("ch1/001.jpg")
        );
        assert_eq!(
            normalize_name("ch1/x/../001.jpg").as_deref(),
            Some("ch1/001.jpg")
        );
        assert_eq!(normalize_name("ch1/").as_deref(), Some("ch1/"));
    }

    #[test]
    fn rejects_escaping_names() {
        for name in [
            "../001.jpg",
            "ch1/../../001.jpg",
            "/etc/passwd",
            "C:\\x.jpg",
            "a\0b.jpg",
        ] {
            assert_eq!(normalize_name(name), None, "{name} should be rejected");
        }
    }
}
