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

use serde::{Deserialize, Serialize};
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

/// Every app setting with its default. Serializes to a flat object keyed by
/// the dotted setting keys.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct AppSettings {
    #[serde(rename = "appearance.strength")]
    pub strength: ThemeStrength,
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
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            strength: ThemeStrength::default(),
            ambient: true,
            glass: true,
            motion: MotionPreference::default(),
            reader_mode: ReaderMode::default(),
            reader_direction: ReadingDirection::default(),
            reader_fit: PageFit::default(),
            reader_filter: ResampleFilter::default(),
            reader_detect_spreads: true,
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
            // A struct of enums and bools always serializes to an object.
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
        assert_eq!(value["appearance.ambient"], true);
        assert_eq!(value["appearance.glass"], true);
        assert_eq!(value["appearance.motion"], "system");
        assert_eq!(value["reader.mode"], "single");
        assert_eq!(value["reader.direction"], "rtl");
        assert_eq!(value["reader.fit"], "screen");
        assert_eq!(value["reader.filter"], "lanczos3");
        assert_eq!(value["reader.detectSpreads"], true);
    }

    #[test]
    fn keys_cover_every_field() {
        let keys = AppSettings::keys();
        assert_eq!(keys.len(), 9);
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
