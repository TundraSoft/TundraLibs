/**
 * @fileoverview {@link RapidContextArgs} — the uniform invocation-arguments
 * shape exposed as `ctx.args` on every context type.
 *
 * @module
 */

import type { RapidContextPaging } from './Paging.ts';
import type { RapidContextQuery } from './Query.ts';

/**
 * The uniform invocation arguments — same shape on every transport, so
 * one middleware reads one contract:
 *
 * - HTTP: `params` = route params; `query`/`paging` parsed from the
 *   URL (paging headers first, query params override).
 * - SOCKET: `params` = the frame payload (commands MUST send object
 *   payloads — anything else is a validation error); `query` is empty;
 *   `paging` honours `page`/`limit` keys in the frame params when
 *   present.
 * - JOB: `params` = registration defaults merged under trigger
 *   overrides; `query` empty; `paging` defaults.
 *
 * The invocation identity is NOT in here — that is `ctx.action`.
 * Headers are envelope, never args (`ctx.headers` / `ctx.connection`).
 */
export type RapidContextArgs = {
  /** Positional/named invocation parameters (see per-transport notes). */
  params: Readonly<Record<string, unknown>>;
  /** Parsed query filters + sorting (empty off-HTTP). */
  query: RapidContextQuery;
  /** Resolved pagination window (defaults off-HTTP). */
  paging: RapidContextPaging;
  /**
   * Materialised by the binder tier (modules/decorators) — until then
   * read the body lazily via `ctx.payload`.
   */
  payload?: unknown;
  /**
   * Materialised by the binder tier — until then uploaded-file paths
   * are available via `ctx.files` after `ctx.payload` resolves.
   */
  files?: readonly string[];
};
