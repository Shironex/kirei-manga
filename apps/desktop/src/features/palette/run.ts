import { addFolderAndScan, rescanLibrary } from '@/features/library/libraryStore';
import { isTauri } from '@/lib/ipc';
import { openDataDir } from '@/lib/settings/commands';
import { getSettingsState, updateSetting } from '@/lib/settings/store';

import type { PaletteActionId, PaletteContext, PaletteItem } from './types';

/** Scrolls the Settings screen to a section once its page has mounted (the chunk loads lazily). */
export function revealSettingsSection(section: string, tries = 40): void {
  const el = document.getElementById(`settings-${section}`);
  if (el) {
    el.scrollIntoView({ block: 'start' });
    el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    return;
  }
  if (tries > 0) setTimeout(() => revealSettingsSection(section, tries - 1), 50);
}

const TOGGLES = {
  'toggle-cover-colours': 'appearance.coverColours',
  'toggle-ambient': 'appearance.ambient',
  'toggle-glass': 'appearance.glass',
} as const;

function runAction(action: PaletteActionId, ctx: PaletteContext): void | Promise<void> {
  switch (action) {
    case 'rescan':
      return rescanLibrary();
    case 'add-folder':
      return void addFolderAndScan();
    case 'backup':
      ctx.goTo('/settings');
      return revealSettingsSection('data');
    case 'open-data-folder':
      return isTauri() ? openDataDir() : undefined;
    default: {
      const key = TOGGLES[action];
      return updateSetting(key, !getSettingsState().settings[key]);
    }
  }
}

/** Does what Enter on an item means. The caller closes the palette first. */
export async function runItem(item: PaletteItem, ctx: PaletteContext): Promise<void> {
  const target = item.target;
  switch (target.type) {
    case 'series':
      return ctx.goToSeries(target.seriesId);
    case 'chapter':
      return ctx.openChapter(target.seriesId, target.chapterId);
    case 'page':
      return ctx.goTo(target.to);
    case 'section':
      ctx.goTo('/settings');
      return revealSettingsSection(target.section);
    case 'action':
      return runAction(target.action, ctx);
    case 'custom':
      return target.run(ctx);
  }
}
