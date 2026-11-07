//! The reader's page pipeline: a byte-bounded LRU of page bytes and a pool of
//! read-ahead workers that fill it around the page being read.
//!
//! The protocol handler asks [`Reader::page`] for a page and gets cached bytes
//! when the read-ahead got there first. Navigation calls [`Reader::focus`],
//! which throws away every queued job from the previous position before
//! queueing the new window, so flipping fast never builds a backlog of pages
//! nobody will look at.
//!
//! Pages are cached as the encoded bytes the archive holds. Decoding and
//! viewport-sized downscaling plug in at the same seam later.

mod cache;
mod read_ahead;

pub use cache::{PageBytes, PageCache, PageKey, SourceId};
pub use read_ahead::{Direction, ReadAheadConfig, Reader, ReaderStats};
