/**
 * Paints the placeholder volumes' covers, spines and page edges onto canvases.
 * The art matches the SVG covers in the theming demo, drawn in a 200 by 300
 * cover space and scaled up.
 */
import { oklchToHex as ok } from '../lib/color';

const COVER_W = 200;
const COVER_H = 300;
const SCALE = 2.56; // 512 by 768 pixels

const JP = '600 30px "Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif';
const LATIN = '500 10px "Bricolage Grotesque Variable", system-ui, sans-serif';

/** Loads the glyphs the covers use, so the canvases are not painted with a fallback. */
export async function loadCoverFonts(): Promise<void> {
  if (!('fonts' in document)) return;
  const wait = Promise.all([
    document.fonts.load(JP, '月夜の書店茜シグナル星屑リレー灰と火種菫の書庫巻'),
    document.fonts.load(LATIN, 'THE MOONLIT BOOKSHOP AKANE SIGNAL STARDUST RELAY 0123456789'),
  ]);
  // Never hold the scene back for long on a slow font fetch.
  await Promise.race([wait, new Promise(resolve => setTimeout(resolve, 2500))]);
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');
  return [el, ctx];
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  font: string,
  fill: string,
  spacing = 0
) {
  ctx.font = font;
  ctx.fillStyle = fill;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(value, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function rects(ctx: CanvasRenderingContext2D, fill: string, list: number[][]) {
  ctx.fillStyle = fill;
  for (const [x, y, w, h] of list) ctx.fillRect(x, y, w, h);
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A soft sheen across the cover, like light on a laminated jacket. */
function sheen(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, COVER_W, COVER_H * 0.6);
  g.addColorStop(0, 'rgba(255,255,255,0.13)');
  g.addColorStop(0.38, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, COVER_W, COVER_H);
}

function moonlit(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, COVER_W * 0.3, COVER_H);
  g.addColorStop(0, ok(0.22, 0.07, 275));
  g.addColorStop(1, ok(0.42, 0.14, 265));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, COVER_W, COVER_H);
  circle(ctx, 140, 78, 40, ok(0.92, 0.07, 90));
  circle(ctx, 154, 70, 36, ok(0.25, 0.08, 272));
  const night = ok(0.16, 0.05, 270);
  rects(ctx, night, [
    [0, 196, 200, 104],
    [18, 150, 9, 46],
    [29, 160, 7, 36],
    [38, 142, 10, 54],
    [50, 166, 6, 30],
    [58, 154, 9, 42],
  ]);
  rects(ctx, ok(0.82, 0.12, 80), [[112, 150, 56, 46]]);
  ctx.strokeStyle = night;
  ctx.lineWidth = 3;
  ctx.strokeRect(112, 150, 56, 46);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(140, 150);
  ctx.lineTo(140, 196);
  ctx.stroke();
  const ink = ok(0.96, 0.02, 90);
  for (const [ch, x, y] of [
    ['月', 54, 48],
    ['夜', 54, 80],
    ['の', 54, 112],
    ['書', 22, 48],
    ['店', 22, 80],
  ] as const) {
    text(ctx, ch, x, y, '600 28px "Shippori Mincho", serif', ink);
  }
  text(ctx, 'THE MOONLIT BOOKSHOP', 20, 250, LATIN, ok(0.85, 0.05, 270), 2);
}

function akane(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, COVER_H);
  g.addColorStop(0, ok(0.5, 0.17, 30));
  g.addColorStop(0.55, ok(0.36, 0.14, 18));
  g.addColorStop(1, ok(0.17, 0.05, 15));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, COVER_W, COVER_H);
  circle(ctx, 128, 150, 54, ok(0.78, 0.15, 55));
  rects(ctx, ok(0.17, 0.05, 15), [
    [0, 170, 200, 130],
    [12, 128, 22, 50],
    [40, 110, 16, 70],
    [62, 140, 28, 40],
    [150, 120, 20, 60],
    [174, 146, 26, 34],
  ]);
  rects(ctx, 'rgba(240,170,90,0.45)', [
    [0, 190, 200, 1],
    [0, 200, 200, 1],
  ]);
  text(ctx, '茜シグナル', 16, 44, JP, ok(0.96, 0.02, 60));
  text(ctx, 'AKANE SIGNAL', 17, 64, LATIN, ok(0.9, 0.04, 50), 2);
}

function stardust(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(120, 105, 0, 120, 105, 240);
  g.addColorStop(0, ok(0.48, 0.1, 195));
  g.addColorStop(1, ok(0.16, 0.04, 220));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, COVER_W, COVER_H);
  ctx.save();
  ctx.translate(110, 140);
  ctx.rotate((-18 * Math.PI) / 180);
  ctx.beginPath();
  ctx.ellipse(0, 0, 92, 34, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(150,230,225,0.6)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
  circle(ctx, 110, 140, 22, ok(0.88, 0.08, 185));
  for (const [x, y, r] of [
    [30, 96, 1.6],
    [170, 60, 1.2],
    [150, 210, 1.8],
    [44, 200, 1],
    [88, 70, 1],
    [182, 160, 1.4],
    [60, 150, 0.9],
  ]) {
    circle(ctx, x, y, r, ok(0.95, 0.03, 190));
  }
  text(ctx, '星屑リレー', 20, 262, JP, ok(0.97, 0.02, 190));
  text(ctx, 'STARDUST RELAY', 21, 282, LATIN, ok(0.88, 0.05, 190), 2);
}

