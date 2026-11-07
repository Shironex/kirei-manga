//! The cover seed: the dominant vivid hue of a cover in OKLCH, plus a few
//! swatches. The UI derives every surface colour from the seed hue and chroma,
//! so this runs once per cover at scan time and is stored with it.
//!
//! The method: shrink the cover to 40 x 60, convert each pixel to OKLCH, drop
//! near greys and near black or white, and vote into 18 hue bins of 20 degrees
//! weighted by chroma and by closeness to mid lightness. The heaviest bin's
//! circular mean hue and 80th percentile chroma are the seed.

use image::RgbImage;
use image::imageops::FilterType;
use serde::{Deserialize, Serialize};

/// Seed used when a cover has no vivid colour at all (a greyscale cover):
/// the app's default violet at a whisper of chroma.
pub const FALLBACK_HUE: f32 = 272.0;
pub const FALLBACK_CHROMA: f32 = 0.04;
/// Ceiling on the seed chroma, so a neon cover cannot push surfaces out of
/// the contrast the design system checks.
pub const MAX_SEED_CHROMA: f32 = 0.17;

const SAMPLE_W: u32 = 40;
const SAMPLE_H: u32 = 60;
const BINS: usize = 18;

/// One OKLCH colour: lightness 0..1, chroma 0..~0.4, hue in degrees.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Oklch {
    pub l: f32,
    pub c: f32,
    pub h: f32,
}

/// What the theme engine reads from a cover.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Palette {
    /// Seed hue in degrees.
    pub h: f32,
    /// Seed chroma, capped at [`MAX_SEED_CHROMA`].
    pub c: f32,
    /// Dark, mid, seed, second hue, light.
    pub swatches: Vec<Oklch>,
    /// True when the cover had no vivid colour and the seed is the default.
    pub fallback: bool,
}

/// Converts 8-bit sRGB to OKLCH.
pub fn srgb_to_oklch(r: u8, g: u8, b: u8) -> Oklch {
    fn linear(v: u8) -> f32 {
        let v = f32::from(v) / 255.0;
        if v <= 0.04045 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        }
    }
    let (r, g, b) = (linear(r), linear(g), linear(b));
    let l = (0.412_221_46 * r + 0.536_332_55 * g + 0.051_445_995 * b).cbrt();
    let m = (0.211_903_5 * r + 0.680_699_5 * g + 0.107_396_96 * b).cbrt();
    let s = (0.088_302_46 * r + 0.281_718_85 * g + 0.629_978_7 * b).cbrt();
    let lightness = 0.210_454_26 * l + 0.793_617_8 * m - 0.004_072_047 * s;
    let a = 1.977_998_5 * l - 2.428_592_2 * m + 0.450_593_7 * s;
    let bb = 0.025_904_037 * l + 0.782_771_77 * m - 0.808_675_77 * s;
    Oklch {
        l: lightness,
        c: a.hypot(bb),
        h: (bb.atan2(a).to_degrees() + 360.0) % 360.0,
    }
}

#[derive(Default)]
struct Bin {
    weight: f32,
    x: f32,
    y: f32,
    chromas: Vec<f32>,
    lightness_sum: f32,
}

impl Bin {
    fn pick(&self) -> Oklch {
        let mut chromas = self.chromas.clone();
        chromas.sort_by(f32::total_cmp);
        let p80 = chromas[(chromas.len() as f32 * 0.8) as usize % chromas.len()];
        Oklch {
            l: self.lightness_sum / chromas.len() as f32,
            c: p80,
            h: (self.y.atan2(self.x).to_degrees() + 360.0) % 360.0,
        }
    }
}

