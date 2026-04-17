import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { createLogger } from '@kireimanga/shared';
import type { BoundingBox, PageTranslation, TranslationProviderId } from '@kireimanga/shared';
import { DatabaseService } from '../../database';

const logger = createLogger('TranslationCacheService');

/**
 * Raw `translation_cache` row shape returned by the lookup query. Only the
 * columns `getForPage` selects — `target_language`, `provider`, `id`, and
 * `created_at` are intentionally absent because the caller already supplies
 * the lang/provider and the rest is bookkeeping.
 */
interface CachedBubbleRow {
  bubble_index: number;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  original_text: string;
  translated_text: string;
}

/**
 * Persists per-bubble OCR + translation results in the `translation_cache`
 * SQLite table (migration 007). Lookups are keyed on
 * `(page_hash, target_language, provider)` so the same image translated to
 * a different language or by a different provider lives as a parallel row.
 *
 * Prepared statements are constructed once in `onModuleInit` — better-sqlite3
 * prepared statements are 5–10x faster than per-call `db.prepare(...)`.
 */
@Injectable()
export class TranslationCacheService implements OnModuleInit {
  private getForPageStmt!: Database.Statement;
  private putBubbleStmt!: Database.Statement;
  private invalidatePageStmt!: Database.Statement;
  private countStmt!: Database.Statement;

  constructor(private readonly db: DatabaseService) {
    logger.info('TranslationCacheService initialized');
  }

  onModuleInit(): void {
    this.getForPageStmt = this.db.db.prepare(
      `SELECT bubble_index, bbox_x, bbox_y, bbox_w, bbox_h, original_text, translated_text
       FROM translation_cache
       WHERE page_hash = ? AND target_language = ? AND provider = ?
       ORDER BY bubble_index ASC`
    );

    this.putBubbleStmt = this.db.db.prepare(
      `INSERT INTO translation_cache (
         id, page_hash, bubble_index,
         bbox_x, bbox_y, bbox_w, bbox_h,
         original_text, translated_text,
         target_language, provider
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(page_hash, bubble_index, target_language, provider) DO UPDATE SET
         bbox_x = excluded.bbox_x,
         bbox_y = excluded.bbox_y,
         bbox_w = excluded.bbox_w,
         bbox_h = excluded.bbox_h,
         original_text = excluded.original_text,
         translated_text = excluded.translated_text`
    );

    this.invalidatePageStmt = this.db.db.prepare(
      `DELETE FROM translation_cache WHERE page_hash = ?`
    );

    this.countStmt = this.db.db.prepare(`SELECT COUNT(*) AS c FROM translation_cache`);
  }

  /** Look up a fully-translated page by hash + lang + provider. Null if no rows. */
  getForPage(
    pageHash: string,
    targetLang: string,
    provider: TranslationProviderId
  ): PageTranslation | null {
    const rows = this.getForPageStmt.all(pageHash, targetLang, provider) as CachedBubbleRow[];
    if (rows.length === 0) {
      return null;
    }
    return {
      pageHash,
      bubbles: rows.map(r => ({
        box: { x: r.bbox_x, y: r.bbox_y, w: r.bbox_w, h: r.bbox_h },
        original: r.original_text,
        translated: r.translated_text,
        provider,
        targetLang,
      })),
    };
  }

  /** Persist a single translated bubble. Idempotent on (page_hash, bubble_index, target_language, provider). */
  putBubble(args: {
    pageHash: string;
    bubbleIndex: number;
    box: BoundingBox;
    original: string;
    translated: string;
    targetLang: string;
    provider: TranslationProviderId;
  }): void {
    this.putBubbleStmt.run(
      randomUUID(),
      args.pageHash,
      args.bubbleIndex,
      args.box.x,
      args.box.y,
      args.box.w,
      args.box.h,
      args.original,
      args.translated,
      args.targetLang,
      args.provider
    );
  }

  /** Bulk delete entries for a page (used by future "retranslate page" UI). */
  invalidatePage(pageHash: string): number {
    const result = this.invalidatePageStmt.run(pageHash);
    return Number(result.changes ?? 0);
  }

  /** Total row count — diagnostics for settings UI. */
  count(): number {
    const row = this.countStmt.get() as { c: number } | undefined;
    return row?.c ?? 0;
  }
}