const COVER_ART: Record<string, (ctx: CanvasRenderingContext2D) => void> = {
  moonlit,
  akane,
  stardust,
};

export function paintCover(id: string): HTMLCanvasElement {
  const [el, ctx] = canvas(COVER_W * SCALE, COVER_H * SCALE);
  ctx.scale(SCALE, SCALE);
  (COVER_ART[id] ?? moonlit)(ctx);
  sheen(ctx);
  return el;
}

/** A spine, long side horizontal: title runs along it, volume number at the end. */
export function paintSpine(title: string, volume: number, hue: number, chroma: number) {
  const [el, ctx] = canvas(768, 96);
  const g = ctx.createLinearGradient(0, 0, 0, 96);
  g.addColorStop(0, ok(0.3, chroma * 0.9, hue));
  g.addColorStop(0.5, ok(0.4, chroma, hue));
  g.addColorStop(1, ok(0.26, chroma * 0.8, hue));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 768, 96);
  ctx.fillStyle = ok(0.82, chroma * 0.6, hue);
  ctx.fillRect(56, 10, 2, 76);
  ctx.fillRect(668, 10, 2, 76);
  ctx.textBaseline = 'middle';
  text(ctx, title, 92, 50, '600 46px "Shippori Mincho", serif', ok(0.95, 0.02, hue), 6);
  text(
    ctx,
    String(volume).padStart(2, '0'),
    690,
    50,
    '600 36px "Bricolage Grotesque Variable", sans-serif',
    ok(0.9, 0.04, hue)
  );
  return el;
}

/** A manga page: panels with gutters, screentone greys and a speech bubble. */
export function paintMangaPage(seed: number): HTMLCanvasElement {
  const [el, ctx] = canvas(256, 364);
  ctx.fillStyle = ok(0.95, 0.012, 85);
  ctx.fillRect(0, 0, 256, 364);
  let n = seed * 9301 + 49297;
  const rand = () => (n = (n * 9301 + 49297) % 233280) / 233280;
  const rows = seed % 2 ? [0.32, 0.36, 0.32] : [0.4, 0.28, 0.32];
  let y = 16;
  for (const share of rows) {
    const h = share * 332 - 8;
    const split = rand() > 0.35 ? 0.35 + rand() * 0.3 : 1;
    const cells =
      split < 1
        ? [
            [16, 224 * split - 4],
            [16 + 224 * split + 4, 224 * (1 - split) - 4],
          ]
        : [[16, 224]];
    for (const [x, w] of cells) {
      const tone = 0.55 + rand() * 0.35;
      ctx.fillStyle = ok(tone, 0.008, 85);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = ok(0.25, 0.01, 270);
      ctx.fillRect(x + w * 0.2, y + h * (0.35 + rand() * 0.2), w * (0.3 + rand() * 0.3), h * 0.5);
      ctx.strokeStyle = ok(0.18, 0.01, 270);
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, w, h);
      if (rand() > 0.5) {
        ctx.beginPath();
        ctx.ellipse(x + w * 0.72, y + h * 0.28, w * 0.18, h * 0.16, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#fbfaf6';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    y += h + 8;
  }
  return el;
}

/** One tile of the ribbon: a strip of four panels with grey ink swirls. */
export function paintRibbon(): HTMLCanvasElement {
  const [el, ctx] = canvas(1024, 192);
  const g = ctx.createLinearGradient(0, 0, 0, 192);
  g.addColorStop(0, ok(0.93, 0.02, 300));
  g.addColorStop(0.5, ok(0.97, 0.012, 80));
  g.addColorStop(1, ok(0.93, 0.02, 300));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 192);
  ctx.strokeStyle = ok(0.62, 0.02, 290);
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const x = i * 256 + 14;
    ctx.strokeRect(x, 22, 228, 148);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 22, 228, 148);
    ctx.clip();
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      const y = 60 + k * 34 + (i % 2) * 10;
      ctx.moveTo(x - 10, y + 20);
      ctx.bezierCurveTo(x + 60, y - 40, x + 120, y + 50, x + 240, y - 10);
      ctx.lineWidth = 14 - k * 4;
      ctx.strokeStyle = ok(0.7 - k * 0.06, 0.015, 280);
      ctx.stroke();
    }
    ctx.restore();
  }
  return el;
}

/** Page edges: cream paper with faint sheet lines. */
export function paintPages(): HTMLCanvasElement {
  const [el, ctx] = canvas(64, 256);
  ctx.fillStyle = ok(0.9, 0.02, 85);
  ctx.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 2) {
    ctx.fillStyle = `rgba(90,70,40,${0.05 + ((y * 37) % 11) / 160})`;
    ctx.fillRect(0, y, 64, 1);
  }
  return el;
}

/** A soft contact shadow for the floor under the stack. */
export function paintShadow(): HTMLCanvasElement {
  const [el, ctx] = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.7)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return el;
}
