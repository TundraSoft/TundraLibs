import type { ColumnTypes } from './ColumnTypes.ts';

/**
 * Map a TypeScript column type to the set of SQL data types it can
 * legitimately back.
 *
 * - `string` → `CHAR | VARCHAR | TEXT | CLOB`
 * - `number` → integer family + decimal family
 * - `bigint` → `BIGINT`
 * - `Date` → `DATE | TIME | DATETIME | TIMESTAMP`
 * - `boolean` → `BOOLEAN | BIT`
 * - `Record<string, unknown>` → `JSON | JSONB`
 * - fallback → `TEXT`
 *
 * @template T - TypeScript column type.
 */
export type SQLTypes<T extends ColumnTypes> = T extends string
  ? 'CHAR' | 'VARCHAR' | 'TEXT' | 'CLOB'
  : T extends number ?
      | 'TINYINT'
      | 'SMALLINT'
      | 'INTEGER'
      | 'INT'
      | 'BIGINT'
      | 'DECIMAL'
      | 'NUMERIC'
      | 'FLOAT'
      | 'DOUBLE'
      | 'REAL'
  : T extends bigint ? 'BIGINT'
  : T extends Date ? 'DATE' | 'TIME' | 'DATETIME' | 'TIMESTAMP' | 'TIMESTAMPTZ'
  : T extends boolean ? 'BOOLEAN' | 'BIT'
  : T extends Record<string, unknown> ? 'JSON' | 'JSONB'
  : 'TEXT';
