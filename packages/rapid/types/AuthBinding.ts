/**
 * @fileoverview {@link RapidAuthBinding} — the ONE place an application
 * tells rapid how a caller is identified and how an `access` string is
 * judged. rapid never interprets an identity or an access string itself:
 * it runs `authenticate` once per invocation, sets `ctx.auth` from its
 * answer, and hands every declared `access` string to `authorize`.
 *
 * @module
 */

import type { InvokeContext } from '../modules/InvokeContext.ts';
import type { RapidContext } from './Context.ts';

/**
 * The context an `access` check sees: a transport invocation (HTTP,
 * SOCKET, JOB) or an in-process module `invoke()`. Both carry `auth`,
 * `requestId` and `action`; only a transport context carries request
 * details (`params`, headers), so a policy that resolves a tenant from
 * the route reads `ctx.type` first.
 */
export type RapidAccessContext = RapidContext | InvokeContext;

/**
 * What `app.auth({ … })` binds. The binding is auth-platform agnostic:
 * `@tundralibs/pact` ships one (`pactAuth(pact).binding`), a JWT app
 * writes two functions, a test passes a stub.
 */
export type RapidAuthBinding = {
  /**
   * Identify the caller of `ctx`. Runs ONCE per invocation, after the
   * `preAuth` middleware and before everything else; the answer becomes
   * `ctx.auth` (an object), or stays anonymous on `undefined`. A JOB has
   * no caller — return `undefined`, or a system identity the policy
   * recognises. A thrown `RapidError` with a 4xx status is a REFUSAL (a
   * presented credential that fails) and answers the request as thrown;
   * any other throw marks the invocation `authFailed`: an action with an
   * `access` string answers 503, one without serves anonymous.
   */
  authenticate(ctx: RapidContext): unknown | Promise<unknown>;
  /**
   * Whether the caller of `ctx` may run an action declaring `access`.
   * The string is the binding's grammar — rapid passes it as written.
   * Called for transport requests, `invoke()` and composed parts alike;
   * `false` is a 401 for an anonymous caller, a 403 otherwise.
   */
  authorize(
    ctx: RapidAccessContext,
    access: string,
  ): boolean | Promise<boolean>;
  /**
   * Runs after the invocation's chain completed WITHOUT throwing — the
   * hook a scheme uses to seal the response (an HMAC signature, an
   * encrypted body). A thrown invocation is answered as is.
   */
  finish?(ctx: RapidContext): void | Promise<void>;
  /** Observes every denial (transport or `invoke()`) — an audit hook. */
  onDenied?(ctx: RapidAccessContext, access: string): void;
};
