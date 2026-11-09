import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';

import { isTauri } from '@/lib/ipc';
import { getCoverBytes, saveCardPng } from '@/lib/stats';

import { cardFileName, type CardModel } from './cardModel';
import { cardTheme } from './cardTheme';
import { CARD_FONTS, CARD_HEIGHT, CARD_WIDTH, drawCard, type CardImage } from './drawCard';

export type ExportState =
  | { step: 'idle' }
  | { step: 'saving' }
  | { step: 'saved'; path: string }
  | { step: 'failed'; message: string };

/** Decoded covers, shared across renders and years: a hash always names the same bytes. */
const decoded = new Map<string, Promise<CardImage | null>>();

function loadCover(hash: string): Promise<CardImage | null> {
  let pending = decoded.get(hash);
  if (!pending) {
    pending = getCoverBytes(hash)
      .then(bytes => createImageBitmap(new Blob([bytes], { type: 'image/jpeg' })))
      .catch(() => null);
    decoded.set(hash, pending);
  }
  return pending;
}

async function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  // A font that fails to load falls back to the next in its stack.
  await Promise.allSettled(
    CARD_FONTS.map(font => document.fonts.load(font, 'KireiManga 綺麗漫画'))
  );
}

function toPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('The card could not be encoded as a PNG.'));
        return;
      }
      blob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)), reject);
    }, 'image/png');
  });
}

/**
 * Draws the year in review card into a canvas and saves it as a PNG. Covers
 * come over IPC as bytes (not kirei-cover URLs, another origin that would
 * taint the canvas). The file goes only where the user points the save
 * dialog.
 */
export function useYearCard(model: CardModel) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [exportState, setExportState] = useState<ExportState>({ step: 'idle' });
  const theme = useMemo(() => cardTheme(model.themeCover?.palette), [model.themeCover]);

  useEffect(() => {
    let live = true;
    setDrawn(false);
    setExportState({ step: 'idle' });
    const hashes = new Set(
      [model.themeCover, ...model.top.map(s => s.cover)]
        .filter(cover => cover !== null)
        .map(cover => cover.hash)
    );
    void (async () => {
      const [, images] = await Promise.all([
        loadFonts(),
        Promise.all(
          [...hashes].map(async hash => [hash, isTauri() ? await loadCover(hash) : null] as const)
        ),
      ]);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!live || !canvas || !ctx) return;
      const covers = new Map<string, CardImage>();
      for (const [hash, image] of images) if (image) covers.set(hash, image);
      drawCard(ctx, model, theme, covers);
      setDrawn(true);
    })();
    return () => {
      live = false;
    };
  }, [model, theme]);

  const exportPng = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !drawn) return;
    const path = await saveDialog({
      title: 'Save your year in review',
      defaultPath: cardFileName(model.year),
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    });
    if (!path) return;
    setExportState({ step: 'saving' });
    try {
      const saved = await saveCardPng(path, await toPng(canvas));
      setExportState({ step: 'saved', path: saved });
    } catch (error) {
      setExportState({
        step: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [drawn, model.year]);

  return {
    canvasRef,
    drawn,
    exportState,
    exportPng,
    size: { width: CARD_WIDTH, height: CARD_HEIGHT },
  };
}
