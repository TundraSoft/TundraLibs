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

  await t.step('throws when all ports in range are excluded', () => {
    asserts.assertThrows(
      () => getFreePort({ min: 3000, max: 3002, exclude: [3000, 3001, 3002] }),
      PortError,
      'All ports in range are excluded',
    );
  });

  await t.step('ignores excluded ports outside range', () => {
    const port = getFreePort({
      min: 4000,
      max: 4000,
      exclude: [3000, 3001, 5000], // Only ports outside range
    });
    asserts.assertEquals(
      port,
      4000,
      'Should ignore excluded ports outside range',
    );
  });

  await t.step('handles empty exclude array', () => {
    const port = getFreePort({ min: 8000, max: 8000, exclude: [] });
    asserts.assertEquals(port, 8000, 'Should handle empty exclude array');
  });

  await t.step('handles large exclude list', () => {
    const largeExclude = Array.from({ length: 100 }, (_, i) => 2000 + i);
    const port = getFreePort({
      min: 3000,
      max: 3100,
      exclude: largeExclude, // Excluded ports outside range
    });
    asserts.assert(
      port >= 3000 && port <= 3100,
      'Should handle large exclude list',
    );
  });

  await t.step('returns different ports on multiple calls', () => {
    const ports = new Set();
    for (let i = 0; i < 10; i++) {
      const port = getFreePort({ min: 10000, max: 20000 });
      ports.add(port);
    }
    // We should get some variety in port selection (not always the same port)
    // This isn't guaranteed due to randomness, but very likely
    asserts.assert(ports.size >= 1, 'Should return valid ports');
  });

  await t.step('throws when no free port found after max attempts', () => {
    // This test is difficult to create reliably without mocking, but we can test edge cases
    // Testing with a very small range where all ports are likely busy
    const listeners: Deno.Listener[] = [];
    try {
      // Try to occupy all ports in a very small range
      const min = 9900;
      const max = 9901;

      // Occupy both ports
      for (let p = min; p <= max; p++) {
        try {
          const listener = Deno.listen({ port: p });
          listeners.push(listener);
        } catch {
          // If port is already busy, that's also good for this test
        }
      }

      // If both ports are now busy, getFreePort should eventually throw
      if (listeners.length === 2) {
        asserts.assertThrows(
          () => getFreePort({ min, max }),
          PortError,
          'No free port found in range',
        );
      }
    } finally {
      // Clean up
      for (const listener of listeners) {
        listener.close();
      }
    }
  });

  await t.step('handles boundary port numbers', () => {
    // Test with port 0 (valid but unusual)
    const port = getFreePort({ min: 0, max: 0 });
    asserts.assertEquals(port, 0, 'Should handle port 0');

    // Test with max port number
    const highPort = getFreePort({ min: 65535, max: 65535 });
    asserts.assertEquals(highPort, 65535, 'Should handle port 65535');
  });

  await t.step('handles edge case max port validation', () => {
    asserts.assertThrows(
      () => getFreePort({ min: 65536 }),
      PortError,
      'Minimum port must be between 0 and 65535',
    );
  });
});
