//! The local library: a SQLite catalogue of series and chapters, the folder
//! scanner that fills it, reading progress, per-series settings, and the
//! on-disk cover cache with the palette each cover seeds the theme with.

mod comic_info;
mod naming;

pub use comic_info::{ComicInfo, parse as parse_comic_info};
pub use naming::{ParsedName, clean_title, parse_name, title_key};
