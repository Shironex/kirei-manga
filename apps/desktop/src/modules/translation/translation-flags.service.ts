import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createLogger } from '@kireimanga/shared';
import type {
  TranslationReportBadPayload,
  TranslationReportBadResponse,
} from '@kireimanga/shared';
import { DatabaseService } from '../database';

const logger = createLogger('TranslationFlagsService');

/**
 * Length caps for free-form text fields. Reason is short and machine-flavoured
 * (today only `'user-flagged'` is sent from the renderer); user notes are
 * meant to be a sentence or two but we still bound them so a runaway paste
 * doesn't bloat the local SQLite file.
 */
const REASON_MAX_CHARS = 200;
const USER_NOTE_MAX_CHARS = 2000;

/**
 * Slice L.3 — writes bad-translation reports to the `translation_flags` table
 * (migration 008). Validation throws on bad input so the gateway's
 * `handleGatewayRequest` wrapper can surface the message in its standard
 * `{ ...defaultResult, error }` envelope. v0.5 will add a correction editor
 * that reads back from this table; for v0.3 the row is write-only.
 */
@Injectable()
export class TranslationFlagsService {
  constructor(private readonly database: DatabaseService) {
    logger.info('TranslationFlagsService initialized');
  }

  flagBubble(payload: TranslationReportBadPayload): TranslationReportBadResponse {
    if (typeof payload?.pageHash !== 'string' || payload.pageHash.length === 0) {
      throw new Error('pageHash must be a non-empty string');
    }
    // `0` is a valid bubble index — guard with Number.isInteger so falsy-zero
    // doesn't get rejected by a truthy check.
    if (!Number.isInteger(payload.bubbleIndex) || payload.bubbleIndex < 0) {
      throw new Error('bubbleIndex must be a non-negative integer');
    }
    if (typeof payload.reason !== 'string' || payload.reason.length === 0) {
      throw new Error('reason must be a non-empty string');
    }
    if (payload.userNote !== undefined && typeof payload.userNote !== 'string') {
      throw new Error('userNote must be a string when provided');
    }

    const id = randomUUID();
    const reason = payload.reason.slice(0, REASON_MAX_CHARS);
    const userNote =
      typeof payload.userNote === 'string' ? payload.userNote.slice(0, USER_NOTE_MAX_CHARS) : null;

    this.database.db
      .prepare(
        'INSERT INTO translation_flags (id, page_hash, bubble_index, reason, user_note) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, payload.pageHash, payload.bubbleIndex, reason, userNote);

    return { success: true };
  }
}
