/**
 * Procedural art for the demo library: covers, manga pages and webtoon strips.
 * Everything is drawn here from a seed (shapes as SVG, lettering on a canvas
 * with the app's own fonts), so the screenshots carry no third party artwork.
 * The motifs follow the fictional covers of the design prototype.
 */

export type Motif =
  | 'moon'
  | 'sun'
  | 'orbit'
  | 'ice'
  | 'lantern'
  | 'petal'
  | 'wave'
  | 'blade'
  | 'archive'
  | 'ember'
  | 'forest'
  | 'glass';

export interface CoverArt {
  motif: Motif;
  /** Seed hue and chroma, in OKLCH. */
  h: number;
  c: number;
  /** Japanese title in vertical columns. */
  vertical?: boolean;
  title?: 'top' | 'bottom' | 'right';
  /** Dark lettering on a light cover. */
  darkTitle?: boolean;
}

export interface ArtSeries {
  key: string;
  title: string;
  jp: string | null;
  author: string;
  art: CoverArt;
}

type Rand = () => number;

/** Deterministic PRNG (mulberry32) seeded from a string. */
export function rng(seed: string): Rand {
  let a = 0;
  for (const ch of seed) a = (a * 31 + ch.charCodeAt(0)) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ok = (l: number, c: number, h: number, a?: number) =>
  `oklch(${l} ${c} ${h}${a === undefined ? '' : ` / ${a}`})`;

const FONT_JP = '"Shippori Mincho", serif';
const FONT_DISPLAY = '"Bricolage Grotesque", sans-serif';
const FONT_UI = '"Onest", sans-serif';
const INK = 'oklch(0.16 0 0)';
const PAPER = 'oklch(0.98 0 0)';

const MOTIFS: Record<Motif, (h: number, c: number, r: Rand) => string> = {
  moon(h, c, r) {
    const dark = ok(0.16, c * 0.4, h);
    const towers = [18, 29, 38, 50, 58, 70]
      .map(x => `<rect x="${x}" y="${150 + r() * 22}" width="${6 + r() * 5}" height="60"/>`)
      .join('');
    return `<rect width="200" height="300" fill="url(#g)"/>
      <circle cx="132" cy="84" r="40" fill="${ok(0.92, 0.07, 90)}"/>
      <circle cx="146" cy="76" r="36" fill="${ok(0.25, c * 0.6, h)}"/>
      <g fill="${dark}"><rect x="0" y="198" width="200" height="102"/>${towers}</g>
      <rect x="110" y="150" width="58" height="48" fill="${ok(0.82, 0.12, 80)}"/>
      <rect x="110" y="150" width="58" height="48" fill="none" stroke="${dark}" stroke-width="3"/>
      <line x1="139" y1="150" x2="139" y2="198" stroke="${dark}" stroke-width="2"/>
      <circle cx="124" cy="186" r="5" fill="${dark}"/><rect x="120" y="190" width="8" height="8" fill="${dark}"/>`;
  },
  sun(h, c, r) {
    const dark = ok(0.17, c * 0.35, h - 15);
    const bands = [0, 1, 2, 3]
      .map(
        i =>
          `<rect x="60" y="${132 + i * 12}" width="140" height="${2 + i}" fill="${ok(0.5, c, h)}" opacity="0.6"/>`
      )
      .join('');
    const blocks = [10, 36, 58, 92, 150, 172]
      .map(x => `<rect x="${x}" y="${118 + r() * 50}" width="${14 + r() * 14}" height="80"/>`)
      .join('');
    return `<rect width="200" height="300" fill="url(#g)"/>
      <circle cx="126" cy="160" r="56" fill="${ok(0.8, 0.15, h + 25)}"/>${bands}
      <g fill="${dark}"><rect x="0" y="182" width="200" height="118"/>${blocks}</g>
      <line x1="0" y1="226" x2="200" y2="210" stroke="${ok(0.8, 0.15, h + 25)}" stroke-width="1" opacity="0.6"/>
      <line x1="0" y1="236" x2="200" y2="220" stroke="${ok(0.8, 0.15, h + 25)}" stroke-width="1" opacity="0.4"/>`;
  },
  orbit(h, c, r) {
    const stars = Array.from(
      { length: 26 },
      () => `<circle cx="${r() * 200}" cy="${r() * 230}" r="${0.5 + r() * 1.4}"/>`
    ).join('');
    return `<rect width="200" height="300" fill="url(#rg)"/>
      <ellipse cx="108" cy="130" rx="92" ry="32" fill="none" stroke="${ok(0.86, c, h - 5, 0.6)}" stroke-width="1.2" transform="rotate(-18 108 130)"/>
      <ellipse cx="108" cy="130" rx="70" ry="22" fill="none" stroke="${ok(0.86, c, h - 5, 0.3)}" stroke-width="0.8" transform="rotate(-18 108 130)"/>
      <circle cx="108" cy="130" r="22" fill="${ok(0.88, c * 0.8, h - 10)}"/>
      <g fill="${ok(0.96, 0.03, h)}">${stars}</g>`;
  },
  ice(h, c, r) {
    const shards = Array.from({ length: 9 }, () => {
      const x = 20 + r() * 160;
      const y = 90 + r() * 150;
      const w = 10 + r() * 22;
      const hh = 40 + r() * 70;
      return `<polygon points="${x},${y - hh} ${x + w},${y} ${x},${y + hh * 0.3} ${x - w * 0.7},${y}" fill="${ok(0.97, 0.02, h, 0.25 + r() * 0.4)}" stroke="${ok(0.98, 0.02, h, 0.7)}" stroke-width="0.8"/>`;
    }).join('');
    return `<rect width="200" height="300" fill="url(#gi)"/>${shards}
      <rect x="0" y="250" width="200" height="50" fill="${ok(0.3, c, h, 0.5)}"/>`;
  },
  lantern(h, c) {
    const spots: [number, number, number][] = [
      [40, 90, 1],
      [100, 130, 1.3],
      [160, 80, 0.9],
      [70, 190, 0.8],
      [140, 205, 1.1],
    ];
    const lanterns = spots
      .map(
        ([x, y, k]) =>
          `<circle cx="${x}" cy="${y}" r="${34 * k}" fill="${ok(0.8, c, h + 20, 0.16)}"/>
          <line x1="${x}" y1="0" x2="${x}" y2="${y - 18 * k}" stroke="${ok(0.7, c, h, 0.6)}" stroke-width="0.8"/>
          <rect x="${x - 11 * k}" y="${y - 16 * k}" width="${22 * k}" height="${32 * k}" rx="${10 * k}" fill="${ok(0.86, c * 1.1, h + 25)}"/>
          <line x1="${x - 11 * k}" y1="${y}" x2="${x + 11 * k}" y2="${y}" stroke="${ok(0.5, c, h)}" stroke-width="0.8"/>`
      )
      .join('');
    return `<rect width="200" height="300" fill="url(#g)"/>${lanterns}`;
  },
  petal(h, c, r) {
    const lines = [0, 1, 2, 3]
      .map(
        i =>
          `<rect x="108" y="${52 + i * 8}" width="${20 + r() * 34}" height="3" fill="${ok(0.95, 0.02, h)}"/>`
      )
      .join('');
    const petals = Array.from(
      { length: 22 },
      () =>
        `<ellipse cx="${r() * 200}" cy="${r() * 260}" rx="5" ry="2.6" transform="rotate(${r() * 40 - 20})" opacity="${0.5 + r() * 0.5}"/>`
    ).join('');
    return `<rect width="200" height="300" fill="url(#g)"/>
      <circle cx="70" cy="120" r="70" fill="${ok(0.86, c * 0.6, h)}"/>
      <rect x="96" y="40" width="80" height="58" rx="4" fill="${ok(0.22, c * 0.4, h)}"/>
      <rect x="102" y="46" width="68" height="40" fill="${ok(0.62, c, h - 150)}"/>${lines}
      <g fill="${ok(0.95, c * 0.5, h)}">${petals}</g>`;
  },
  wave(h, c, r) {
    let waves = '';
    for (let i = 0; i < 7; i++) {
      const y = 120 + i * 26;
      const a = 8 + r() * 8;
      const f = 0.03 + r() * 0.02;
      const ph = r() * 6;
      let d = `M0 ${y}`;
      for (let x = 0; x <= 200; x += 10) d += ` L${x} ${(y + Math.sin(x * f + ph) * a).toFixed(1)}`;
      d += ' L200 300 L0 300Z';
      waves += `<path d="${d}" fill="${ok(0.24 + i * 0.06, c * (0.6 + i * 0.08), h - i * 4)}"/>`;
    }
    return `<rect width="200" height="300" fill="${ok(0.82, c * 0.4, h + 10)}"/>
      <circle cx="160" cy="104" r="16" fill="${ok(0.96, 0.03, 90)}"/>${waves}`;
  },
  blade(h, c, r) {
    const rain = Array.from(
      { length: 14 },
      () =>
        `<rect x="${r() * 200}" y="${r() * 300}" width="1" height="${6 + r() * 20}" fill="${ok(0.82, c, h, 0.5)}"/>`
    ).join('');
    return `<rect width="200" height="300" fill="${ok(0.17, c * 0.3, h)}"/>
      <circle cx="140" cy="96" r="32" fill="${ok(0.6, 0.18, 28)}"/>
      <polygon points="-10,250 210,60 210,92 -10,282" fill="${ok(0.82, c, h)}"/>
      <polygon points="-10,262 210,72 210,76 -10,266" fill="${ok(0.95, 0.03, h)}"/>${rain}`;
  },
  archive(h, c, r) {
    let books = '';
    for (let row = 0; row < 3; row++) {
      let x = 12;
      const base = 106 + row * 48;
      while (x < 186) {
        const w = 6 + r() * 9;
        const hh = 28 + r() * 16;
        books += `<rect x="${x}" y="${base - hh}" width="${w}" height="${hh}" fill="${ok(0.35 + r() * 0.45, c * (0.5 + r() * 0.6), h + (r() - 0.5) * 50)}"/>`;
        x += w + 1.5;
      }
      books += `<rect x="6" y="${base}" width="188" height="4" fill="${ok(0.14, c * 0.3, h)}"/>`;
    }
    return `<rect width="200" height="300" fill="url(#g)"/>${books}`;
  },
  ember(h, _c, r) {
    const sparks = Array.from({ length: 40 }, () => {
      const y = r() * 300;
      return `<circle cx="${r() * 200}" cy="${y}" r="${0.6 + r() * 1.8}" fill="${ok(0.75 + r() * 0.2, 0.17, h + r() * 30)}" opacity="${0.4 + (y / 300) * 0.6}"/>`;
    }).join('');
    const body = ok(0.12, 0.02, h);
    return `<rect width="200" height="300" fill="url(#ge)"/>
      <path d="M86 300 L92 214 Q100 196 108 214 L114 300Z" fill="${body}"/><circle cx="100" cy="200" r="10" fill="${body}"/>
      <path d="M90 196 L78 186 L94 190Z M110 196 L122 186 L106 190Z" fill="${body}"/>${sparks}`;
  },
  forest(h, c, r) {
    let trees = '';
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 9; i++) {
        const x = i * 25 - 10 + r() * 14;
        const base = 200 + layer * 34;
        const hh = 70 + r() * 40 - layer * 8;
        trees += `<polygon points="${x},${base - hh} ${x + 16},${base} ${x - 16},${base}" fill="${ok(0.2 + layer * 0.05, c * (0.7 + layer * 0.2), h - layer * 6)}"/>`;
      }
    }
    return `<rect width="200" height="300" fill="url(#g)"/>
      <circle cx="150" cy="112" r="20" fill="${ok(0.92, 0.05, 95)}"/>
      <circle cx="157" cy="107" r="18" fill="${ok(0.3, c * 0.8, h)}"/>${trees}
      <rect x="0" y="266" width="200" height="34" fill="${ok(0.14, c * 0.5, h)}"/>`;
  },
  glass(h, c, r) {
    let shards = '';
    for (let i = 0; i < 16; i++) {
      const x = r() * 200;
      const y = 40 + r() * 220;
      const k = 12 + r() * 30;
      shards += `<polygon points="${x},${y} ${x + k},${y + k * 0.3} ${x + k * 0.4},${y + k}" fill="${ok(0.75, c, h, 0.15 + r() * 0.3)}" stroke="${ok(0.92, c * 0.6, h, 0.7)}" stroke-width="0.7"/>`;
    }
    return `<rect width="200" height="300" fill="url(#g)"/>${shards}
      <ellipse cx="100" cy="140" rx="46" ry="26" fill="${ok(0.86, c * 1.2, h)}"/>
      <ellipse cx="100" cy="140" rx="6" ry="24" fill="${ok(0.14, 0.03, h)}"/>`;
  },
};

