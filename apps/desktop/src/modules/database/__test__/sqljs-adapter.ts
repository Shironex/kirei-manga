import path from 'path';
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import type Database from 'better-sqlite3';
import { runMigrations } from '../migrations';

/**
 * Test-only compatibility adapter that mirrors the slice of `better-sqlite3`'s
 * surface the desktop services (migrations + LibraryService) actually touch:
 * `prepare(sql)` with positional `?` binds, `exec`, `transaction`, `pragma`,
 * `close`. Production still uses native `better-sqlite3` for perf; this
 * adapter exists purely so Jest can run under plain Node without hitting the
 * NODE_MODULE_VERSION mismatch left behind by electron-builder's postinstall
 * ABI rebuild.
 *
 * If a future service starts using named binds, `lastInsertRowid`, or reads
 * `.run()`'s return value, extend this adapter accordingly — today it fakes
 * the run result because no caller reads it.
 */

export interface CompatStatement {
  run(...args: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
}

export interface CompatDatabase {
  prepare(sql: string): CompatStatement;
  exec(sql: string): void;
  transaction<T extends (...args: unknown[]) => unknown>(fn: T): T;
  pragma(s: string): void;
  close(): void;
}

function toBindParams(args: unknown[]): unknown[] {
  // better-sqlite3 accepts variadic positional args; sql.js .bind() wants an array.
  // If the caller passed a single array, use it as-is; otherwise wrap the variadic.
  if (args.length === 1 && Array.isArray(args[0])) {
    return args[0] as unknown[];
  }
  return args;
}

function wrap(sqljsDb: SqlJsDatabase): CompatDatabase {
  return {
    prepare(sql: string): CompatStatement {
      // Don't cache — sql.js statements are stateful and re-binding between
      // .run/.get/.all calls across test assertions gets fiddly. A fresh
      // statement per call keeps semantics simple and predictable.
      return {
        run(...args: unknown[]) {
          const stmt = sqljsDb.prepare(sql);
          try {
            stmt.bind(toBindParams(args) as never);
            stmt.step();
          } finally {
            stmt.free();
          }
          // No caller reads these fields today — stub values.
          return { changes: 0, lastInsertRowid: 0 };
        },
        get(...args: unknown[]) {
          const stmt = sqljsDb.prepare(sql);
          try {
            stmt.bind(toBindParams(args) as never);
            if (stmt.step()) {
              return stmt.getAsObject();
            }
            return undefined;
          } finally {
            stmt.free();
          }
        },
        all(...args: unknown[]) {
          const stmt = sqljsDb.prepare(sql);
          const rows: unknown[] = [];
          try {
            stmt.bind(toBindParams(args) as never);
            while (stmt.step()) {
              rows.push(stmt.getAsObject());
            }
            return rows;
          } finally {
            stmt.free();
          }
        },
      };
    },
    exec(sql: string): void {
      sqljsDb.exec(sql);
    },
    transaction<T extends (...args: unknown[]) => unknown>(fn: T): T {
      const wrapped = (...args: unknown[]) => {
        sqljsDb.run('BEGIN');
        try {
          const result = fn(...args);
          sqljsDb.run('COMMIT');
          return result;
        } catch (err) {
          sqljsDb.run('ROLLBACK');
          throw err;
        }
      };
      return wrapped as T;
    },
    pragma(s: string): void {
      // Accept better-sqlite3's `pragma('foreign_keys = ON')` form. sql.js
      // exposes PRAGMA via exec; no-op silently on anything it can't parse.
      try {
        sqljsDb.exec(`PRAGMA ${s}`);
      } catch {
        // Silently ignore — tests don't depend on pragma side effects today.
      }
    },
    close(): void {
      sqljsDb.close();
    },
  };
}

/**
 * Create an in-memory sql.js database with the full production migration set
 * applied. The returned object is cast to `Database.Database` at call sites —
 * it implements only the subset of the surface our services consume.
 */
export async function createTestDatabase(): Promise<CompatDatabase> {
  const SQL = await initSqlJs({
    // sql.js's main entry (`sql-wasm.js`) already lives inside `dist/`, so
    // its directory is where the WASM file sits. Resolving the main entry
    // works across pnpm hoisting layouts; resolving `sql.js/package.json`
    // does not (the package blocks that subpath via `exports`).
    locateFile: (file: string) => path.join(path.dirname(require.resolve('sql.js')), file),
  });
  const sqljsDb = new SQL.Database();
  sqljsDb.run('PRAGMA foreign_keys = ON');
  const adapter = wrap(sqljsDb);
  runMigrations(adapter as unknown as Database.Database);
  return adapter;
}
