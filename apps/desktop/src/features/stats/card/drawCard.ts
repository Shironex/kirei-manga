import { COVER_ALPHA, type CardTheme } from './cardTheme';
import { fitText, wrapText, type CardModel } from './cardModel';

/**
 * Paints the year in review card on a 2D canvas. One code path for the
 * preview on the stats page and the exported PNG: the preview is this canvas
 * scaled down by CSS. Uses only what every webview's canvas has (no
 * ctx.filter, no oklch() colours, no font-variation-settings), so the PNG
 * looks the same on macOS and Windows.
 */

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const PAD = 88;
const DISPLAY = "'Bricolage Grotesque', 'Arial Narrow', system-ui, sans-serif";
const UI = "'Onest', system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Consolas, monospace";
const JP = "'Shippori Mincho', 'Hiragino Mincho ProN', 'Yu Mincho', serif";

/** The fonts the card uses, for `document.fonts.load` before drawing. */
export const CARD_FONTS = [
  `800 200px ${DISPLAY}`,
  `700 64px ${DISPLAY}`,
  `600 28px ${DISPLAY}`,
  `500 26px ${UI}`,
  `600 26px ${UI}`,
  `500 18px ${MONO}`,
  `600 30px ${JP}`,
];

/** An image the card can draw: a decoded cover. */
export type CardImage = CanvasImageSource & { width: number; height: number };

type Ctx = CanvasRenderingContext2D;