function coverDefs(h: number, c: number): string {
  return `<defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.25" y2="1"><stop offset="0" stop-color="${ok(0.22, c * 0.55, h + 6)}"/><stop offset="1" stop-color="${ok(0.46, c, h)}"/></linearGradient>
    <radialGradient id="rg" cx="0.55" cy="0.4" r="0.8"><stop offset="0" stop-color="${ok(0.5, c * 0.9, h)}"/><stop offset="1" stop-color="${ok(0.16, c * 0.4, h + 20)}"/></radialGradient>
    <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ok(0.86, c * 0.6, h)}"/><stop offset="1" stop-color="${ok(0.42, c * 1.2, h + 10)}"/></linearGradient>
    <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ok(0.14, 0.01, h)}"/><stop offset="0.6" stop-color="${ok(0.3, c * 0.8, h - 10)}"/><stop offset="1" stop-color="${ok(0.62, c * 1.1, h + 10)}"/></linearGradient>
  </defs>`;
}

async function loadSvg(svg: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  return image;
}

function canvasOf(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('shots: no 2d canvas');
  return [canvas, ctx];
}

async function toUrl(canvas: HTMLCanvasElement, type: string, quality?: number) {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error('shots: canvas encode failed');
  return URL.createObjectURL(blob);
}

function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Japanese title set top to bottom, columns right to left, in view box units. */
function jpColumns(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  colour: string
) {
  const chars = [...text];
  const perCol = chars.length <= 4 ? chars.length : Math.ceil(chars.length / 2);
  const cols = Math.ceil(chars.length / perCol);
  ctx.fillStyle = colour;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  chars.forEach((ch, i) => {
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    const small = 'ゃゅょっャュョッ'.includes(ch);
    const glyph = ch === 'ー' ? '丨' : ch;
    ctx.font = `600 ${small ? size * 0.8 : size}px ${FONT_JP}`;
    ctx.fillText(glyph, x + (cols - 1 - col) * size * 1.12, y + row * size * 1.08);
  });
  ctx.textAlign = 'left';
}

