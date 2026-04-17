import satori from 'satori';
import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

/* ------------------------------------------------------------------
   綺麗漫画 · OG image generator.
   Editorial ink-and-paper composition sized 1200×630 for Twitter/
   Discord/Open Graph previews. Renders via satori (SVG with embedded
   font glyphs) then flattens to PNG via sharp.

   Fonts are auto-fetched on first run into assets/fonts/ (gitignored)
   so the repo stays small — Shippori Mincho is ~8 MB on its own.
------------------------------------------------------------------ */

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const fontsDir = resolve(root, 'assets/fonts');
const outPath = resolve(root, 'public/og-default.png');

const FONTS = [
  {
    family: 'Fraunces',
    weight: 600,
    style: 'normal',
    file: 'Fraunces144pt-SemiBold.ttf',
    url: 'https://github.com/undercasetype/Fraunces/raw/master/fonts/ttf/Fraunces144pt-SemiBold.ttf',
  },
  {
    family: 'Shippori Mincho',
    weight: 700,
    style: 'normal',
    file: 'ShipporiMincho-Bold.ttf',
    url: 'https://github.com/google/fonts/raw/main/ofl/shipporimincho/ShipporiMincho-Bold.ttf',
  },
];

// Editorial palette (roughly mirrors --color-sumi, --color-kinari, etc.
// from src/styles/partials/tokens.css, converted from OKLCH to sRGB hex).
const SUMI = '#141110';
const SUMI_RAISED = '#1e1a17';
const KINARI = '#ebe1c9';
const MUTED = '#a99a7c';
const FAINT = '#706449';
const BENGARA = '#b24b32';
const RULE = '#2a2420';

async function ensureFont({ url, file }) {
  await mkdir(fontsDir, { recursive: true });
  const localPath = resolve(fontsDir, file);
  if (existsSync(localPath)) return readFile(localPath);
  process.stdout.write(`  · fetching ${file} … `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(localPath, buf);
  console.log(`${(buf.length / 1024).toFixed(0)} KB`);
  return buf;
}

async function dataUri(path) {
  const buf = await readFile(path);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

console.log('• preparing fonts');
const fonts = await Promise.all(
  FONTS.map(async (f) => ({
    name: f.family,
    data: await ensureFont(f),
    weight: f.weight,
    style: f.style,
  })),
);

console.log('• loading mascot');
const mascot = await dataUri(resolve(root, 'src/assets/mascot-read.png'));

const markup = {
  type: 'div',
  props: {
    style: {
      width: '1200px',
      height: '630px',
      display: 'flex',
      position: 'relative',
      background: SUMI,
      fontFamily: 'Fraunces',
      color: KINARI,
    },
    children: [
      // Giant faded 綺 ornament, tucked behind everything top-right
      {
        type: 'div',
        props: {
          style: {
            position: 'absolute',
            top: '-140px',
            right: '-80px',
            fontFamily: 'Shippori Mincho',
            fontSize: '720px',
            fontWeight: 700,
            color: SUMI_RAISED,
            lineHeight: 1,
            display: 'flex',
          },
          children: '綺',
        },
      },

      // Inner padding frame
      {
        type: 'div',
        props: {
          style: {
            position: 'relative',
            display: 'flex',
            width: '100%',
            height: '100%',
            padding: '76px 88px',
          },
          children: [
            // Left column — editorial masthead
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  width: '680px',
                  height: '100%',
                },
                children: [
                  // Eyebrow row
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '18px',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              fontFamily: 'Shippori Mincho',
                              fontSize: '24px',
                              fontWeight: 700,
                              color: BENGARA,
                              letterSpacing: '6px',
                              display: 'flex',
                            },
                            children: '綺麗漫画',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: {
                              width: '56px',
                              height: '1px',
                              background: RULE,
                              display: 'flex',
                            },
                            children: '',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: {
                              fontFamily: 'Fraunces',
                              fontSize: '14px',
                              fontWeight: 600,
                              color: MUTED,
                              letterSpacing: '4px',
                              display: 'flex',
                            },
                            children: '§ DESKTOP MANGA READER',
                          },
                        },
                      ],
                    },
                  },
                  // Title + subhead + rule
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '22px',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              fontFamily: 'Fraunces',
                              fontSize: '124px',
                              fontWeight: 600,
                              letterSpacing: '-4px',
                              lineHeight: 0.95,
                              color: KINARI,
                              display: 'flex',
                            },
                            children: 'KireiManga',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: {
                              fontFamily: 'Fraunces',
                              fontSize: '32px',
                              fontWeight: 600,
                              color: MUTED,
                              lineHeight: 1.3,
                              display: 'flex',
                            },
                            children: 'Read any manga, in any language.',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: {
                              width: '88px',
                              height: '2px',
                              background: BENGARA,
                              marginTop: '6px',
                              display: 'flex',
                            },
                            children: '',
                          },
                        },
                      ],
                    },
                  },
                  // Meta strip
                  {
                    type: 'div',
                    props: {
                      style: {
                        fontFamily: 'Fraunces',
                        fontSize: '15px',
                        fontWeight: 600,
                        color: FAINT,
                        letterSpacing: '3px',
                        display: 'flex',
                      },
                      children:
                        'MANGADEX  ·  CBZ IMPORT  ·  LOCAL LIBRARY  ·  BILINGUAL EN / PL',
                    },
                  },
                ],
              },
            },

            // Right column — hanko seal (top) + mascot (bottom)
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  marginLeft: 'auto',
                  height: '100%',
                },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '112px',
                        height: '112px',
                        background: BENGARA,
                        fontFamily: 'Shippori Mincho',
                        fontSize: '76px',
                        fontWeight: 700,
                        color: KINARI,
                        transform: 'rotate(-4deg)',
                        boxShadow: '0 0 0 2px rgba(178,75,50,0.15)',
                      },
                      children: '綺',
                    },
                  },
                  {
                    type: 'img',
                    props: {
                      src: mascot,
                      width: 280,
                      height: 280,
                      style: { objectFit: 'contain' },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  },
};

console.log('• rendering svg');
const svg = await satori(markup, {
  width: 1200,
  height: 630,
  fonts,
});

console.log('• flattening to png');
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outPath);

const { size } = await sharp(outPath).metadata();
console.log(`✓ generated ${outPath.replace(root + '\\', '').replace(root + '/', '')} (1200×630, ${size ?? ''})`);