/// Samples the seed and swatches from a decoded cover.
pub fn sample(image: &RgbImage) -> Palette {
    let small = image::imageops::resize(image, SAMPLE_W, SAMPLE_H, FilterType::Triangle);
    let mut bins: Vec<Bin> = (0..BINS).map(|_| Bin::default()).collect();
    let mut all = Vec::with_capacity((SAMPLE_W * SAMPLE_H) as usize);
    for pixel in small.pixels() {
        let p = srgb_to_oklch(pixel[0], pixel[1], pixel[2]);
        all.push(p);
        if p.c < 0.03 || p.l < 0.2 || p.l > 0.93 {
            continue;
        }
        let bin = &mut bins[(p.h / 20.0) as usize % BINS];
        let weight = p.c.powf(1.3) * (1.0 - (p.l - 0.6).abs());
        let radians = p.h.to_radians();
        bin.weight += weight;
        bin.x += radians.cos() * weight;
        bin.y += radians.sin() * weight;
        bin.chromas.push(p.c);
        bin.lightness_sum += p.l;
    }
    let mut ranked: Vec<&Bin> = bins.iter().filter(|b| b.weight > 0.0).collect();
    ranked.sort_by(|a, b| b.weight.total_cmp(&a.weight));

    all.sort_by(|a, b| a.l.total_cmp(&b.l));
    let at = |q: f32| all[((all.len() as f32 * q) as usize).min(all.len() - 1)];
    let (dark, mid, light) = (at(0.06), at(0.5), at(0.97));

    let Some(first) = ranked.first() else {
        let seed = Oklch {
            l: mid.l,
            c: FALLBACK_CHROMA,
            h: FALLBACK_HUE,
        };
        return Palette {
            h: FALLBACK_HUE,
            c: FALLBACK_CHROMA,
            swatches: vec![dark, mid, seed, seed, light],
            fallback: true,
        };
    };
    let seed = first.pick();
    let second = ranked.get(1).map_or(
        Oklch {
            l: (seed.l + 0.2).min(0.9),
            ..seed
        },
        |bin| bin.pick(),
    );
    Palette {
        h: seed.h,
        c: seed.c.min(MAX_SEED_CHROMA),
        swatches: vec![dark, mid, seed, second, light],
        fallback: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flat(r: u8, g: u8, b: u8) -> RgbImage {
        RgbImage::from_pixel(80, 120, image::Rgb([r, g, b]))
    }

    fn hue_distance(a: f32, b: f32) -> f32 {
        let d = (a - b).rem_euclid(360.0);
        d.min(360.0 - d)
    }

    #[test]
    fn oklch_matches_reference_values() {
        // Reference values from the CSS Color 4 sample code.
        let red = srgb_to_oklch(255, 0, 0);
        assert!((red.l - 0.628).abs() < 0.002, "{red:?}");
        assert!((red.c - 0.2577).abs() < 0.002, "{red:?}");
        assert!((red.h - 29.23).abs() < 0.2, "{red:?}");
        let white = srgb_to_oklch(255, 255, 255);
        assert!((white.l - 1.0).abs() < 0.001 && white.c < 0.001);
    }

    #[test]
    fn a_flat_colour_seeds_its_own_hue() {
        for (r, g, b) in [(200, 60, 40), (40, 120, 200), (60, 160, 90), (150, 70, 190)] {
            let expected = srgb_to_oklch(r, g, b);
            let palette = sample(&flat(r, g, b));
            assert!(!palette.fallback);
            assert!(
                hue_distance(palette.h, expected.h) < 1.0,
                "{palette:?} vs {expected:?}"
            );
            assert!(palette.c <= MAX_SEED_CHROMA);
            assert_eq!(palette.swatches.len(), 5);
        }
    }

    #[test]
    fn the_dominant_vivid_colour_wins_over_grey_area() {
        // Mostly grey paper with a vivid orange band: the band seeds.
        let mut image = flat(128, 128, 128);
        for y in 0..30 {
            for x in 0..80 {
                image.put_pixel(x, y, image::Rgb([230, 110, 30]));
            }
        }
        let palette = sample(&image);
        let orange = srgb_to_oklch(230, 110, 30);
        assert!(hue_distance(palette.h, orange.h) < 5.0, "{palette:?}");
    }

    #[test]
    fn a_greyscale_cover_falls_back_to_the_default_seed() {
        let palette = sample(&flat(90, 90, 90));
        assert!(palette.fallback);
        assert_eq!(palette.h, FALLBACK_HUE);
        assert_eq!(palette.c, FALLBACK_CHROMA);
    }
}
