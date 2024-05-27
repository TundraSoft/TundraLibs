import {
  assertEquals,
  assertNotEquals,
  assertThrows,
} from '../dev.dependencies.ts';
import { getFreePort } from './getFreePort.ts';

Deno.test(
  { name: 'utils:getFreePort', permissions: { net: true } },
  async (t) => {
    await t.step('should return a number', () => {
      const port = getFreePort();
      assertEquals(typeof port, 'number');
    });

    await t.step('should return a number within the specified range', () => {
      const min = 3000;
      const max = 4000;
      const port = getFreePort(min, max);

      assertEquals(port >= min && port <= max, true);
    });

    await t.step('should return a different port on subsequent calls', () => {
      const port1 = getFreePort();
      const port2 = getFreePort();

      assertEquals(port1 !== port2, true);
    });

    await t.step('should throw an error if the range is invalid', () => {
      const min = 4000;
      const max = 3000;

      assertThrows(() => {
        getFreePort(min, max);
      }, RangeError);
    });

    await t.step('should not return a port in use', () => {
      const port = getFreePort(3000, 3002);
      const listener = Deno.listen({ port });
      for (let i = 0; i < 10; i++) {
        assertNotEquals(getFreePort(3000, 3002), port);
      }
      listener.close();
    });
  },
);
