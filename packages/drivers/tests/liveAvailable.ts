import { it } from '@tundralibs/compat/test';
import { envArgs } from '@tundralibs/utils';

/**
 * Gate for a live suite whose engine has a service in CI. Returns
 * `available` unchanged, so an unreachable engine still skips its tests.
 * With `LIVE_DB_REQUIRED=true`, which CI sets, an unreachable engine also
 * registers one failing test that names it, so the run cannot pass with the
 * live tests skipped.
 */
export function liveAvailable(engine: string, available: boolean): boolean {
  if (
    !available &&
    envArgs('./packages/drivers/').get('LIVE_DB_REQUIRED') === 'true'
  ) {
    it(`${engine} is reachable (LIVE_DB_REQUIRED)`, () => {
      throw new Error(
        `${engine} is unreachable and LIVE_DB_REQUIRED=true: its live tests would have been skipped`,
      );
    });
  }
  return available;
}