/** A cover as an object URL (JPEG), `width` pixels wide at 2:3. */
export async function renderCover(series: ArtSeries, width = 480): Promise<string> {
  const { h, c, motif } = series.art;
  const r = rng(series.key);
  const svg = `<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width * 1.5}">${coverDefs(h, c)}${MOTIFS[motif](h, c, r)}</svg>`;
  const image = await loadSvg(svg);
  const [canvas, ctx] = canvasOf(width, Math.round(width * 1.5));
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const k = width / 200;
  ctx.scale(k, k);

  const light = !series.art.darkTitle;
  const titleColour = light ? ok(0.97, 0.02, h) : ok(0.2, c * 0.5, h);
  const subColour = light ? ok(0.88, c * 0.5, h) : ok(0.3, c * 0.6, h);
  const pos = series.art.title ?? 'top';
  ctx.letterSpacing = '0px';

  if (series.jp && series.art.vertical) {
    jpColumns(ctx, series.jp, pos === 'right' ? 166 : 32, 50, 26, titleColour);
    ctx.font = `500 9px ${FONT_DISPLAY}`;
    ctx.letterSpacing = '1.8px';
    ctx.fillStyle = subColour;
    ctx.fillText(
      series.title.toUpperCase(),
      pos === 'right' ? 18 : 20,
      pos === 'right' ? 272 : 280
    );
  } else if (series.jp) {
    const y = pos === 'bottom' ? 252 : 46;
    ctx.font = `600 ${[...series.jp].length > 6 ? 22 : 28}px ${FONT_JP}`;
    ctx.fillStyle = titleColour;
    ctx.fillText(series.jp, 18, y);
    ctx.font = `500 9px ${FONT_DISPLAY}`;
    ctx.letterSpacing = '1.8px';
    ctx.fillStyle = subColour;
    ctx.fillText(series.title.toUpperCase(), 19, y + 20);
  } else {
    const lines = wrap(series.title.toUpperCase(), 11);
    const y = pos === 'bottom' ? 226 : 40;
    ctx.font = `800 25px ${FONT_DISPLAY}`;
    ctx.fontStretch = 'condensed';
    ctx.letterSpacing = '-0.3px';
    ctx.fillStyle = titleColour;
    lines.forEach((line, i) => ctx.fillText(line, 16, y + i * 25));
    ctx.fontStretch = 'normal';
    ctx.letterSpacing = '0px';
    ctx.font = `400 9px ${FONT_UI}`;
    ctx.fillStyle = subColour;
    ctx.fillText(series.author, 17, y + lines.length * 25 + 2);
  }
  return toUrl(canvas, 'image/jpeg', 0.92);
}

