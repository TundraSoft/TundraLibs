import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { unreachableReason } from './liveAvailable.ts';

/** A probe whose `connect` runs `connect`, and that counts its disconnects. */
const probe = (connect: () => void, ping = true) => {
  const calls = { disconnect: 0 };
  return {
    calls,
    connect: () => Promise.resolve().then(connect),
    ping: () => Promise.resolve(ping),
    disconnect: () => Promise.resolve(void calls.disconnect++),
  };
};

const failing = (error: Error, code?: string) =>
  probe(() => {
    throw Object.assign(error, code ? { code } : {});
  });

describe('drivers.tests.liveAvailable', () => {
  describe('unreachableReason', () => {
    it('should be empty for an engine that connects and answers a ping', async () => {
      const up = probe(() => {});
      asserts.assertEquals(await unreachableReason(up), '');
      asserts.assertEquals(up.calls.disconnect, 1);
    });

    it('should give the error code and the first line of the cause', async () => {
      const refused = failing(
        new Error('Authentication failed for MONGO::probe', {
          cause: new Error('Authentication failed.\n    at connect'),
        }),
        'INVALID_AUTH',
      );
      asserts.assertEquals(
        await unreachableReason(refused),
        'INVALID_AUTH: Authentication failed.',
      );
      asserts.assertEquals(refused.calls.disconnect, 1);
    });

    it('should fall back to the error name and its own message', async () => {
      asserts.assertEquals(
        await unreachableReason(failing(new TypeError('bad port'))),
        'TypeError: bad port',
      );
    });

    it('should say so when the ping returns false', async () => {
      asserts.assertEquals(
        await unreachableReason(probe(() => {}, false)),
        'the ping returned false',
      );
    });

    it('should replace a connection string, whatever its password holds', async () => {
      const reason = await unreachableReason(failing(
        new Error('Failed to connect', {
          cause: new Error(
            'no server at mongodb+srv://app:s3/cr@t@db:27017/app?x=1 after 30s',
          ),
        }),
        'CONNECTION_FAILED',
      ));
      asserts.assertEquals(
        reason,
        'CONNECTION_FAILED: no server at <url> after 30s',
      );
    });
  });
});
