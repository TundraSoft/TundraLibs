/**
 * @fileoverview `authenticate(schemes?)` — the pact adapter's identify
 * step. Resolves the app's registered `Pact` (see `pact()`) via
 * `inject(PACT)` at CALL time — setup/mount time, the same timing
 * modules already use for `inject(DB)`, never per-request — so it's
 * safe to import and call from any number of route files without
 * re-initializing anything: there is no closure over a specific `Pact`
 * instance to accidentally duplicate.
 *
 * @module
 */

import { inject } from '@tundralibs/doctor';
import { RapidError } from '../../errors/mod.ts';
import type { RapidMiddleware } from '../../types/mod.ts';
import { type PactScheme, sanitizeAuth } from './credentials.ts';
import { PACT } from './pact.ts';

/**
 * Identify the caller via pact: try each of `schemes` in order (every
 * configured scheme, in a fixed BEARER/BASIC/TOKEN/APIKEY/HMAC order,
 * when omitted — NOT the order keys were given to `pact()`) — the FIRST
 * scheme whose extractor returns a credential wins. A credential that
 * then fails `pact.authenticate()` (bad signature, unknown key, wrong
 * password) stays anonymous rather than falling through to the next
 * scheme, matching pact's own "a matched-but-invalid credential never
 * retries another scheme" contract.
 *
 * When `ctx.auth` is already set (by an earlier `authenticate()` mount,
 * or BYO auth) AND `schemes` was given, the existing auth must already
 * carry one of the allowed `authMode`s — otherwise this call denies
 * with 403 rather than silently accepting an out-of-scope scheme. With
 * no `schemes` restriction, an existing `ctx.auth` is left alone either
 * way (this call never rejects for the unrestricted case). Jobs (no
 * request) are skipped entirely.
 *
 * On success `ctx.auth` carries the resolved principal plus a few
 * non-secret credential fields — see DESIGN-Auth.md's sanitization
 * table (never a password/token/secret/signature).
 *
 * After the handler runs, calls the scheme THIS call actually matched
 * (if it configured a `respond` hook) — the app's chance to sign or
 * annotate the response. A request identified by something other than
 * this call (BYO auth, or a scheme outside its own restriction) skips
 * this step.
 *
 * @throws {RapidError} RAPID_ACCESS_DENIED — `schemes` restricts to
 *   specific scheme(s) and `ctx.auth` was already set via a scheme
 *   outside that list.
 * @throws {UnregisteredVialError} when `pact()` has not run yet.
 */
export function authenticate(schemes?: PactScheme[]): RapidMiddleware {
  const { pact, schemes: configured } = inject(PACT);
  const allowed = schemes ?? (Object.keys(configured) as PactScheme[]);
  return async (ctx, next) => {
    let matched: PactScheme | undefined;
    if (ctx.type !== 'JOB') {
      if (ctx.auth === undefined) {
        for (const name of allowed) {
          const scheme = configured[name];
          if (scheme === undefined) continue;
          const credential = await scheme.extract(ctx);
          if (credential === null) continue;
          const principal = await pact.authenticate(credential);
          if (principal !== null) {
            ctx.setAuth(sanitizeAuth(principal, credential));
            matched = name;
          }
          break;
        }
      } else {
        const mode = ctx.auth.authMode as PactScheme | undefined;
        if (mode !== undefined && allowed.includes(mode)) {
          matched = mode;
        } else if (schemes !== undefined) {
          throw new RapidError('RAPID_ACCESS_DENIED', {
            message: `this route requires one of: ${allowed.join(', ')}`,
          });
        }
      }
    }
    await next();
    if (matched !== undefined) {
      await configured[matched]?.respond?.(ctx, pact);
    }
  };
}