interface Bubble {
  x: number;
  y: number;
  lines: string[];
  size: number;
}

const PAGE_W = 600;
const PAGE_H = 900;

function figure(x: number, y: number, k: number, r: Rand, ink: string, skin = PAPER): string {
  const hair = Array.from({ length: 7 }, (_, i) => {
    const a = Math.PI + (i / 6) * Math.PI;
    return `${x + Math.cos(a) * 30 * k},${y + Math.sin(a) * 34 * k - 4 * k} ${x + Math.cos(a + 0.22) * 46 * k},${y + Math.sin(a + 0.22) * 46 * k}`;
  }).join(' ');
  const coat = r() > 0.5 ? ink : 'oklch(0.96 0 0)';
  return `<g stroke="${ink}" stroke-width="${2.6 * k}" stroke-linejoin="round">
    <path d="M${x - 70 * k} ${y + 160 * k} Q${x - 60 * k} ${y + 60 * k} ${x} ${y + 52 * k} Q${x + 60 * k} ${y + 60 * k} ${x + 70 * k} ${y + 160 * k}Z" fill="${coat}"/>
    <path d="M${x - 12 * k} ${y + 54 * k} L${x} ${y + 76 * k} L${x + 12 * k} ${y + 54 * k}" fill="none"/>
    <ellipse cx="${x}" cy="${y}" rx="${30 * k}" ry="${36 * k}" fill="${skin}"/>
    <polygon points="${x - 34 * k},${y} ${hair} ${x + 34 * k},${y}" fill="${ink}"/>
    <ellipse cx="${x - 11 * k}" cy="${y + 6 * k}" rx="${4 * k}" ry="${6 * k}" fill="${ink}" stroke="none"/>
    <ellipse cx="${x + 11 * k}" cy="${y + 6 * k}" rx="${4 * k}" ry="${6 * k}" fill="${ink}" stroke="none"/>
    <circle cx="${x - 10 * k}" cy="${y + 3 * k}" r="${1.4 * k}" fill="${PAPER}" stroke="none"/>
    <circle cx="${x + 12 * k}" cy="${y + 3 * k}" r="${1.4 * k}" fill="${PAPER}" stroke="none"/>
    <path d="M${x - 5 * k} ${y + 22 * k} Q${x} ${y + 25 * k} ${x + 5 * k} ${y + 22 * k}" fill="none" stroke-width="${1.8 * k}"/>
  </g>`;
}

