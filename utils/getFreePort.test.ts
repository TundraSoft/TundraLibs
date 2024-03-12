import { assertEquals } from '../dev.dependencies.ts';
import { getFreePort } from './getFreePort.ts';

Deno.test('getFreePort should return a number within the specified range', () => {
  const min = 3000;
  const max = 4000;
  const port = getFreePort(min, max);

  assertEquals(typeof port, 'number');
  assertEquals(port >= min && port <= max, true);
});

Deno.test('getFreePort should return a different port on subsequent calls', () => {
  const port1 = getFreePort();
  const port2 = getFreePort();

  assertEquals(port1 !== port2, true);
});
