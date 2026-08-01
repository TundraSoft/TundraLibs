/**
 * @fileoverview Pure SQLite error-code → `EngineErrorCode` mapping — no native
 * driver imports.
 *
 * The SQLite-error-to-standard-code translation is a pure function of the
 * driver-native error `code` (e.g. `SQLITE_CONSTRAINT_UNIQUE`) and its message
 * text; it has no dependency on the runtime's native SQLite binding
 * (`bun:sqlite` / `@db/sqlite` / `better-sqlite3`). Isolating it here lets any
 * transport that surfaces a SQLite error — the native `SQLiteEngine` **and**
 * the Turso / libSQL SQLite-over-HTTP engine, which receives the SQLite `code`
 * in a JSON error body — share one canonical map without pulling in a native
 * SQLite driver. That keeps the `./turso` import graph edge-safe.
 *
 * @module
 */

import type { EngineErrorCode } from '../../errors/mod.ts';

/**
 * Map SQLite error codes / messages to standardized engine codes.
 *
 * `better-sqlite3`, `jsr:@db/sqlite`, `bun:sqlite`, and Turso / libSQL all
 * surface error codes like `SQLITE_ERROR`, `SQLITE_CONSTRAINT_UNIQUE`, etc.
 * plus message text. Both the code and the message are checked so this maps
 * correctly whether or not the transport supplied a machine code.
 */
export function sqliteErrorToCode(
  code: string | undefined,
  message: string,
): EngineErrorCode {
  const lower = message.toLowerCase();
  if (
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
    lower.includes('unique constraint failed')
  ) {
    return 'DUPLICATE_KEY';
  }
  if (
    code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ||
    lower.includes('foreign key constraint')
  ) {
    return 'FOREIGN_KEY_VIOLATION';
  }
  if (
    code === 'SQLITE_CONSTRAINT_NOTNULL' ||
    lower.includes('not null constraint failed')
  ) {
    return 'NOT_NULL_VIOLATION';
  }
  if (
    code === 'SQLITE_CONSTRAINT_CHECK' || lower.includes('check constraint')
  ) {
    return 'CHECK_VIOLATION';
  }
  if (lower.includes('no such table')) return 'TABLE_NOT_FOUND';
  if (lower.includes('no such column')) return 'COLUMN_NOT_FOUND';
  if (lower.includes('syntax error')) return 'SYNTAX_ERROR';
  if (code === 'SQLITE_READONLY' || lower.includes('readonly database')) {
    return 'PERMISSION_DENIED';
  }
  return 'QUERY_EXECUTION_FAILED';
}

/**
 * Extract constraint / column / table metadata from a SQLite error message.
 *
 * SQLite embeds the offending identifier in its error text (e.g.
 * `UNIQUE constraint failed: users.email`, `NOT NULL constraint failed:
 * users.name`, `no such table: widgets`). The standardized `EngineError`
 * templates reference `${constraint}` (DUPLICATE_KEY / CHECK_VIOLATION) and
 * `${column}` (NOT_NULL_VIOLATION), so the wrapping engine must lift these
 * names out of the message or the placeholder survives verbatim in the
 * rendered message and `context.constraint` / `.column` stay `undefined`.
 *
 * Pure: a function of the message text only, with no native-driver or wire
 * imports, so **both** the native `SQLiteEngine` and the Turso / libSQL
 * SQLite-over-HTTP engine can fill identical metadata from one place — keeping
 * the documented SQLite ↔ Turso error parity and the `./turso` import graph
 * edge-safe.
 *
 * Note: `FOREIGN KEY constraint failed` carries no name (SQLite does not report
 * one), so no `constraint` is extracted for it — matching what the native
 * engine emits (a literal `${constraint}` in that one case).
 */
export function parseSqliteErrorMeta(
  message: string,
): { constraint?: string; column?: string; table?: string } {
  const meta: { constraint?: string; column?: string; table?: string } = {};
  const tableMatch = /no such table:\s*([^\s]+)/i.exec(message);
  if (tableMatch) meta.table = tableMatch[1];
  const colMatch = /no such column:\s*([^\s]+)/i.exec(message);
  if (colMatch) meta.column = colMatch[1];
  const notNullMatch = /not null constraint failed:\s*([^\s]+)/i.exec(message);
  if (notNullMatch) meta.column = notNullMatch[1];
  const uniqueMatch = /unique constraint failed:\s*([^\s]+)/i.exec(message);
  if (uniqueMatch) meta.constraint = uniqueMatch[1];
  const checkMatch = /check constraint failed:\s*([^\s]+)/i.exec(message);
  if (checkMatch) meta.constraint = checkMatch[1];
  return meta;
}
