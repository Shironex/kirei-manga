import type { DatabaseService } from '../database';
import { TranslationFlagsService } from './translation-flags.service';

/**
 * Unit-level coverage for the flags service. The DatabaseService is mocked
 * with a chainable `prepare(...).run(...)` so we can capture the exact SQL +
 * bound args without spinning up sql.js. Validation paths assert the
 * service throws (the gateway's handleGatewayRequest converts those into
 * `{ success: false, error }` responses) and never touches the DB.
 */
describe('TranslationFlagsService', () => {
  let runMock: jest.Mock;
  let prepareMock: jest.Mock;
  let database: DatabaseService;
  let service: TranslationFlagsService;

  const PAGE_HASH = 'a'.repeat(64);

  beforeEach(() => {
    runMock = jest.fn();
    prepareMock = jest.fn(() => ({ run: runMock }));
    database = { db: { prepare: prepareMock } } as unknown as DatabaseService;
    service = new TranslationFlagsService(database);
  });

  it('inserts a row and returns success on a well-formed payload', () => {
    const result = service.flagBubble({
      pageHash: PAGE_HASH,
      bubbleIndex: 3,
      reason: 'user-flagged',
      userNote: 'Translation reads backwards.',
    });

    expect(result).toEqual({ success: true });
    expect(prepareMock).toHaveBeenCalledWith(
      'INSERT INTO translation_flags (id, page_hash, bubble_index, reason, user_note) VALUES (?, ?, ?, ?, ?)'
    );
    expect(runMock).toHaveBeenCalledTimes(1);
    const args = runMock.mock.calls[0];
    // id is a UUID — assert shape, not value.
    expect(typeof args[0]).toBe('string');
    expect(args[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(args.slice(1)).toEqual([PAGE_HASH, 3, 'user-flagged', 'Translation reads backwards.']);
  });

  it('accepts bubbleIndex 0 (falsy-zero must not be treated as missing)', () => {
    const result = service.flagBubble({
      pageHash: PAGE_HASH,
      bubbleIndex: 0,
      reason: 'user-flagged',
    });

    expect(result).toEqual({ success: true });
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock.mock.calls[0][2]).toBe(0);
  });

  it('writes NULL for user_note when the field is omitted', () => {
    service.flagBubble({
      pageHash: PAGE_HASH,
      bubbleIndex: 1,
      reason: 'user-flagged',
    });

    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock.mock.calls[0][4]).toBeNull();
  });

  it('truncates an oversized reason to 200 chars before insert', () => {
    const longReason = 'r'.repeat(500);
    service.flagBubble({
      pageHash: PAGE_HASH,
      bubbleIndex: 0,
      reason: longReason,
    });

    expect(runMock.mock.calls[0][3]).toHaveLength(200);
    expect(runMock.mock.calls[0][3]).toBe('r'.repeat(200));
  });

  it('truncates an oversized user_note to 2000 chars before insert', () => {
    const longNote = 'n'.repeat(5000);
    service.flagBubble({
      pageHash: PAGE_HASH,
      bubbleIndex: 0,
      reason: 'user-flagged',
      userNote: longNote,
    });

    expect(runMock.mock.calls[0][4]).toHaveLength(2000);
    expect(runMock.mock.calls[0][4]).toBe('n'.repeat(2000));
  });

  it('throws and skips the insert when pageHash is missing', () => {
    expect(() =>
      service.flagBubble({
        pageHash: '',
        bubbleIndex: 0,
        reason: 'user-flagged',
      })
    ).toThrow(/pageHash/);
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it('throws on a negative bubbleIndex', () => {
    expect(() =>
      service.flagBubble({
        pageHash: PAGE_HASH,
        bubbleIndex: -1,
        reason: 'user-flagged',
      })
    ).toThrow(/bubbleIndex/);
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it('throws on a non-integer bubbleIndex', () => {
    expect(() =>
      service.flagBubble({
        pageHash: PAGE_HASH,
        bubbleIndex: 1.5,
        reason: 'user-flagged',
      })
    ).toThrow(/bubbleIndex/);
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it('throws when reason is empty', () => {
    expect(() =>
      service.flagBubble({
        pageHash: PAGE_HASH,
        bubbleIndex: 0,
        reason: '',
      })
    ).toThrow(/reason/);
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it('throws when userNote is the wrong type', () => {
    expect(() =>
      service.flagBubble({
        pageHash: PAGE_HASH,
        bubbleIndex: 0,
        reason: 'user-flagged',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        userNote: 42 as any,
      })
    ).toThrow(/userNote/);
    expect(prepareMock).not.toHaveBeenCalled();
  });
});
