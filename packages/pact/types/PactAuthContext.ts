import type { PactBoundPrincipal } from './PactBoundPrincipal.ts';
import type { PermissionBits } from './PermissionBits.ts';

/**
 * The per-request authentication envelope: the resolved principal plus
 * HOW this request proved itself. Produced fresh on every
 * `authenticate` call (the principal inside may come from cache) —
 * policy like "sessions only, no API keys" branches here, never on the
 * principal, which stays scheme-agnostic and cacheable. The principal
 * is bound: `ctx.principal.assert(module, permission)` checks against
 * the already-resolved grants with no extra store round-trip.
 */
export type PactAuthContext<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> = {
  readonly principal: PactBoundPrincipal<M, B>;
  readonly via: 'APIKEY' | 'BASIC' | 'HMAC' | 'SESSION';
  /** The session id (token sha-256); present when `via` is 'SESSION'. */
  readonly sessionId?: string;
};
