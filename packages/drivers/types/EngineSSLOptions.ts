/**
 * SSL / TLS configuration for a driver engine connection.
 *
 * @module
 */

import type { TLSOptions } from '@tundralibs/compat';

/**
 * SSL / TLS configuration for the connection.
 *
 * - `boolean`: enable / disable SSL with default settings (system trust
 *   roots, no client cert).
 * - `object`: a {@link compat.TLSOptions} (inline PEM via `cert` /
 *   `key` / `ca`, or paths via `certFile` / `keyFile` / `caFile`, plus
 *   `rejectUnauthorized`) extended with one engine-only field,
 *   `enforce`. We deliberately mirror compat's shape so engines can
 *   pass the option straight through to `compat.connect` without a
 *   reshape step.
 *
 * `enforce` is the engine-layer addition:
 * - `true` (default) — any TLS failure (server doesn't speak TLS,
 *   cert chain invalid, handshake aborted) → throw.
 * - `false` — on TLS failure, silently fall back to a plain
 *   (unencrypted) TCP connection. Credentials and query data travel
 *   in cleartext. Only set `false` if the server explicitly allows
 *   plaintext **and** you understand the implications.
 *
 * ### Per-engine behaviour
 *
 * Same option name, different semantics — `enforce` is **not** uniform
 * because the underlying transport layer differs:
 *
 * | Engine    | `enforce: true` (default)            | `enforce: false`                                          |
 * |-----------|--------------------------------------|------------------------------------------------------------|
 * | Postgres  | TLS failure throws                   | Retries the connection plaintext, emits `notice`           |
 * | Redis     | TLS failure throws                   | Retries the connection plaintext, emits `notice`           |
 * | Memcached | TLS failure throws                   | Retries the connection plaintext, emits `notice`           |
 * | MariaDB   | TLS failure throws                   | **Ignored** — `npm:mariadb` has no auto-downgrade path     |
 * | MongoDB   | Field ignored — configure TLS in the connection URI (e.g. `mongodb+srv://…?tls=true`) |
 * | SQLite    | Field ignored — embedded, no network |                                                            |
 *
 * Engines that own their wire protocol (Postgres, Redis, Memcached) can
 * actually fall back to plaintext on TLS failure because they manage
 * the socket themselves. MariaDB delegates to `npm:mariadb`, which
 * rejects on TLS failure with no retry shim. Mongo's transport is
 * abstracted by `npm:mongodb`; configure TLS at the URI level. SQLite
 * is in-process — `ssl` has no meaning there.
 */
export type EngineSSLOptions = TLSOptions & { enforce?: boolean };
