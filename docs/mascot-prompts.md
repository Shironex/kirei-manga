# KireiManga Mascot — Recraft AI Prompt Guide

Sister guide to ShiroAni's mascot doc. The character shares the Shiro suite
silhouette — same chibi proportions, same long flowing white hair, same tiny
vampire fang — but the palette, wardrobe, and body language are re-skinned to
match KireiManga's **editorial ink-and-paper** identity: sumi (deep ink),
kinari (paper cream), and bengara (iron-oxide red) as the single warm accent.

Where ShiroAni is a cheerful pop-leaning chibi and Shiranami is a moody
headphones-and-hoodie chibi, **KireiManga's mascot is a quiet bookshop
assistant** — reserved, focused, always mid-read.

## Platform Settings

- **Model**: Recraft V3 (not V4 — V4 doesn't support style presets)
- **Style**: Digital Illustration > **"Hand Drawn Outline"** (`hand_drawn_outline`)
- **Aspect ratio**: 1:1 (square)
- **Output**: 256x256 RGBA PNG

### Alternative Styles to Test

- Digital Illustration > "Outline Details" — slightly more interior linework (well-suited to the literary feel)
- Vector Illustration > "Line Art" — cleanest hairlines if "Hand Drawn Outline" looks too soft next to the editorial UI

**Avoid**: "Grain", "Pencil Sketch", "Risograph", "Watercolor" — texture degrades at small sizes and fights the app's sharp hairline rules.

## Custom Style Setup (Critical for Consistency)

1. Create a new Recraft project for KireiManga mascot
2. Upload a ShiroAni pose PNG (e.g. `chibi_idle.png`) as reference — we want the same silhouette, just re-coloured
3. Set Style Model to "Style essentials", Style Category to "Illustration"
4. Style Prompt:
   ```
   clean chibi anime illustration, black outline art, flat colors, minimal shading,
   deep sumi ink and cream ivory and iron-oxide red color palette, dark-toned
   knitwear giving the character visual mass against dark backgrounds, serene
   literary character design, sticker style, simple clean lines, editorial
   ink-and-paper aesthetic, no bright pinks, no neon, no saturated colors
   ```
5. Save as "KireiManga Chibi" — **use for every pose generation**

## Color Palette

Matches the app's OKLCH tokens in `apps/web/src/styles/globals.css` — keep the
mascot anchored to this palette so she reads as part of the same object as the
app itself.

| Color              | Hex       | Used For                                                              |
| ------------------ | --------- | --------------------------------------------------------------------- |
| Sumi (deep ink)    | `#14120E` | Outlines, **sweater body**, skirt, book cover, shoes                  |
| Kinari (paper)     | `#F6F0E4` | Sweater collar, cuff trim, skin base, open book page, knee-high socks |
| Bengara (red clay) | `#B44A3A` | Eyes, embroidered kanji on chest, hair ribbon, bookmark, cheek dots   |
| Bone muted         | `#A59F92` | Secondary line shading, sock ribbing                                  |
| Ink shadow         | `#0A0906` | Hair deep shadow, shoe sole                                           |

**No pink**. **No purple**. Bengara is the only warm accent and it's used
sparingly — think of it as the single red stamp on a letterpress page. The
sweater is intentionally **sumi dark** (not cream) so the character has visual
mass against the app's dark theme — cream stays for the collar trim, skin,
socks, and open book page.

## Character Anchor (use in EVERY prompt)

> chibi anime girl character, 2-head-tall proportions with oversized head and tiny body, long flowing white hair gathered in a single low side-ponytail tied with a thin bengara iron-oxide red silk ribbon, long side-swept bangs framing the face, small vampire fang on lower lip, gentle half-closed eyes in a soft bengara red, oval wire-rim reading glasses perched on the bridge of her nose, pale cream skin with tiny faint bengara red dots on her cheeks instead of blush, wearing an oversized deep sumi ink ribbed knit sweater with a soft cream ivory high-collar peeking at the neckline and narrow cream cuffs at the wrists, long sleeves covering her hands slightly, small bengara red embroidered kanji characters 綺麗 on the chest reading vertically, long pleated sumi black ankle-length skirt, cream bone knee-high socks, plain dark mary-jane shoes

---

## Poses

### 1. Reading — `chibi_read.png` (default / idle state)

Primary pose. Establishes the character and is the PNG used in the splash
screen. Treat this as the reference for consistency — match the palette and
silhouette here before generating the other poses.

```
A hand-drawn outline digital illustration of a chibi anime girl character,
2-head-tall proportions with oversized head and tiny body, long flowing white
hair gathered in a single low side-ponytail tied with a thin bengara iron-oxide
red silk ribbon, long side-swept bangs framing the face, small vampire fang on
lower lip, gentle half-closed eyes in a soft bengara red looking downward at a
book, oval wire-rim reading glasses perched on the bridge of her nose, pale
cream skin with tiny faint bengara red dots on her cheeks, wearing an oversized
deep sumi ink ribbed knit sweater with a soft cream ivory high-collar peeking
at the neckline and narrow cream cuffs at the wrists, long sleeves covering her
hands slightly, small bengara red embroidered kanji characters 綺麗 on the chest
reading vertically, long pleated sumi black ankle-length skirt, cream bone
knee-high socks, plain dark mary-jane shoes. She is sitting cross-legged on the
floor, holding a small open manga volume in both hands close to her lap, head
tilted down in focused reading, a thin bengara red silk bookmark ribbon dangling
from the book's spine, calm quiet contented expression, absorbed in reading.
Clean black outlines, flat colors, minimal shading, sticker style, full body
visible, single character, centered composition, transparent background.
```

### 2. Waving / Greeting — `chibi_wave.png` (app open / hover)

Reserved greeting — a polite small wave with a tiny bow of the head, not
ShiroAni's energetic raised-arm greeting. KireiManga's mascot is a librarian,
not a cheerleader.

```
A hand-drawn outline digital illustration of a chibi anime girl character,
2-head-tall proportions with oversized head and tiny body, long flowing white
hair gathered in a single low side-ponytail tied with a thin bengara iron-oxide
red silk ribbon, long side-swept bangs framing the face, small vampire fang on
lower lip, gentle soft bengara red eyes with a calm welcoming expression, oval
wire-rim reading glasses, pale cream skin with tiny faint bengara red dots on
her cheeks, wearing an oversized deep sumi ink ribbed knit sweater with a soft
cream ivory high-collar peeking at the neckline and narrow cream cuffs at the
wrists, long sleeves, small bengara red embroidered kanji characters 綺麗 on
the chest, long pleated sumi black ankle-length skirt, cream bone knee-high
socks, plain dark mary-jane shoes. She is standing politely with a small book tucked
under one arm, raising her free hand near her shoulder in a quiet reserved
wave, open palm facing forward, head tilted slightly in a tiny welcoming bow,
soft closed-mouth smile, gentle librarian-like welcoming pose. Clean black
outlines, flat colors, minimal shading, sticker style, full body visible,
single character, centered composition, transparent background.
```

### 3. Sleeping / Drowsy — `chibi_sleep.png` (late night / idle)

Fallen asleep among books. Reading glasses slipping. A small tilt of the head
onto a stack of manga volumes.

```
A hand-drawn outline digital illustration of a chibi anime girl character,
2-head-tall proportions with oversized head and tiny body, long flowing white
hair gathered in a single low side-ponytail tied with a thin bengara iron-oxide
red silk ribbon, long side-swept bangs framing the face, small vampire fang on
lower lip, eyes closed peacefully with curved sleepy line eyelids behind her
oval wire-rim reading glasses that have slipped slightly down her nose, pale
cream skin with tiny faint bengara red dots on her cheeks, wearing an oversized
deep sumi ink ribbed knit sweater with a soft cream ivory high-collar peeking at
the neckline and narrow cream cuffs at the wrists, long sleeves, small bengara
red embroidered kanji characters 綺麗 on the chest, long pleated sumi black
ankle-length skirt, cream bone knee-high socks, plain dark mary-jane shoes.
She is sitting on the floor dozed off with her head resting on a small stack of
three manga volumes in front of her, cheek pressed against the top volume, one
book still open loosely in her lap, bengara red bookmark ribbon dangling, a
small floating Z letter in a serif font near her head, peaceful sleepy
bookshop-at-night pose. Clean black outlines, flat colors, minimal shading,
sticker style, full body visible, single character, centered composition,
transparent background.
```

### 4. Thinking — `chibi_think.png` (loading / searching states)

Pen or fingertip to chin, looking up. Used for "Loading pages…", "Scanning
folder…", MangaDex search spinner. Contemplative not puzzled.

```
A hand-drawn outline digital illustration of a chibi anime girl character,
2-head-tall proportions with oversized head and tiny body, long flowing white
hair gathered in a single low side-ponytail tied with a thin bengara iron-oxide
red silk ribbon, long side-swept bangs framing the face, small vampire fang on
lower lip, soft bengara red eyes looking upward and slightly to the side
thoughtfully, oval wire-rim reading glasses, pale cream skin with tiny faint
bengara red dots on her cheeks, wearing an oversized deep sumi ink ribbed knit
sweater with a soft cream ivory high-collar peeking at the neckline and narrow
cream cuffs at the wrists, long sleeves, small bengara red embroidered kanji
characters 綺麗 on the chest, long pleated sumi black ankle-length skirt, cream
bone knee-high socks, plain dark mary-jane shoes. She is standing in a thinking
pose with a small closed manga volume held in one hand at her side, the other
hand raised with her index finger resting lightly against her chin, head tilted
upward and slightly to the side in gentle contemplation, calm focused curious
expression, a small simple serif question mark floating above her head. Clean
black outlines, flat colors, minimal shading, sticker style, full body visible,
single character, centered composition, transparent background.
```

### 5. Pointing — `chibi_point.png` (notifications / new-chapter alerts)

Reserved point — a gentle guiding gesture, like a librarian directing you to a
shelf. Less "attention!" more "this way, please".

```
A hand-drawn outline digital illustration of a chibi anime girl character,
2-head-tall proportions with oversized head and tiny body, long flowing white
hair gathered in a single low side-ponytail tied with a thin bengara iron-oxide
red silk ribbon, long side-swept bangs framing the face, small vampire fang on
lower lip, soft bengara red eyes looking toward the direction she is pointing
with a quiet attentive expression, oval wire-rim reading glasses, pale cream
skin with tiny faint bengara red dots on her cheeks, wearing an oversized deep
sumi ink ribbed knit sweater with a soft cream ivory high-collar peeking at the
neckline and narrow cream cuffs at the wrists, long sleeves, small bengara red
embroidered kanji characters 綺麗 on the chest, long pleated sumi black
ankle-length skirt, cream bone knee-high socks, plain dark mary-jane shoes. She
is standing turned slightly to the right, one hand holding a small closed manga
volume at her side, the other arm gently extended to the right with an open
palm and a softly extended index finger in a polite guiding gesture, head
tilted in the pointed direction, gentle librarian-showing-you-the-shelf pose,
closed-mouth soft smile. Clean black outlines, flat colors, minimal shading,
sticker style, full body visible, single character, centered composition,
transparent background.
```

> For a left-pointing version, mirror the PNG in post-processing or regenerate with "gently extended to the left with an open palm."

### 6. Page Turn — `chibi_turn.png` (reader open / "Continue reading")

The reader-specific pose. Mid-page-turn, focused down, visible bengara
bookmark ribbon. Used in the reader's loading frame and on the "Continue"
button hover on series detail pages.

```
A hand-drawn outline digital illustration of a chibi anime girl character,
2-head-tall proportions with oversized head and tiny body, long flowing white
hair gathered in a single low side-ponytail tied with a thin bengara iron-oxide
red silk ribbon, long side-swept bangs framing the face, small vampire fang on
lower lip, soft bengara red eyes looking downward in focused reading, oval
wire-rim reading glasses, pale cream skin with tiny faint bengara red dots on
her cheeks, wearing an oversized deep sumi ink ribbed knit sweater with a soft
cream ivory high-collar peeking at the neckline and narrow cream cuffs at the
wrists, long sleeves, small bengara red embroidered kanji characters 綺麗 on
the chest, long pleated sumi black ankle-length skirt, cream bone knee-high
socks, plain dark mary-jane shoes. She is sitting seiza on the floor with a larger
open manga volume resting on her lap, one hand pinching the corner of a page
mid-turn, the page caught in motion arcing from right to left in the japanese
right-to-left reading direction, bengara red silk bookmark ribbon trailing from
the book's spine, calm absorbed expression eyes-down reading pose. Clean black
outlines, flat colors, minimal shading, sticker style, full body visible,
single character, centered composition, transparent background.
```

---

## Generation Workflow

1. Open the KireiManga project in Recraft
2. Select the saved "KireiManga Chibi" custom style
3. Set aspect ratio to 1:1
4. Paste the prompt for the desired pose
5. Generate 4+ images
6. Pick the best match to the character anchor
7. Remove background if needed (scissors tool)
8. Export as PNG
9. Resize to 256x256 (LANCZOS resampling)
10. Save as `chibi_[pose].png` in `apps/desktop/resources/mascot/`

## Transparency Tips

- Try "transparent background" in prompt first
- Fallback: generate on solid white, then use Recraft's background remover
- Never upscale after removing background (destroys alpha)

## Consistency Tips

- Always use the same custom style for every generation
- Keep the character anchor block identical — only change the pose sentences
- Generate all poses in one session if possible so Recraft's style model stays warm
- Place the chosen `chibi_read.png` on the canvas next to new generations as visual reference
- Cherry-pick aggressively (4+ variations per pose)
- Review all poses side-by-side at 128 px display size for final consistency check

## What to reject during review

- Hair coloured cream / yellow / any warm tint — hair must read as **pure white** against the sumi background
- **Sweater rendered cream or any light colour** — the sweater body must be dark (deep sumi ink) so the character has mass on the app's dark theme; only the collar trim and cuffs are cream
- Pink blush on the cheeks — replace with the small bengara dots from the anchor
- Chunky sneakers, hoodie, or graphic-tee wardrobe (that's ShiroAni / Shiranami, not KireiManga)
- Wide open grins or jump poses — the mascot is reserved; body language should never go above a soft half-smile
- Oversaturated bengara — it should look like iron oxide / dried red clay, not fire-engine red
- Sweater fully bengara red — bengara stays a single accent (embroidery, ribbon, bookmark, eyes, glasses); a full red sweater breaks the "single stamp on a letterpress page" rule

---

## Splashscreen Notes (for the follow-up build)

The splash component will mirror ShiroAni's React-driven splash, not a static
PNG. Minimum-display 3 s, fade out on app-ready, min-size Electron window
while it renders so drag still works.

**Composition (matches app's editorial tone, not ShiroAni's pop tone):**

- Background: solid **sumi** (`oklch(14% 0.008 55)` — same as `--color-ink`)
- One hairline vertical rule a hair's breadth inside the left edge, bengara 20 % opacity, reaching floor-to-ceiling (the same motif the sidebar uses for the 綺麗 tategaki rail)
- Center column, stacked top-to-bottom with generous vertical rhythm:
  1. `chibi_read.png` at 160 px, soft drop shadow, gentle 3 s float animation (same as ShiroAni)
  2. Six **paper-flake** particles (not sparkles — small square bengara specks, 2–3 px, drifting downward slowly) distributed around the mascot — replaces ShiroAni's twinkle sparkles
  3. `綺麗漫画` in **Shippori Mincho**, 28 px, kinari foreground
  4. `KIREIMANGA` in **JetBrains Mono**, 10 px, tracked to `0.26em`, bone-muted
  5. After 600 ms: a 4 × 4 bengara loading dot (simple ring, no Lucide spinner) + rotating loading message in Fraunces italic 13 px

**Rotating messages** — editorial in tone, not cute. Polish to match ShiroAni:

- `Odkurzamy półki z mangą...` (Dusting the manga shelves...)
- `Ostrzymy ołówki...` (Sharpening the pencils...)
- `Nalewamy herbatę...` (Pouring the tea...)
- `Przewracamy strony...` (Turning pages...)
- `Wyszukujemy rozdziały...` (Looking up chapters...)
- `Otwieramy okładki...` (Opening the covers...)
- `Sortujemy zakładki...` (Sorting bookmarks...)
- `Kirei czyta cichutko...` (Kirei reads quietly...)

English fallback list can mirror: "Dusting the shelves…", "Sharpening pencils…", "Pouring the tea…", "Turning the page…", "Opening the covers…", "Sorting bookmarks…", "Kirei is reading quietly…".

Avoid the exclamation marks and `~nyaa` cadence from ShiroAni — KireiManga's
copy voice is a serif ellipsis, never a purr.

The splash component lives at `apps/web/src/components/splash/SplashScreen.tsx`
when we build it — same integration pattern as ShiroAni.
