//! App-wide settings: the typed contract shared by the store in
//! `kirei-library` and the renderer.
//!
//! Every setting has a dotted key (`appearance.strength`) and a JSON value.
//! The struct below is the single source of truth: its field names are the
//! keys, its types are the validation, and [`AppSettings::default`] is what a
//! fresh install sees. Stored values are per key, so adding a setting needs no
//! migration and a key an older build does not know is simply ignored.
//!
//! Keys are documented in `docs/settings.md`. Renaming one is a breaking change
//! for stored data: add a new key instead.

use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Deserializer, Serialize, de::Error as _};
use serde_json::{Map, Value};

/// How much colour the cover in focus brings into the interface.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ThemeStrength {
    Subtle,
    #[default]
    Balanced,
    Vivid,
}

/// Whether interface motion follows the OS setting or is forced either way.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MotionPreference {
    /// Follow `prefers-reduced-motion`.
    #[default]
    System,
    /// Always reduce motion.
    Reduced,
    /// Always animate, whatever the OS says.
    Full,
}

/// Layout a chapter opens in when the series has no saved choice.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReaderMode {
    #[default]
    Single,
    Double,
    Webtoon,
}

/// Page order for paged modes.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReadingDirection {
    /// Right to left, the manga default.
    #[default]
    Rtl,
    Ltr,
}

/// How a page is sized against the window.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PageFit {
    /// The whole page inside the window.
    #[default]
    Screen,
    Width,
    Height,
    /// Stored pixels, no scaling.
    Original,
}

/// Resampling filter for downscaled pages. Mirrors `kirei_reader::Resample`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResampleFilter {
    #[default]
    Lanczos3,
    Mitchell,
    Nearest,
}

/// Chapters downloaded at the same time, 1 to 4. Each chapter keeps a few
/// pages in flight, and every page shares the app wide MangaDex budgets, so
/// more chapters never means faster than MangaDex allows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct DownloadConcurrency(u8);

impl DownloadConcurrency {
    pub const MIN: u8 = 1;
    pub const MAX: u8 = 4;

    pub fn get(self) -> u8 {
        self.0
    }
}

impl Default for DownloadConcurrency {
    fn default() -> Self {
        Self(2)
    }
}

impl<'de> Deserialize<'de> for DownloadConcurrency {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = u8::deserialize(deserializer)?;
        if (Self::MIN..=Self::MAX).contains(&value) {
            Ok(Self(value))
        } else {
            Err(serde::de::Error::custom(format!(
                "expected {} to {} chapters at a time, got {value}",
                Self::MIN,
                Self::MAX
            )))
        }
    }
}

/// `downloads.folder`: null for the default folder in the data directory, or
/// an absolute path.
fn absolute_folder<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    let value = Option::<String>::deserialize(deserializer)?;
    match value {
        Some(path) if path.trim().is_empty() || !std::path::Path::new(&path).is_absolute() => Err(
            serde::de::Error::custom("expected an absolute folder path or null"),
        ),
        other => Ok(other),
    }
}

/// Most reader commands a binding map may name, keys one command may have,
/// and the longest command or key name.
const MAX_BOUND_COMMANDS: usize = 64;
const MAX_KEYS_PER_COMMAND: usize = 4;
const MAX_NAME_LEN: usize = 32;

/// Reader keyboard bindings: command name (`next`, `toggle-ui`) to the keys
/// that run it (`Space`, `Shift+ArrowLeft`, `f`). Empty means the built-in
/// bindings. The renderer owns the command list and the key names; Rust only
/// checks the shape and that no key runs two commands.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct KeyBindings(pub BTreeMap<String, Vec<String>>);

impl KeyBindings {
    fn validate(map: &BTreeMap<String, Vec<String>>) -> Result<(), String> {
        if map.len() > MAX_BOUND_COMMANDS {
            return Err(format!("more than {MAX_BOUND_COMMANDS} commands"));
        }
        let mut owner: HashMap<&str, &str> = HashMap::new();
        for (command, keys) in map {
            let valid_name = !command.is_empty()
                && command.len() <= MAX_NAME_LEN
                && command
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
            if !valid_name {
                return Err(format!("`{command}` is not a command name"));
            }
            if keys.len() > MAX_KEYS_PER_COMMAND {
                return Err(format!(
                    "`{command}` has more than {MAX_KEYS_PER_COMMAND} keys"
                ));
            }
            for key in keys {
                if key.is_empty() || key.chars().count() > MAX_NAME_LEN {
                    return Err(format!("`{key}` is not a key name"));
                }
                if let Some(other) = owner.insert(key, command) {
                    return Err(format!(
                        "`{key}` is bound to both `{other}` and `{command}`"
                    ));
                }
            }
        }
        Ok(())
    }
}

impl<'de> Deserialize<'de> for KeyBindings {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let map = BTreeMap::<String, Vec<String>>::deserialize(deserializer)?;
        Self::validate(&map).map_err(D::Error::custom)?;
        Ok(Self(map))
    }
}

