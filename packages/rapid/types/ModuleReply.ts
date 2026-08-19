/**
 * @fileoverview {@link RapidModuleReply} — the ENFORCED return contract
 * of every decorated module method.
 *
 * @module
 */

import type { RapidContextResponse } from './context/Response.ts';

/**
 * What a decorated module method MUST return — the same structural
 * envelope the contexts consume ({@link RapidContextResponse}), so the
 * mount tier's transposition is one assignment. Enforced at the `@`
 * site by the decorator's typing and again at runtime by the mount
 * tier (the compile check has escape hatches: `any`-typed methods,
 * `@ts-ignore`).
 */
export type RapidModuleReply =
  | RapidContextResponse
  | Promise<RapidContextResponse>;
