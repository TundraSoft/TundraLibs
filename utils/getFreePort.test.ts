import * as asserts from '$asserts';
import { getFreePort, PortError } from './getFreePort.ts';

Deno.test('utils.getFreePort', async (t) => {
  await t.step('returns a port within the specified range', () => {
    const port = getFreePort({ min: 3000, max: 4000 });
    asserts.assert(port >= 3000 && port <= 4000, 'Port should be within range');
  });

  await t.step('respects excluded ports', () => {
    const exclude = [3000, 3001, 3002];
    const port = getFreePort({ min: 3000, max: 3010, exclude });
    asserts.assert(
      !exclude.includes(port),
      'Port should not be in excluded list',
    );
  });

  await t.step('throws on invalid range', async () => {
    await asserts.assertThrows(
      () => getFreePort({ min: 5000, max: 4000 }),
      PortError,
      'Maximum port must be greater than minimum port',
    );
  });

  await t.step('throws on invalid port numbers', async () => {
    await asserts.assertThrows(
      () => getFreePort({ min: -1 }),
      PortError,
      'Minimum port must be between 0 and 65535',
    );

    await asserts.assertThrows(
      () => getFreePort({ max: 65536 }),
      PortError,
      'Maximum port must be between 0 and 65535',
    );
  });
});
