//! Fixture builders. Every image and archive is generated at test time from
//! flat colours: no third-party artwork is checked in.

#![allow(dead_code, unreachable_pub)]

use std::io::{Cursor, Write};
use std::path::Path;

use zip::write::SimpleFileOptions;

/// A PNG of one flat colour.
pub fn png(width: u32, height: u32, rgb: [u8; 3]) -> Vec<u8> {
    let image = image::RgbImage::from_pixel(width, height, image::Rgb(rgb));
    let mut out = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
        .unwrap();
    out
}

/// Writes a CBZ with `pages` flat pages of `rgb`, plus an optional
/// `ComicInfo.xml`. Pages are stored, not deflated, to keep fixtures fast.
pub fn cbz(path: &Path, pages: usize, rgb: [u8; 3], comic_info: Option<&str>) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    let mut zip = zip::ZipWriter::new(std::fs::File::create(path).unwrap());
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let page = png(60, 90, rgb);
    for i in 0..pages {
        zip.start_file(format!("{i:03}.png"), options).unwrap();
        zip.write_all(&page).unwrap();
    }
    if let Some(xml) = comic_info {
        zip.start_file("ComicInfo.xml", options).unwrap();
        zip.write_all(xml.as_bytes()).unwrap();
    }
    zip.finish().unwrap();
}

/// Writes a folder of `pages` flat PNG pages.
pub fn image_folder(path: &Path, pages: usize, rgb: [u8; 3]) {
    std::fs::create_dir_all(path).unwrap();
    let page = png(60, 90, rgb);
    for i in 0..pages {
        std::fs::write(path.join(format!("{i:03}.png")), &page).unwrap();
    }
}

/// Every regular file under `dir` with its bytes, for "nothing changed"
/// checks.
pub fn snapshot(dir: &Path) -> Vec<(String, Vec<u8>, std::time::SystemTime)> {
    let mut out = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(next) = stack.pop() {
        for entry in std::fs::read_dir(&next).unwrap() {
            let entry = entry.unwrap();
            let meta = entry.metadata().unwrap();
            if meta.is_dir() {
                stack.push(entry.path());
            } else {
                out.push((
                    entry.path().to_string_lossy().into_owned(),
                    std::fs::read(entry.path()).unwrap(),
                    meta.modified().unwrap(),
                ));
            }
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out
}
