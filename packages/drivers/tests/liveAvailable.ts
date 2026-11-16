import { it } from '@tundralibs/compat/test';
import { envArgs } from '@tundralibs/utils';

/** `LIVE_DB_REQUIRED=true`, which CI sets: a live test may not skip. */
export const LIVE_DB_REQUIRED =
  envArgs('./packages/drivers/').get('LIVE_DB_REQUIRED') === 'true';

/** The part of an engine a live probe uses. */
type LiveProbe = {
  connect(): Promise<unknown>;
  ping(): Promise<boolean>;
  disconnect(): Promise<unknown>;
};

/**
 * Why `probe` cannot serve a live suite, or `''` when it connects and answers
 * a ping. The reason is the error's code and the first line of its cause's
 * message, so a refused login reads differently from a refused connection.
 * A URL in it is replaced by `<url>`, since a connection string can carry a
 * password.
 */
export async function unreachableReason(probe: LiveProbe): Promise<string> {
  try {
    await probe.connect();
    return (await probe.ping()) ? '' : 'the ping returned false';
  } catch (error) {
    const { name, code, message, cause } = error as Error & { code?: unknown };
    const detail = (cause as Error | undefined)?.message ?? message;
    return `${code ?? name}: ${detail.split('\n')[0]}`
      .replace(/[a-z][\w+.-]*:\/\/\S+/gi, '<url>');
  } finally {
    await probe.disconnect().catch(() => {});
  }
}

/**
 * Gate for a live suite whose engine has a service in CI. Returns
 * `available` unchanged, so an unreachable engine still skips its tests.
 * With `LIVE_DB_REQUIRED=true`, which CI sets, an unreachable engine also
 * registers one failing test that names it and `reason`, so the run cannot
 * pass with the live tests skipped.
 */
export function liveAvailable(
  engine: string,
  available: boolean,
  reason = '',
): boolean {
  if (!available && LIVE_DB_REQUIRED) {
    it(`${engine} is reachable (LIVE_DB_REQUIRED)`, () => {
      throw new Error(
        `${engine} is unreachable and LIVE_DB_REQUIRED=true: its live tests would have been skipped${
          reason && `. Reason: ${reason}`
        }`,
      );
    });
  }
  return available;
}
