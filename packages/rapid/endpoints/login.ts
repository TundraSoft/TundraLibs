/**
 * @fileoverview `login(pact)` — a mountable login endpoint over a
 * `@tundralibs/pact` instance: `app.post('/login', login({ pact }))`. It
 * reads credentials from the request body, runs `pact.login(strategy,
 * credentials)`, and returns the token + principal (401 on failure). pact
 * is a type-only import, so this adds no runtime dependency until you pass
 * a `pact` instance.
 *
 * @module
 */
import type { RapidHTTPHandler } from '../types/mod.ts';

/** The slice of `@tundralibs/pact`'s `PACT` this endpoint needs (type-only). */
type PactLoginLike = {
  login(
    strategy: string,
    credentials: unknown,
  ): Promise<
    | { principal: { id: string } & Record<string, unknown>; token?: string }
    | null
  >;
};

/** Options for {@link login}. */
export type LoginOptions = {
  /** Your configured pact instance. */
  pact: PactLoginLike;
  /** The named login strategy to run. @default 'password' */
  strategy?: string;
};

/** An endpoint handler that logs a user in via pact and returns the token. */
export function login(options: LoginOptions): RapidHTTPHandler {
  const strategy = options.strategy ?? 'password';
  return async (ctx) => {
    const credentials = await ctx.payload;
    const result = await options.pact.login(strategy, credentials);
    if (result === null) {
      return {
        status: 401,
        content: {
          code: 'RAPID_UNAUTHENTICATED',
          message: 'invalid credentials',
        },
      };
    }
    return {
      status: 200,
      content: { token: result.token, principal: result.principal },
    };
  };
}
