use std::io::Read;

/// Header prefix sizes tried in turn. Most formats put their size in the first
/// few dozen bytes; JPEG puts it in the SOF marker, which follows EXIF and ICC
/// blocks that can run to hundreds of kilobytes.
const PROBE_STEPS: [usize; 3] = [16 * 1024, 256 * 1024, 2 * 1024 * 1024];

/// Reads just enough of `reader` to find the image's pixel size.
/// Returns `None` when the header cannot be parsed; never reads past 2 MiB.
pub(crate) fn dimensions_from_reader(reader: &mut impl Read) -> Option<(u32, u32)> {
    let mut buf = Vec::new();
    for step in PROBE_STEPS {
        let want = step.saturating_sub(buf.len()) as u64;
        let before = buf.len();
        reader.by_ref().take(want).read_to_end(&mut buf).ok()?;
        if let Some(size) = dimensions_from_bytes(&buf) {
            return Some(size);
        }
        if buf.len() == before || buf.len() < step {
            return None;
        }
    }
    None
}

/// Pixel size from a buffer that holds at least the image header.
pub(crate) fn dimensions_from_bytes(bytes: &[u8]) -> Option<(u32, u32)> {
    let size = imagesize::blob_size(bytes).ok()?;
    let width = u32::try_from(size.width).ok()?;
    let height = u32::try_from(size.height).ok()?;
    (width > 0 && height > 0).then_some((width, height))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png_header(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n\0\0\0\x0dIHDR".to_vec();
        bytes.extend_from_slice(&width.to_be_bytes());
        bytes.extend_from_slice(&height.to_be_bytes());
        bytes.extend_from_slice(&[8, 2, 0, 0, 0, 0, 0, 0, 0]);
        bytes
    }

    #[test]
    fn reads_png_size_from_the_header() {
        let header = png_header(800, 1200);
        assert_eq!(dimensions_from_bytes(&header), Some((800, 1200)));
        assert_eq!(
            dimensions_from_reader(&mut header.as_slice()),
            Some((800, 1200))
        );
    }

    #[test]
    fn garbage_has_no_size() {
        assert_eq!(dimensions_from_reader(&mut &b"not an image"[..]), None);
        assert_eq!(dimensions_from_bytes(&[]), None);
    }
}