/** The balloon shape; its text is lettered on the canvas afterwards. */
function bubbleSvg(
  measure: CanvasRenderingContext2D,
  b: Bubble,
  r: Rand,
  ink: string,
  stroke = 2.2
): string {
  measure.font = `500 ${b.size}px ${FONT_UI}`;
  const lineH = b.size * 1.3;
  const w = Math.max(...b.lines.map(l => measure.measureText(l).width)) * 1.42 + b.size * 1.6;
  const hh = b.lines.length * lineH * 1.25 + b.size * 1.5;
  const tail = `M${b.x - 6} ${b.y + hh / 2 - 6} L${b.x - 18 + r() * 36} ${b.y + hh / 2 + 26} L${b.x + 10} ${b.y + hh / 2 - 4}Z`;
  return `<path d="${tail}" fill="${PAPER}" stroke="${ink}" stroke-width="${stroke}"/>
    <ellipse cx="${b.x}" cy="${b.y}" rx="${w / 2}" ry="${hh / 2}" fill="${PAPER}" stroke="${ink}" stroke-width="${stroke}"/>
    <path d="M${b.x - 9} ${b.y + hh / 2 - 7} L${b.x + 11} ${b.y + hh / 2 - 5}" stroke="${PAPER}" stroke-width="${stroke * 2}"/>`;
}

