import {
  assertEquals,
  assertNotEquals,
  assertThrows,
  describe,
  it,
} from '../dev.dependencies.ts';
import { getFreePort } from './getFreePort.ts';

describe({ name: 'utils', permissions: { net: true } }, () => {
  describe({ name: 'getFreePort' }, () => {
    it('should return a number', () => {
      const port = getFreePort();
      assertEquals(typeof port, 'number');
    });

    it('should return a number within the specified range', () => {
      const min = 3000;
      const max = 4000;
      const port = getFreePort(min, max);

      assertEquals(port >= min && port <= max, true);
    });

    it('should return a different port on subsequent calls', () => {
      const port1 = getFreePort();
      const port2 = getFreePort();

      assertEquals(port1 !== port2, true);
    });

    it('should throw an error if the range is invalid', () => {
      const min = 4000;
      const max = 3000;

      assertThrows(() => {
        getFreePort(min, max);
      }, RangeError);
    });

    it('should not return a port in use', () => {
      const port = getFreePort(3000, 3010);
      const listener = Deno.listen({ port });
      for (let i = 0; i < 10; i++) {
        assertNotEquals(getFreePort(3000, 3010), port);
      }
      listener.close();
    });
  });
});
