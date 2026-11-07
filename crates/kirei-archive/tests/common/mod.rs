//! Fixture builders. Every image and archive the tests use is generated here,
//! at test time, from flat colours: no third-party artwork is checked in.

#![allow(dead_code, unreachable_pub)]

use std::fs::File;
use std::io::Write;
use std::path::Path;

use zip::write::SimpleFileOptions;

/// A valid RGB PNG of `width` x `height`, filled with a colour derived from
/// `seed` so different pages have different bytes.
pub fn png(width: u32, height: u32, seed: u8) -> Vec<u8> {
    // Each scanline: filter byte 0 (none), then RGB triples.
    let mut row = vec![0u8];
    for _ in 0..width {
        row.extend_from_slice(&[seed, seed.wrapping_mul(3), 255 - seed]);
    }
    let raw = row.repeat(height as usize);

    let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.extend_from_slice(&[8, 2, 0, 0, 0]);
    chunk(&mut out, b"IHDR", &ihdr);
    chunk(&mut out, b"IDAT", &zlib_stored(&raw));
    chunk(&mut out, b"IEND", &[]);
    out
}

fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    out.extend_from_slice(kind);
    out.extend_from_slice(data);
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(kind);
    hasher.update(data);
    out.extend_from_slice(&hasher.finalize().to_be_bytes());
}

/// zlib stream made of uncompressed deflate blocks.
fn zlib_stored(data: &[u8]) -> Vec<u8> {
    let mut out = vec![0x78, 0x01];
    let mut blocks = data.chunks(65_535).peekable();
    if blocks.peek().is_none() {
        out.extend_from_slice(&[1, 0, 0, 0xff, 0xff]);
    }
    while let Some(block) = blocks.next() {
        let last = u8::from(blocks.peek().is_none());
        let len = block.len() as u16;
        out.push(last);
        out.extend_from_slice(&len.to_le_bytes());
        out.extend_from_slice(&(!len).to_le_bytes());
        out.extend_from_slice(block);
    }
    let (mut a, mut b) = (1u32, 0u32);
    for &byte in data {
        a = (a + u32::from(byte)) % 65_521;
        b = (b + a) % 65_521;
    }
    out.extend_from_slice(&((b << 16) | a).to_be_bytes());
    out
}

/// A JPEG header (SOI, APP0, SOF0, EOI) that declares `width` x `height`.
/// Enough for header parsing; not meant to be decoded.
pub fn jpeg_header(width: u16, height: u16) -> Vec<u8> {
    let mut out = vec![0xff, 0xd8];
    out.extend_from_slice(&[
        0xff, 0xe0, 0x00, 0x10, b'J', b'F', b'I', b'F', 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    ]);
    out.extend_from_slice(&[0xff, 0xc0, 0x00, 0x11, 0x08]);
    out.extend_from_slice(&height.to_be_bytes());
    out.extend_from_slice(&width.to_be_bytes());
    out.extend_from_slice(&[3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    out.extend_from_slice(&[0xff, 0xd9]);
    out
}

/// Writes a ZIP with the given (name, bytes) entries, deflated.
pub fn write_zip(path: &Path, entries: &[(&str, Vec<u8>)]) {
    let file = File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (name, bytes) in entries {
        if name.ends_with('/') {
            zip.add_directory(*name, options).unwrap();
        } else {
            zip.start_file(*name, options).unwrap();
            zip.write_all(bytes).unwrap();
        }
    }
    zip.finish().unwrap();
}

/// Writes a RAR of the given format with the given (name, bytes) entries.
pub fn write_rar(path: &Path, version: rars::version::ArchiveVersion, entries: &[(&str, Vec<u8>)]) {
    let mut builder = rars::Builder::new(version);
    for (name, bytes) in entries {
        builder
            .add_bytes(name.as_bytes().to_vec(), bytes.clone(), None, None)
            .unwrap();
    }
    builder.write_to_path(path, None).unwrap();
}

/// The usual mix of pages and junk a real CBZ carries, shuffled out of order.
pub fn chapter_entries() -> Vec<(&'static str, Vec<u8>)> {
    vec![
        ("ch1/page10.png", png(40, 60, 10)),
        ("ch1/page2.png", png(40, 60, 2)),
        ("ch1/page1.png", png(40, 60, 1)),
        ("ch1/cover.jpg", jpeg_header(1200, 1800)),
        ("ComicInfo.xml", b"<ComicInfo/>".to_vec()),
        ("__MACOSX/ch1/._page1.png", b"resource fork".to_vec()),
        ("ch1/.DS_Store", b"finder".to_vec()),
        ("ch1/Thumbs.db", b"explorer".to_vec()),
    ]
}

/// Names `chapter_entries` should produce, in reading order.
pub const CHAPTER_ORDER: [&str; 4] = [
    "ch1/cover.jpg",
    "ch1/page1.png",
    "ch1/page2.png",
    "ch1/page10.png",
];
