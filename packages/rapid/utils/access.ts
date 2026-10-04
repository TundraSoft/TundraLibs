/**
 * @fileoverview The access cycle: the fixed `authenticate` step every
 * invocation runs first (`authPrelude`), and the ONE enforcement point
 * (`enforceAccess`) that every path to an action calls — the transport
 * chain (`accessGuard`), a module `invoke()`, a composed part. rapid
 * interprets neither the identity nor the string; the app's
 * {@link RapidAuthBinding} does.
 *
 * @module
 */

import type { Slogger } from '@tundralibs/slogger';
import { RapidError } from '../errors/mod.ts';
import type {
  RapidAccessContext,
  RapidAuthBinding,
  RapidContext,
  RapidMiddleware,
} from '../types/mod.ts';

/** What the access cycle needs from the application — structural, no import cycle. */
export type AccessHost = {
  readonly authBinding: RapidAuthBinding | undefined;
  readonly log: Slogger;
};

/**
 * Judge `access` for `ctx` through the binding. Resolves when allowed.
 *
 * @throws {RapidError} RAPID_AUTH_UNBOUND when no binding exists (the boot
 *   check makes this unreachable in a started app; it stays for a runtime
 *   assembled by hand); RAPID_AUTH_UNAVAILABLE (503) when this invocation's
 *   `authenticate` failed; RAPID_UNAUTHENTICATED (401) when the binding
 *   refuses an anonymous caller; RAPID_ACCESS_DENIED (403) when it refuses
 *   an identified one.
 */
export async function enforceAccess(
  ctx: RapidAccessContext,
  access: string,
  binding: RapidAuthBinding | undefined,
  action: string,
): Promise<void> {
  if (binding === undefined) {
    throw new RapidError('RAPID_AUTH_UNBOUND', {
      message:
        `${action} declares access '${access}' but no auth binding is registered — call app.auth({ authenticate, authorize })`,
      details: { action, access },
    });
  }
  if ('authFailed' in ctx && ctx.authFailed !== undefined) {
    throw new RapidError('RAPID_AUTH_UNAVAILABLE', {
      details: { action },
      debug: {
        cause: ctx.authFailed instanceof Error
          ? ctx.authFailed.message
          : String(ctx.authFailed),
      },
    });
  }
  const allowed = await binding.authorize(ctx, access);
  if (allowed === true) return;
  binding.onDenied?.(ctx, access);
  throw new RapidError(
    ctx.auth === undefined ? 'RAPID_UNAUTHENTICATED' : 'RAPID_ACCESS_DENIED',
    { details: { action, access } },
  );
}

/**
 * The route/command/job chain's access step: runs {@link enforceAccess}
 * for the entry's declared string, then the rest of the chain. Composed
 * once per registration, between the app middleware and the entry's own.
 */
export function accessGuard(
  host: AccessHost,
  access: string,
  action: string,
): RapidMiddleware {
  return async (ctx, next) => {
    await enforceAccess(ctx, access, host.authBinding, action);
    await next();
  };
}

/**
 * The fixed authentication step: the binding's `authenticate` answer
 * becomes `ctx.auth`; a refused credential (a thrown 4xx `RapidError`)
 * answers the request; any other failure marks the invocation
 * `authFailed` and the chain continues anonymous — an `access`-guarded
 * action then answers 503 at its guard, an unguarded one serves. After a
 * chain that completed without throwing, the binding's `finish` runs (a
 * response seal). Without a binding the step is a pass-through.
 */
export function authPrelude(host: AccessHost): RapidMiddleware {
  return async (ctx, next) => {
    const binding = host.authBinding;
    if (binding === undefined) return await next();
    try {
      const identity = await binding.authenticate(ctx as RapidContext);
      if (identity !== undefined && identity !== null) {
        if (typeof identity !== 'object') {
          throw new RapidError('RAPID_CONFIG', {
            message:
              `auth binding: authenticate() must answer an object identity or undefined (got ${typeof identity})`,
          });
        }
        ctx._setAuth(identity as Record<string, unknown>);
      }
    } catch (error) {
      if (error instanceof RapidError && error.status < 500) throw error;
      host.log.error('auth binding: authenticate() failed', {
        requestId: ctx.requestId,
        action: ctx.action,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      ctx._markAuthFailed(error);
    }
    await next();
    if (binding.finish !== undefined) await binding.finish(ctx as RapidContext);
  };
}