function letter(ctx: CanvasRenderingContext2D, bubbles: Bubble[], ink: string) {
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const b of bubbles) {
    ctx.font = `500 ${b.size}px ${FONT_UI}`;
    const lineH = b.size * 1.3;
    const top = b.y - ((b.lines.length - 1) * lineH) / 2;
    b.lines.forEach((line, i) => ctx.fillText(line, b.x, top + i * lineH));
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

const LAYOUTS: [number, number, number, number][][] = [
  [
    [0, 0, 1, 0.34],
    [0, 0.34, 0.55, 0.36],
    [0.55, 0.34, 0.45, 0.36],
    [0, 0.7, 1, 0.3],
  ],
  [
    [0, 0, 0.6, 0.55],
    [0.6, 0, 0.4, 0.28],
    [0.6, 0.28, 0.4, 0.27],
    [0, 0.55, 0.42, 0.45],
    [0.42, 0.55, 0.58, 0.45],
  ],
  [
    [0, 0, 0.45, 0.3],
    [0.45, 0, 0.55, 0.3],
    [0, 0.3, 1, 0.4],
    [0, 0.7, 0.5, 0.3],
    [0.5, 0.7, 0.5, 0.3],
  ],
  [
    [0, 0, 1, 0.62],
    [0, 0.62, 0.33, 0.38],
    [0.33, 0.62, 0.34, 0.38],
    [0.67, 0.62, 0.33, 0.38],
  ],
];

/**
 * A greyscale manga page (600 by 900 view box) as an object URL: panels,
 * screentone, figures and lettered balloons from `lines`.
 */
export async function renderPage(
  series: ArtSeries,
  n: number,
  lines: readonly string[],
  width = 1200
): Promise<string> {
  const r = rng(`${series.key}:${n}`);
  const [canvas, ctx] = canvasOf(width, Math.round((width * PAGE_H) / PAGE_W));
  const m = 26;
  const g = 12;
  const layout = LAYOUTS[n % LAYOUTS.length] ?? LAYOUTS[0]!;
  const bubbles: Bubble[] = [];
  let panels = '';

  layout.forEach((p, i) => {
    const [px, py, pw0, ph0] = p;
    const x = m + px * (PAGE_W - 2 * m) + (px ? g / 2 : 0);
    const y = m + py * (PAGE_H - 2 * m) + (py ? g / 2 : 0);
    const pw = pw0 * (PAGE_W - 2 * m) - (px ? g / 2 : 0) - (px + pw0 < 0.99 ? g / 2 : 0);
    const ph = ph0 * (PAGE_H - 2 * m) - (py ? g / 2 : 0) - (py + ph0 < 0.99 ? g / 2 : 0);
    const kind = [2, 1, 2, 0, 3, 2, 4, 1][Math.floor(r() * 8)] ?? 2;
    const cx = x + pw / 2;
    const cy = y + ph / 2;
    let inner = '';
    if (kind === 0) {
      inner = `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="url(#tone)"/>
        <circle cx="${x + pw * 0.75}" cy="${y + ph * 0.32}" r="${Math.min(pw, ph) * 0.16}" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>
        ${figure(x + pw * 0.3, y + ph * 0.55, Math.min(pw, ph) / 240, r, INK)}`;
    } else if (kind === 1) {
      const radius = Math.max(pw, ph);
      inner =
        Array.from({ length: 48 }, (_, k) => {
          const a = (k / 48) * Math.PI * 2;
          return `<line x1="${cx + Math.cos(a) * 40}" y1="${cy + Math.sin(a) * 40}" x2="${cx + Math.cos(a) * radius}" y2="${cy + Math.sin(a) * radius}" stroke="${INK}" stroke-width="${0.6 + r() * 1.6}"/>`;
        }).join('') + figure(cx, cy - 10, Math.min(pw, ph) / 230, r, INK);
    } else if (kind === 2) {
      inner = `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="url(#tone)" opacity="0.5"/>
        ${figure(x + pw * (0.58 + r() * 0.16), y + ph * 0.46, Math.min(pw, ph) / 200, r, INK)}`;
    } else if (kind === 3) {
      for (let k = 0; k < 9; k++) {
        const bx = x + r() * pw;
        const bw = 20 + r() * 50;
        const bh = ph * (0.3 + r() * 0.5);
        inner += `<rect x="${bx}" y="${y + ph - bh}" width="${bw}" height="${bh}" fill="${r() > 0.4 ? INK : 'url(#tone)'}" stroke="${INK}" stroke-width="1.5"/>`;
      }
    } else {
      inner = `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="oklch(0.9 0 0)"/>
        ${Array.from({ length: 6 }, (_, k) => `<line x1="${x}" y1="${y + ph * (k / 6)}" x2="${x + pw}" y2="${y + ph * (k / 6) + 10}" stroke="${INK}" stroke-width="1" opacity="0.5"/>`).join('')}
        <ellipse cx="${cx}" cy="${cy}" rx="${pw * 0.28}" ry="${ph * 0.16}" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>
        <circle cx="${cx}" cy="${cy}" r="${ph * 0.1}" fill="${INK}"/>
        <circle cx="${cx + ph * 0.03}" cy="${cy - ph * 0.04}" r="${ph * 0.025}" fill="${PAPER}"/>`;
    }
    let say = '';
    if (r() > 0.3 && pw > 200) {
      const text = lines[Math.floor(r() * lines.length)] ?? '';
      const b = { x: x + Math.min(pw * 0.3, 120), y: y + 56, lines: wrap(text, 13), size: 17 };
      say = bubbleSvg(ctx, b, r, INK);
      bubbles.push(b);
    }
    panels += `<clipPath id="c${i}"><rect x="${x}" y="${y}" width="${pw}" height="${ph}"/></clipPath>
      <g clip-path="url(#c${i})"><rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="oklch(0.97 0 0)"/>${inner}${say}</g>
      <rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="none" stroke="${INK}" stroke-width="3"/>`;
  });

  const svg = `<svg viewBox="0 0 ${PAGE_W} ${PAGE_H}" xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
    <defs><pattern id="tone" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="3.5" cy="3.5" r="1.4" fill="${INK}"/></pattern></defs>
    <rect width="${PAGE_W}" height="${PAGE_H}" fill="oklch(0.965 0.004 90)"/>${panels}</svg>`;
  const image = await loadSvg(svg);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const k = canvas.width / PAGE_W;
  ctx.scale(k, k);
  letter(ctx, bubbles, INK);
  ctx.font = `400 11px ${FONT_UI}`;
  ctx.fillStyle = 'oklch(0.5 0 0)';
  ctx.textAlign = 'center';
  ctx.fillText(String(n), PAGE_W / 2, PAGE_H - 8);
  return toUrl(canvas, 'image/png');
}

const STRIP_W = 720;
const STRIP_H = 1600;

const CAPTIONS = [
  'That night the river glowed.',
  'The fire had not gone out.',
  'Someone was still inside.',
  'The alarm never rang.',
];

/** Head and shoulders of a webtoon character, centred on (x, y) for the face. */
function bust(x: number, y: number, k: number, h: number, c: number, mood: number): string {
  const skin = ok(0.88, 0.04, 60);
  const hair = ok(0.93, 0.02, h);
  const line = ok(0.25, c * 0.5, h);
  const coat = ok(0.32, c * 0.8, h - 20);
  const iris = ok(0.5, 0.14, (h + 180) % 360);
  const eye = (
    ex: number
  ) => `<ellipse cx="${ex}" cy="${y + 8 * k}" rx="${7 * k}" ry="${10 * k}" fill="${iris}"/>
    <ellipse cx="${ex}" cy="${y + 10 * k}" rx="${3.6 * k}" ry="${5.6 * k}" fill="${ok(0.2, 0.05, h)}"/>
    <circle cx="${ex - 2.4 * k}" cy="${y + 4 * k}" r="${2.4 * k}" fill="${PAPER}"/>
    <path d="M${ex - 10 * k} ${y - 4 * k} Q${ex} ${y - 9 * k} ${ex + 10 * k} ${y - 4 * k}" stroke="${line}" stroke-width="${2.4 * k}" fill="none" stroke-linecap="round"/>`;
  const mouth =
    mood === 0
      ? `<path d="M${x - 7 * k} ${y + 34 * k} Q${x} ${y + 39 * k} ${x + 7 * k} ${y + 34 * k}" stroke="${line}" stroke-width="${2 * k}" fill="none" stroke-linecap="round"/>`
      : `<ellipse cx="${x}" cy="${y + 35 * k}" rx="${5 * k}" ry="${4 * k}" fill="${ok(0.45, 0.1, 20)}"/>`;
  return `<path d="M${x - 120 * k} ${y + 250 * k} Q${x - 110 * k} ${y + 90 * k} ${x - 30 * k} ${y + 78 * k} L${x + 30 * k} ${y + 78 * k} Q${x + 110 * k} ${y + 90 * k} ${x + 120 * k} ${y + 250 * k}Z" fill="${coat}"/>
    <path d="M${x - 30 * k} ${y + 78 * k} L${x} ${y + 120 * k} L${x + 30 * k} ${y + 78 * k}" fill="${ok(0.9, 0.02, h)}"/>
    <rect x="${x - 14 * k}" y="${y + 40 * k}" width="${28 * k}" height="${42 * k}" fill="${ok(0.8, 0.05, 55)}"/>
    <ellipse cx="${x}" cy="${y - 14 * k}" rx="${62 * k}" ry="${62 * k}" fill="${hair}"/>
    <path d="M${x - 64 * k} ${y - 10 * k} Q${x - 70 * k} ${y + 60 * k} ${x - 40 * k} ${y + 70 * k} L${x + 40 * k} ${y + 70 * k} Q${x + 70 * k} ${y + 60 * k} ${x + 64 * k} ${y - 10 * k}Z" fill="${hair}"/>
    <ellipse cx="${x}" cy="${y + 8 * k}" rx="${46 * k}" ry="${54 * k}" fill="${skin}"/>
    <path d="M${x - 56 * k} ${y + 4 * k} Q${x - 62 * k} ${y - 74 * k} ${x} ${y - 70 * k} Q${x + 62 * k} ${y - 74 * k} ${x + 56 * k} ${y + 4 * k} L${x + 44 * k} ${y - 26 * k} L${x + 30 * k} ${y - 8 * k} L${x + 18 * k} ${y - 32 * k} L${x} ${y - 12 * k} L${x - 16 * k} ${y - 34 * k} L${x - 30 * k} ${y - 10 * k} L${x - 44 * k} ${y - 28 * k}Z" fill="${hair}"/>
    ${eye(x - 18 * k)}${eye(x + 18 * k)}
    <ellipse cx="${x - 30 * k}" cy="${y + 26 * k}" rx="${8 * k}" ry="${3.5 * k}" fill="${ok(0.75, 0.1, 20, 0.45)}"/>
    <ellipse cx="${x + 30 * k}" cy="${y + 26 * k}" rx="${8 * k}" ry="${3.5 * k}" fill="${ok(0.75, 0.1, 20, 0.45)}"/>${mouth}`;
}

/** A wide establishing panel: the skyline under a burning sky, or a close-up of the eyes. */
function scene(
  x: number,
  y: number,
  w: number,
  hh: number,
  h: number,
  c: number,
  r: Rand,
  n: number
) {
  if (n % 3 === 1) {
    const eye = (
      ex: number
    ) => `<ellipse cx="${ex}" cy="${y + hh / 2}" rx="${w * 0.15}" ry="${hh * 0.2}" fill="${PAPER}"/>
      <circle cx="${ex}" cy="${y + hh / 2}" r="${hh * 0.17}" fill="${ok(0.5, 0.14, (h + 180) % 360)}"/>
      <circle cx="${ex}" cy="${y + hh / 2}" r="${hh * 0.09}" fill="${ok(0.18, 0.05, h)}"/>
      <circle cx="${ex - hh * 0.06}" cy="${y + hh * 0.43}" r="${hh * 0.04}" fill="${PAPER}"/>
      <path d="M${ex - w * 0.17} ${y + hh * 0.3} Q${ex} ${y + hh * 0.18} ${ex + w * 0.17} ${y + hh * 0.3}" stroke="${ok(0.25, c * 0.5, h)}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    return `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${ok(0.86, 0.04, 60)}"/>${eye(x + w * 0.3)}${eye(x + w * 0.7)}
      ${Array.from({ length: 12 }, (_, i) => `<line x1="${x + w * 0.08 + i * 4}" y1="${y + hh * 0.85}" x2="${x + w * 0.04 + i * 4}" y2="${y + hh * 0.95}" stroke="${ok(0.6, 0.1, 20, 0.5)}" stroke-width="2"/>`).join('')}`;
  }
  let city = '';
  let bx = x - 10;
  while (bx < x + w) {
    const bw = 40 + r() * 60;
    const bh = hh * (0.25 + r() * 0.4);
    city += `<rect x="${bx}" y="${y + hh - bh}" width="${bw}" height="${bh}" fill="${ok(0.14, c * 0.4, h - 10)}"/>`;
    for (let wy = y + hh - bh + 14; wy < y + hh - 14; wy += 22) {
      for (let wx = bx + 8; wx < bx + bw - 12; wx += 16) {
        if (r() > 0.55)
          city += `<rect x="${wx}" y="${wy}" width="7" height="10" fill="${ok(0.82, 0.14, h + 30, 0.85)}"/>`;
      }
    }
    bx += bw + 4;
  }
  const sparks = Array.from(
    { length: 40 },
    () =>
      `<circle cx="${x + r() * w}" cy="${y + r() * hh}" r="${1 + r() * 3}" fill="${ok(0.88, 0.15, h + 25, 0.5 + r() * 0.5)}"/>`
  ).join('');
  return `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="url(#sky)"/>
    <circle cx="${x + w * 0.72}" cy="${y + hh * 0.34}" r="${hh * 0.16}" fill="${ok(0.86, 0.13, h + 30)}"/>
    <circle cx="${x + w * 0.72}" cy="${y + hh * 0.34}" r="${hh * 0.26}" fill="${ok(0.86, 0.13, h + 30, 0.18)}"/>${city}${sparks}`;
}

/**
 * A full colour webtoon strip (720 by 1600 view box, a tall strip) in the
 * series palette: a wide scene panel and a character panel, with a caption.
 */
export async function renderStrip(
  series: ArtSeries,
  n: number,
  lines: readonly string[],
  width = 1440
): Promise<string> {
  const r = rng(`${series.key}w${n}`);
  const { h, c } = series.art;
  const [canvas, ctx] = canvasOf(width, Math.round((width * STRIP_H) / STRIP_W));
  const ink = ok(0.15, c * 0.4, h);
  const sceneFirst = n % 2 === 0;
  const sceneH = 500;
  const bustH = 640;
  const sceneY = sceneFirst ? 60 : 900;
  const bustY = sceneFirst ? 760 : 60;
  const captionY = sceneFirst ? 600 : 740;
  const bustX = 230 + r() * 260;
  const bubbles: Bubble[] = [];
  const text = lines[Math.floor(r() * lines.length)] ?? '';
  const b = {
    x: bustX > STRIP_W / 2 ? 190 : 530,
    y: bustY + 120,
    lines: wrap(text, 13),
    size: 24,
  };
  const say = bubbleSvg(ctx, b, r, ink, 2.6);
  bubbles.push(b);
  const caption = CAPTIONS[n % CAPTIONS.length] ?? '';
  const captionBox = {
    x: sceneFirst ? 300 : 420,
    y: captionY + 50,
    lines: [caption],
    size: 21,
  };
  ctx.font = `500 ${captionBox.size}px ${FONT_UI}`;
  const captionW = ctx.measureText(caption).width + 56;
  const bustPanel = `<clipPath id="bp"><rect x="40" y="${bustY}" width="640" height="${bustH}" rx="6"/></clipPath>
    <g clip-path="url(#bp)"><rect x="40" y="${bustY}" width="640" height="${bustH}" fill="url(#back)"/>
    ${Array.from({ length: 18 }, () => `<circle cx="${40 + r() * 640}" cy="${bustY + r() * bustH}" r="${1 + r() * 2.5}" fill="${ok(0.95, c * 0.5, h + 40, 0.3 + r() * 0.5)}"/>`).join('')}
    ${bust(bustX, bustY + 280, 1.8, h, c, n % 2)}${say}</g>`;
  const scenePanel = `<clipPath id="sp"><rect x="40" y="${sceneY}" width="640" height="${sceneH}" rx="6"/></clipPath>
    <g clip-path="url(#sp)">${scene(40, sceneY, 640, sceneH, h, c, r, n)}</g>`;
  const captionSvg = `<rect x="${captionBox.x - captionW / 2}" y="${captionY + 20}" width="${captionW}" height="60" rx="4" fill="${ok(0.95, 0.03, h + 40)}" stroke="${ink}" stroke-width="2"/>`;
  const sceneMarkup = `${scenePanel}${captionSvg}`;
  const svg = `<svg viewBox="0 0 ${STRIP_W} ${STRIP_H}" xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ok(0.3, c, h - 10)}"/><stop offset="1" stop-color="${ok(0.68, c * 0.9, h + 25)}"/></linearGradient>
      <linearGradient id="back" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${ok(0.42, c * 0.9, h)}"/><stop offset="1" stop-color="${ok(0.22, c * 0.6, h - 20)}"/></linearGradient>
    </defs>
    <rect width="${STRIP_W}" height="${STRIP_H}" fill="${ok(0.13, c * 0.25, h)}"/>${sceneMarkup}${bustPanel}</svg>`;
  const image = await loadSvg(svg);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const scale = canvas.width / STRIP_W;
  ctx.scale(scale, scale);
  letter(ctx, [...bubbles, captionBox], ink);
  return toUrl(canvas, 'image/png');
}

export const PAGE_SIZE = { width: PAGE_W, height: PAGE_H };
export const STRIP_SIZE = { width: STRIP_W, height: STRIP_H };

/** Waits for the faces the lettering uses, so no canvas draws with a fallback. */
export async function loadArtFonts(jp: string): Promise<void> {
  await Promise.all([
    document.fonts.load(`600 26px ${FONT_JP}`, jp),
    document.fonts.load(`800 25px ${FONT_DISPLAY}`, 'ABC'),
    document.fonts.load(`500 9px ${FONT_DISPLAY}`, 'ABC'),
    document.fonts.load(`500 17px ${FONT_UI}`, 'Abc'),
    document.fonts.load(`400 9px ${FONT_UI}`, 'Abc'),
  ]);
}
