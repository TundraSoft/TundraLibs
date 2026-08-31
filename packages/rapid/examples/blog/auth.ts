/**
 * A TINY, self-contained stand-in for `@tundralibs/pact` — just enough to
 * drive the `login()` endpoint and the `authenticate`/`authorize`
 * middleware without pulling a real auth dependency into the example. A
 * production app deletes this file and uses
 * `@tundralibs/rapid/middlewares/pact` with a real `pact` instance instead
 * — see `pactAuth.ts` for the runnable version.
 *
 * The "token" here is a plain `username.id` string — readable, NOT signed.
 * Never ship this; it exists so the demo is runnable with zero setup.
 *
 * @module
 */

/** A demo user record. */
type User = { id: string; password: string; roles: string[] };

/** The whole "user store" — two accounts, one author, one reader. */
const USERS: Record<string, User> = {
  ada: { id: 'u-ada', password: 'lovelace', roles: ['author'] },
  bob: { id: 'u-bob', password: 'builder', roles: ['reader'] },
};

/** The identity written to `ctx.auth` once a token verifies. */
export type BlogAuth = { id: string; username: string; roles: string[] };

/** Mint the demo token for a user — `<username>.<id>` (NOT secure). */
const mint = (username: string, id: string): string => `${username}.${id}`;

/**
 * The demo token for a KNOWN username (`undefined` otherwise) — what the
 * /login/as/:username: browser convenience sets as its cookie; the same
 * value POST /login returns for that user's credentials.
 */
export function demoTokenFor(username: string): string | undefined {
  const user = USERS[username];
  return user === undefined ? undefined : mint(username, user.id);
}

/**
 * A `PactLoginLike`-shaped service for `login({ pact: authService })`:
 * check the password, hand back `{ principal, token }` or `null`.
 */
export const authService = {
  login(
    _strategy: string,
    credentials: unknown,
  ): Promise<
    | { principal: { id: string } & Record<string, unknown>; token?: string }
    | null
  > {
    const { username, password } = (credentials ?? {}) as {
      username?: string;
      password?: string;
    };
    const user = username ? USERS[username] : undefined;
    if (user === undefined || user.password !== password) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      principal: { id: user.id, username, roles: user.roles },
      token: mint(username!, user.id),
    });
  },
};

/**
 * `authenticate`'s `verify`: decode the demo token back into an auth bag,
 * or `null` if it doesn't match a known user (stays anonymous). A real app
 * verifies a JWT signature here instead.
 */
export function verifyToken(token: string): BlogAuth | null {
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const username = token.slice(0, dot);
  const user = USERS[username];
  if (user === undefined || mint(username, user.id) !== token) return null;
  return { id: user.id, username, roles: user.roles };
}