/** Narrower glyphs where the canvas supports it (maps to Bricolage's wdth axis). */
function condensed(ctx: Ctx, on: boolean) {
  if ('fontStretch' in ctx) ctx.fontStretch = on ? 'condensed' : 'normal';
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

/** Mulberry32: the grain is the same on every render, so the PNG is stable. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Draws `image` to fill the rect like CSS object-fit: cover. */
function drawCover(ctx: Ctx, image: CardImage, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
}

/**
 * A soft blur without ctx.filter: shrink the cover to a few pixels, then let
 * smoothing stretch it back up.
 */
function blurredCover(image: CardImage): CanvasImageSource | null {
  if (typeof document === 'undefined') return null;
  const small = document.createElement('canvas');
  small.width = 12;
  small.height = 15;
  const sctx = small.getContext('2d');
  if (!sctx) return null;
  sctx.imageSmoothingQuality = 'high';
  drawCover(sctx, image, 0, 0, small.width, small.height);
  return small;
}

/** A series without a cover: a tinted card with its initial. */
function placeholderCover(
  ctx: Ctx,
  theme: CardTheme,
  title: string,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const fill = ctx.createLinearGradient(x, y, x + w, y + h);
  fill.addColorStop(0, theme.heat[1]);
  fill.addColorStop(1, theme.panel);
  ctx.fillStyle = theme.backgroundDeep;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = theme.text;
  ctx.font = `800 ${Math.round(w * 0.6)}px ${DISPLAY}`;
  condensed(ctx, true);
  ctx.fillText(Array.from(title.trim())[0]?.toLocaleUpperCase() ?? '', x + w * 0.14, y + h * 0.9);
  condensed(ctx, false);
}

/**
 * The cover of the year, crisp and slightly turned, in the space beside the
 * year. Drawn after the background glow and before any text.
 */
function featuredCover(ctx: Ctx, theme: CardTheme, image: CardImage) {
  const w = 262;
  const h = 393;
  ctx.save();
  ctx.translate(CARD_WIDTH - PAD - w / 2 - 6, 352);
  ctx.rotate((4 * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 30;
  ctx.fillStyle = theme.backgroundDeep;
  roundRect(ctx, -w / 2, -h / 2, w, h, 8);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();
  drawCover(ctx, image, -w / 2, -h / 2, w, h);
  ctx.restore();
  ctx.save();
  ctx.translate(CARD_WIDTH - PAD - w / 2 - 6, 352);
  ctx.rotate((4 * Math.PI) / 180);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 2;
  roundRect(ctx, -w / 2, -h / 2, w, h, 8);
  ctx.stroke();
  ctx.restore();
}

function background(ctx: Ctx, theme: CardTheme, hero: CardImage | undefined) {
  const base = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  base.addColorStop(0, theme.background);
  base.addColorStop(1, theme.backgroundDeep);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const blur = hero && blurredCover(hero);
  if (blur) {
    ctx.save();
    ctx.globalAlpha = COVER_ALPHA;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(blur, -60, -80, CARD_WIDTH + 120, 900);
    ctx.restore();
    // Melt the cover into the base towards the middle of the card.
    const fade = ctx.createLinearGradient(0, 360, 0, 820);
    fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    fade.addColorStop(1, theme.background);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 360, CARD_WIDTH, 460);
  }

  const glow = (x: number, y: number, r: number, from: string, to: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, from);
    g.addColorStop(1, to);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  };
  glow(CARD_WIDTH * 0.92, 120, 760, theme.glowPrimary, theme.glowPrimaryClear);
  glow(-40, CARD_HEIGHT * 0.78, 700, theme.glowSecondary, theme.glowSecondaryClear);

  // Film grain, very faint.
  const rand = random(0x6b697265);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
  for (let i = 0; i < 9000; i++) {
    ctx.fillRect(rand() * CARD_WIDTH, rand() * CARD_HEIGHT, 1.5, 1.5);
  }
}

function header(ctx: Ctx, theme: CardTheme) {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = theme.text;
  ctx.font = `600 30px ${JP}`;
  ctx.fillText('綺麗漫画', PAD, 112);
  const jpWidth = ctx.measureText('綺麗漫画').width;
  ctx.fillStyle = theme.textSoft;
  ctx.font = `600 28px ${DISPLAY}`;
  condensed(ctx, true);
  ctx.fillText('KireiManga', PAD + jpWidth + 16, 112);
  condensed(ctx, false);

  ctx.textAlign = 'right';
  ctx.fillStyle = theme.accent;
  ctx.font = `500 18px ${MONO}`;
  ctx.letterSpacing = '4px';
  ctx.fillText('YEAR IN REVIEW', CARD_WIDTH - PAD, 108);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
}

function hero(ctx: Ctx, model: CardModel, theme: CardTheme) {
  ctx.fillStyle = theme.text;
  ctx.font = `800 236px ${DISPLAY}`;
  condensed(ctx, true);
  ctx.letterSpacing = '-6px';
  ctx.fillText(model.year, PAD - 8, 360);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = theme.accent;
  ctx.font = `800 132px ${DISPLAY}`;
  ctx.fillText(model.hero.value, PAD - 4, 528);
  const width = ctx.measureText(model.hero.value).width;
  condensed(ctx, false);
  ctx.fillStyle = theme.textSoft;
  ctx.font = `500 32px ${UI}`;
  ctx.fillText(model.hero.unit, PAD + width + 18, 526);
}

function tiles(ctx: Ctx, model: CardModel, theme: CardTheme) {
  const top = 590;
  const width = (CARD_WIDTH - PAD * 2) / model.tiles.length;
  ctx.fillStyle = theme.line;
  ctx.fillRect(PAD, top, CARD_WIDTH - PAD * 2, 1.5);
  model.tiles.forEach((tile, i) => {
    const x = PAD + i * width;
    if (i > 0) {
      ctx.fillStyle = theme.line;
      ctx.fillRect(x - 1, top + 28, 1.5, 96);
    }
    const inset = i > 0 ? 24 : 0;
    ctx.fillStyle = theme.text;
    ctx.font = `700 64px ${DISPLAY}`;
    condensed(ctx, true);
    ctx.fillText(
      fitText(tile.value, width - inset - 12, s => ctx.measureText(s).width),
      x + inset,
      top + 92
    );
    condensed(ctx, false);
    ctx.fillStyle = theme.textSoft;
    ctx.font = `500 22px ${UI}`;
    ctx.fillText(
      fitText(tile.label, width - inset - 12, s => ctx.measureText(s).width),
      x + inset,
      top + 128
    );
  });
}

function heatmap(ctx: Ctx, model: CardModel, theme: CardTheme) {
  const top = 818;
  const columns = model.heat.length;
  const step = (CARD_WIDTH - PAD * 2) / columns;
  const size = step - 3.5;
  ctx.fillStyle = theme.textSoft;
  ctx.font = `500 18px ${MONO}`;
  ctx.letterSpacing = '3px';
  ctx.fillText('EVERY DAY OF THE YEAR', PAD, top - 22);
  ctx.letterSpacing = '0px';
  model.heat.forEach((week, column) => {
    week.forEach((level, row) => {
      if (level === null) return;
      ctx.fillStyle = theme.heat[level];
      roundRect(ctx, PAD + column * step, top + row * step, size, size, 3);
      ctx.fill();
    });
  });
}

function topSeries(ctx: Ctx, model: CardModel, theme: CardTheme, covers: Map<string, CardImage>) {
  const top = 1010;
  ctx.fillStyle = theme.textSoft;
  ctx.font = `500 18px ${MONO}`;
  ctx.letterSpacing = '3px';
  ctx.fillText(model.top.length ? 'MOST READ' : 'YOUR SHELF IS WAITING', PAD, top);
  ctx.letterSpacing = '0px';
  const columnWidth = (CARD_WIDTH - PAD * 2) / 3;
  const coverW = 112;
  const coverH = 168;
  model.top.forEach((series, i) => {
    const x = PAD + i * columnWidth;
    const y = top + 30;
    const image = series.cover ? covers.get(series.cover.hash) : undefined;
    ctx.save();
    roundRect(ctx, x, y, coverW, coverH, 6);
    ctx.clip();
    if (image) {
      drawCover(ctx, image, x, y, coverW, coverH);
    } else {
      placeholderCover(ctx, theme, series.title, x, y, coverW, coverH);
    }
    ctx.restore();
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, coverW, coverH, 6);
    ctx.stroke();

    ctx.fillStyle = theme.accent;
    ctx.font = `600 18px ${MONO}`;
    ctx.fillText(`0${i + 1}`, x + coverW + 18, y + 22);
    const textX = x + coverW + 18;
    const textW = columnWidth - coverW - 34;
    ctx.fillStyle = theme.text;
    ctx.font = `600 25px ${UI}`;
    const lines = wrapText(series.title, textW, 3, s => ctx.measureText(s).width);
    lines.forEach((line, n) => ctx.fillText(line, textX, y + 62 + n * 31));
    ctx.fillStyle = theme.textSoft;
    ctx.font = `500 19px ${UI}`;
    const meta = wrapText(
      series.line,
      textW,
      lines.length >= 3 ? 1 : 2,
      s => ctx.measureText(s).width
    );
    meta.forEach((line, n) => ctx.fillText(line, textX, y + 70 + lines.length * 31 + n * 25));
  });
  if (!model.top.length) {
    ctx.fillStyle = theme.text;
    ctx.font = `500 28px ${UI}`;
    ctx.fillText('Open a chapter and this year starts here.', PAD, top + 58);
  }
}

