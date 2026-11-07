/// Ceilings that keep a hostile or broken archive from exhausting memory.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Limits {
    /// Largest single page, uncompressed. Enforced while reading, so an entry
    /// whose header understates its size is still cut off.
    pub max_entry_bytes: u64,
    /// Most image pages a source may list.
    pub max_pages: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            // A 600 dpi double spread PNG stays well under this.
            max_entry_bytes: 256 * 1024 * 1024,
            max_pages: 20_000,
        }
    }
}

/// How [`crate::open_with`] reads a source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenOptions {
    pub limits: Limits,
    /// Read each page's pixel size from its header while opening. ZIP and
    /// folders read only a small prefix of each page; RAR has no partial read,
    /// so probing there decompresses every page once.
    pub probe_dimensions: bool,
}

impl Default for OpenOptions {
    fn default() -> Self {
        Self {
            limits: Limits::default(),
            probe_dimensions: true,
        }
    }
}

/// Reads a whole entry, refusing it once it passes `max` bytes. `declared` is
/// the size the container claims and is only trusted to reject early and to
/// size the buffer; the cut-off itself is applied to the bytes actually read.
pub(crate) fn read_capped(
    reader: &mut impl std::io::Read,
    name: &str,
    declared: u64,
    max: u64,
) -> crate::Result<Vec<u8>> {
    use std::io::Read as _;

    if declared > max {
        return Err(crate::ArchiveError::EntryTooLarge {
            name: name.to_owned(),
            size: declared,
            max,
        });
    }
    let capacity = usize::try_from(declared).unwrap_or(0).min(64 * 1024 * 1024);
    let mut bytes = Vec::with_capacity(capacity);
    reader
        .take(max.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|source| crate::ArchiveError::Io {
            path: name.into(),
            source,
        })?;
    if bytes.len() as u64 > max {
        return Err(crate::ArchiveError::EntryTooLarge {
            name: name.to_owned(),
            size: bytes.len() as u64,
            max,
        });
    }
    Ok(bytes)
}
