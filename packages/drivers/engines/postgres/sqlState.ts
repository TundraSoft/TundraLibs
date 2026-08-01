/**
 * @fileoverview Pure Postgres SQLSTATE → `EngineErrorCode` mapping — no wire
 * imports.
 *
 * The SQLSTATE-to-standard-code translation is a pure function of the
 * five-character SQLSTATE string; it has no dependency on the TCP wire stack.
 * Isolating it here lets any transport that surfaces a Postgres SQLSTATE —
 * the socket-based `PostgresEngine` **and** the Neon SQL-over-HTTP engine,
 * which receives the SQLSTATE in a JSON error body — share one canonical map
 * without pulling in `PgConnection` / `protocol.ts` / socket code.
 *
 * @module
 */

import type { EngineErrorCode } from '../../errors/mod.ts';

/**
 * Map Postgres SQLSTATE codes (RFC 5-char hex) to standardized engine codes.
 *
 * Reference: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export function pgSqlStateToCode(sqlState: string): EngineErrorCode {
  switch (sqlState) {
    case '28P01': // invalid_password
    case '28000': // invalid_authorization_specification
      return 'INVALID_AUTH';
    case '42501': // insufficient_privilege
      return 'PERMISSION_DENIED';
    case '3D000': // invalid_catalog_name
      return 'DATABASE_NOT_FOUND';
    case '42P01': // undefined_table
      return 'TABLE_NOT_FOUND';
    case '42703': // undefined_column
      return 'COLUMN_NOT_FOUND';
    case '23505': // unique_violation
      return 'DUPLICATE_KEY';
    case '23503': // foreign_key_violation
      return 'FOREIGN_KEY_VIOLATION';
    case '23502': // not_null_violation
      return 'NOT_NULL_VIOLATION';
    case '23514': // check_violation
      return 'CHECK_VIOLATION';
    case '42601': // syntax_error
      return 'SYNTAX_ERROR';
    case '40P01': // deadlock_detected
      return 'DEADLOCK';
    case '55P03': // lock_not_available
      return 'LOCK_TIMEOUT';
    case '57014': // query_canceled
      return 'QUERY_TIMEOUT';
    case '40001': // serialization_failure
      return 'SERIALIZATION_FAILURE';
    case '08000': // connection_exception
    case '08003': // connection_does_not_exist
    case '08006': // connection_failure
    case '08001': // sqlclient_unable_to_establish_sqlconnection
    case '08004': // sqlserver_rejected_establishment_of_sqlconnection
    case '57P01': // admin_shutdown
    case '57P02': // crash_shutdown
    case '57P03': // cannot_connect_now
      return 'CONNECTION_LOST';
    default:
      return 'QUERY_EXECUTION_FAILED';
  }
}
