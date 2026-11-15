import { envArgs } from '@tundralibs/utils';

const REQUIRED = envArgs('./packages/norm/').get('LIVE_DB_REQUIRED') === 'true';

/**
 * Called where a live test gives up because its database cannot be reached.
 * Returns, so the test passes as a skip. With `LIVE_DB_REQUIRED=true` it
 * throws instead, so a run that must have its databases fails when one is
 * down.
 *
 * @param reason Which engine could not be reached, and where.
 * @throws {Error} When `LIVE_DB_REQUIRED` is `true`.
 */
export function requireLive(reason: string): void {
  if (REQUIRED) {
    throw new Error(
      `${reason}, and LIVE_DB_REQUIRED=true: its live tests did not run`,
    );
  }
}