/// Every app setting with its default. Serializes to a flat object keyed by
/// the dotted setting keys.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct AppSettings {
    #[serde(rename = "appearance.strength")]
    pub strength: ThemeStrength,
    /// Take the interface colours from the cover in focus; off keeps the
    /// default accent everywhere.
    #[serde(rename = "appearance.coverColours")]
    pub cover_colours: bool,
    /// Cover glow behind the page header.
    #[serde(rename = "appearance.ambient")]
    pub ambient: bool,
    /// Frosted glass panels; off uses solid surfaces (reduced transparency).
    #[serde(rename = "appearance.glass")]
    pub glass: bool,
    #[serde(rename = "appearance.motion")]
    pub motion: MotionPreference,
    #[serde(rename = "reader.mode")]
    pub reader_mode: ReaderMode,
    #[serde(rename = "reader.direction")]
    pub reader_direction: ReadingDirection,
    #[serde(rename = "reader.fit")]
    pub reader_fit: PageFit,
    #[serde(rename = "reader.filter")]
    pub reader_filter: ResampleFilter,
    /// Show wide pages alone in double page mode.
    #[serde(rename = "reader.detectSpreads")]
    pub reader_detect_spreads: bool,
    /// Where downloaded chapters go; `None` is `downloads/` in the data
    /// folder. The folder is added to the library as a root.
    #[serde(rename = "downloads.folder", deserialize_with = "absolute_folder")]
    pub downloads_folder: Option<String>,
    /// Download MangaDex's smaller recompressed pages.
    #[serde(rename = "downloads.dataSaver")]
    pub downloads_data_saver: bool,
    #[serde(rename = "downloads.concurrency")]
    pub downloads_concurrency: DownloadConcurrency,
    /// Queue new chapters of followed series as they appear in the feed.
    #[serde(rename = "downloads.autoFollows")]
    pub downloads_auto_follows: bool,
    /// Open chapters of tall strips in webtoon mode when the series has no
    /// mode of its own.
    #[serde(rename = "reader.detectWebtoon")]
    pub reader_detect_webtoon: bool,
    /// Show tall strips in screen sized parts in the paged modes.
    #[serde(rename = "reader.splitTall")]
    pub reader_split_tall: bool,
    /// Reader keyboard bindings that differ from the built-in ones.
    #[serde(rename = "reader.keys")]
    pub reader_keys: KeyBindings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            strength: ThemeStrength::default(),
            cover_colours: true,
            ambient: true,
            glass: true,
            motion: MotionPreference::default(),
            reader_mode: ReaderMode::default(),
            reader_direction: ReadingDirection::default(),
            reader_fit: PageFit::default(),
            reader_filter: ResampleFilter::default(),
            reader_detect_spreads: true,
            downloads_folder: None,
            downloads_data_saver: false,
            downloads_concurrency: DownloadConcurrency::default(),
            downloads_auto_follows: false,
            reader_detect_webtoon: true,
            reader_split_tall: true,
            reader_keys: KeyBindings::default(),
        }
    }
}

/// Why a setting was refused.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SettingError {
    #[error("unknown setting `{0}`")]
    UnknownKey(String),
    #[error("invalid value for `{key}`: {reason}")]
    InvalidValue { key: String, reason: String },
}

impl AppSettings {
    /// Every setting key, in declaration order.
    pub fn keys() -> Vec<String> {
        Self::default()
            .to_map()
            .into_iter()
            .map(|(k, _)| k)
            .collect()
    }

    /// The value of one key, or `None` for an unknown key.
    pub fn get(&self, key: &str) -> Option<Value> {
        self.to_map().remove(key)
    }

    /// A copy with `key` set to `value`, or why the value was refused.
    pub fn with(&self, key: &str, value: Value) -> Result<Self, SettingError> {
        let mut map = self.to_map();
        let Some(slot) = map.get_mut(key) else {
            return Err(SettingError::UnknownKey(key.to_owned()));
        };
        *slot = value;
        serde_json::from_value(Value::Object(map)).map_err(|error| SettingError::InvalidValue {
            key: key.to_owned(),
            reason: error.to_string(),
        })
    }

    /// Builds settings from stored key and value pairs, leniently: unknown
    /// keys (from a newer build) and values that no longer validate fall back
    /// to the default, so a bad row can never stop the app from starting.
    pub fn from_stored(rows: impl IntoIterator<Item = (String, Value)>) -> Self {
        rows.into_iter()
            .fold(Self::default(), |settings, (key, value)| {
                settings.with(&key, value).unwrap_or(settings)
            })
    }

