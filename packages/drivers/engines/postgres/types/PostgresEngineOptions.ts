import type { SQLEngineOptions } from '../../../types/mod.ts';

/**
 * Configuration options for `PostgresEngine`.
 *
 * Network fields (`host`, `port`, `username`, `password`, `database`)
 * are inherited from {@link SQLEngineOptions}. The constructor enforces
 * that `host`, `database`, and `username` are present (these are
 * required to dial Postgres) — TS doesn't narrow them to required so a
 * missing field is a runtime `MISSING_CONFIG_VALUE` error rather than a
 * compile-time one.
 *
 * @extends SQLEngineOptions
 */
export type PostgresEngineOptions = SQLEngineOptions & {
  /**
   * Application name reported to Postgres (visible in `pg_stat_activity`).
   * Defaults to the engine's `Name`.
   */
  applicationName?: string;
  /**
   * Connection-level statement_timeout in milliseconds (sent as a startup
   * parameter). Server-side aborts queries that run longer.
   */
  statementTimeoutMs?: number;
  /**
   * Permit cleartext-password authentication over an **unencrypted**
   * connection. Default `true` (permissive, but loud).
   *
   * When the server asks for a cleartext password
   * (`AuthenticationCleartextPassword`) the driver sends the password in the
   * clear — readable by any on-path attacker, and a lever a rogue/MITM server
   * can pull to downgrade away from the mutual-auth guarantee SCRAM otherwise
   * provides. Over a plain-TCP connection the driver therefore emits a
   * `notice` warning on every such handshake (the same treatment as an
   * `ssl.enforce: false` downgrade), but still authenticates — `pg_hba`
   * `password` and PgBouncer `auth_type = plain` are real deployments, and
   * libpq behaves the same way unless `require_auth` is pinned.
   *
   * Set this to `false` to harden: the driver then throws `INVALID_AUTH`
   * instead of sending the password over an unencrypted socket. Cleartext
   * over TLS is always allowed regardless of this flag (the transport is
   * already encrypted). This does not affect SCRAM-SHA-256, which stays the
   * recommended mechanism, or MD5, which is gated by `allowMd5Password`.
   */
  allowCleartextPassword?: boolean;
  /**
   * Answer `AuthenticationMD5Password`. Default `false`: the driver throws
   * `INVALID_AUTH` when the server asks for MD5.
   *
   * Turn it on only for a peer that offers nothing better, such as the
   * Worker → Cloudflare Hyperdrive hop or PgBouncer `auth_type = md5`. MD5 has
   * no server proof, so while the flag is on a rogue server can ask for it
   * instead of SCRAM-SHA-256 and take away a salted hash of the password to
   * crack offline; over an unencrypted connection an eavesdropper captures
   * the same hash, and no warning is emitted. Enforced, verified TLS closes
   * both. Keep it off for connections that go straight to Postgres.
   */
  allowMd5Password?: boolean;
};
