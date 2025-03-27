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
    asserts.assert(port >= 3000 && port <= 3010, 'Port should be within range');
  });

  await t.step('works with min equal to max', () => {
    // We need to pick a port that's likely to be free
    const port = getFreePort({ min: 9876, max: 9876 });
    asserts.assertEquals(port, 9876, 'Port should equal the specified value');
  });

  await t.step('finds a free port when some ports are busy', () => {
    // Define a small range of ports
    const min = 7000;
    const max = 7009;

    // Create listeners for most ports in this range
    const listeners: Deno.Listener[] = [];
    const busyPorts: number[] = [];

    try {
      // Try to occupy ports 7000-7008
      for (let p = min; p < max; p++) {
        try {
          const listener = Deno.listen({ port: p });
          listeners.push(listener);
          busyPorts.push(p);
        } catch {
          // Port might already be in use by the system, skip it
          continue;
        }
      }

      // At least some ports should be busy now
      asserts.assert(
        busyPorts.length > 0,
        'At least one port should be occupied',
      );

      // getFreePort should find the one free port (7009) or another free port if all test ports are busy
      const port = getFreePort({ min, max });

      // The port shouldn't be in our list of busy ports
      asserts.assert(
        !busyPorts.includes(port),
        'The returned port should not be one of the busy ports',
      );

      // The port should be within our specified range
      asserts.assert(
        port >= min && port <= max,
        'Port should be within specified range',
      );
    } finally {
      // Clean up by closing all listeners
      for (const listener of listeners) {
        listener.close();
      }
    }
  });

  await t.step('throws on invalid range', () => {
    asserts.assertThrows(
      () => getFreePort({ min: 5000, max: 4000 }),
      PortError,
      'Maximum port must be greater than minimum port',
    );
  });

  await t.step('throws on invalid port numbers', () => {
    asserts.assertThrows(
      () => getFreePort({ min: -1 }),
      PortError,
      'Minimum port must be between 0 and 65535',
    );

    asserts.assertThrows(
      () => getFreePort({ max: 65536 }),
      PortError,
      'Maximum port must be between 0 and 65535',
    );
  });

  await t.step('uses default range when no options provided', () => {
    const port = getFreePort();
    asserts.assert(
      port >= 1024 && port <= 65535,
      'Port should be within default range',
    );
  });
});