function footer(ctx: Ctx, theme: CardTheme) {
  const y = CARD_HEIGHT - 64;
  ctx.fillStyle = theme.line;
  ctx.fillRect(PAD, y - 44, CARD_WIDTH - PAD * 2, 1.5);
  ctx.fillStyle = theme.textSoft;
  ctx.font = `500 18px ${MONO}`;
  ctx.letterSpacing = '2px';
  ctx.fillText('KIREIMANGA.APP', PAD, y);
  ctx.textAlign = 'right';
  ctx.fillText('READ LOCALLY, KEPT LOCALLY', CARD_WIDTH - PAD, y);
  ctx.textAlign = 'left';
  ctx.letterSpacing = '0px';
}

/** Paints the whole card at CARD_WIDTH x CARD_HEIGHT. */
export function drawCard(
  ctx: Ctx,
  model: CardModel,
  theme: CardTheme,
  covers: Map<string, CardImage>
): void {
  ctx.save();
  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const heroCover = model.themeCover ? covers.get(model.themeCover.hash) : undefined;
  background(ctx, theme, heroCover);
  if (heroCover) featuredCover(ctx, theme, heroCover);
  header(ctx, theme);
  hero(ctx, model, theme);
  tiles(ctx, model, theme);
  heatmap(ctx, model, theme);
  topSeries(ctx, model, theme, covers);
  footer(ctx, theme);
  ctx.restore();
}