    fn to_map(&self) -> Map<String, Value> {
        match serde_json::to_value(self) {
            Ok(Value::Object(map)) => map,
            // A struct of enums, bools and string maps always serializes to an
            // object.
            _ => Map::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn defaults_serialize_under_dotted_keys() {
        let value = serde_json::to_value(AppSettings::default()).unwrap();
        assert_eq!(value["appearance.strength"], "balanced");
        assert_eq!(value["appearance.coverColours"], true);
        assert_eq!(value["appearance.ambient"], true);
        assert_eq!(value["appearance.glass"], true);
        assert_eq!(value["appearance.motion"], "system");
        assert_eq!(value["reader.mode"], "single");
        assert_eq!(value["reader.direction"], "rtl");
        assert_eq!(value["reader.fit"], "screen");
        assert_eq!(value["reader.filter"], "lanczos3");
        assert_eq!(value["reader.detectSpreads"], true);
        assert_eq!(value["reader.detectWebtoon"], true);
        assert_eq!(value["reader.splitTall"], true);
        assert_eq!(value["reader.keys"], json!({}));
        assert_eq!(value["downloads.folder"], Value::Null);
        assert_eq!(value["downloads.dataSaver"], false);
        assert_eq!(value["downloads.concurrency"], 2);
        assert_eq!(value["downloads.autoFollows"], false);
    }

    #[test]
    fn download_settings_are_validated() {
        let settings = AppSettings::default();
        assert!(settings.with("downloads.concurrency", json!(0)).is_err());
        assert!(settings.with("downloads.concurrency", json!(5)).is_err());
        let four = settings.with("downloads.concurrency", json!(4)).unwrap();
        assert_eq!(four.downloads_concurrency.get(), 4);
        assert!(
            settings
                .with("downloads.folder", json!("relative/dir"))
                .is_err()
        );
        assert!(settings.with("downloads.folder", json!("")).is_err());
        let absolute = std::env::temp_dir().to_string_lossy().into_owned();
        let moved = settings.with("downloads.folder", json!(absolute)).unwrap();
        assert_eq!(moved.downloads_folder.as_deref(), Some(absolute.as_str()));
        let reset = moved.with("downloads.folder", Value::Null).unwrap();
        assert_eq!(reset.downloads_folder, None);
    }

    #[test]
    fn keys_cover_every_field() {
        let keys = AppSettings::keys();
        assert_eq!(keys.len(), 17);
        assert!(keys.contains(&"reader.detectSpreads".to_owned()));
    }

    #[test]
    fn with_sets_a_valid_value() {
        let next = AppSettings::default()
            .with("appearance.strength", json!("vivid"))
            .unwrap();
        assert_eq!(next.strength, ThemeStrength::Vivid);
        assert_eq!(next.get("appearance.strength"), Some(json!("vivid")));
    }

    #[test]
    fn with_refuses_an_unknown_key() {
        assert_eq!(
            AppSettings::default().with("appearance.sparkle", json!(true)),
            Err(SettingError::UnknownKey("appearance.sparkle".to_owned()))
        );
    }

    #[test]
    fn with_refuses_a_wrong_variant_and_names_the_choices() {
        let error = AppSettings::default()
            .with("reader.mode", json!("scroll"))
            .unwrap_err();
        let message = error.to_string();
        assert!(message.contains("reader.mode"), "{message}");
        assert!(message.contains("webtoon"), "{message}");
    }

    #[test]
    fn with_refuses_a_wrong_type() {
        assert!(matches!(
            AppSettings::default().with("appearance.glass", json!("yes")),
            Err(SettingError::InvalidValue { .. })
        ));
        assert!(matches!(
            AppSettings::default().with("reader.fit", Value::Null),
            Err(SettingError::InvalidValue { .. })
        ));
    }

    #[test]
    fn key_bindings_are_stored_as_given() {
        let next = AppSettings::default()
            .with(
                "reader.keys",
                json!({ "next": ["Space", "j"], "prev": ["Shift+Space", "k"] }),
            )
            .unwrap();
        assert_eq!(next.reader_keys.0["next"], ["Space", "j"]);
        assert_eq!(
            next.get("reader.keys"),
            Some(json!({ "next": ["Space", "j"], "prev": ["Shift+Space", "k"] }))
        );
    }

    #[test]
    fn key_bindings_refuse_a_key_on_two_commands() {
        let message = AppSettings::default()
            .with("reader.keys", json!({ "next": ["j"], "prev": ["j"] }))
            .unwrap_err()
            .to_string();
        assert!(message.contains("bound to both"), "{message}");
    }

    #[test]
    fn key_bindings_refuse_bad_shapes() {
        for value in [
            json!({ "Next Page": ["j"] }),
            json!({ "next": ["a", "b", "c", "d", "e"] }),
            json!({ "next": [""] }),
            json!({ "next": "j" }),
            json!(["next"]),
        ] {
            assert!(
                AppSettings::default()
                    .with("reader.keys", value.clone())
                    .is_err(),
                "{value}"
            );
        }
    }

    #[test]
    fn stored_rows_are_read_leniently() {
        let settings = AppSettings::from_stored([
            ("reader.direction".to_owned(), json!("ltr")),
            ("reader.mode".to_owned(), json!("nonsense")),
            ("from.a.newer.build".to_owned(), json!(1)),
        ]);
        assert_eq!(settings.reader_direction, ReadingDirection::Ltr);
        assert_eq!(settings.reader_mode, ReaderMode::Single);
    }
}
