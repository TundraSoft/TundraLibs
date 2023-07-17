import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from '../../dev.dependencies.ts';
import { afterEach, beforeEach, describe, it } from '../../dev.dependencies.ts';

import { envArgs } from '../envArgs.ts';

describe('envArgs', () => {
  it('should retrieve environment variables and return them as an object', async () => {
    const result = await envArgs();
    assertEquals(typeof result, 'object');
    if (result.has('USER')) {
      assertStrictEquals(result.get('USER'), Deno.env.get('USER'));
    }
  });

  it('should load additional environment variables from the specified file', async () => {
    const result = await envArgs('utils/tests/testdata');
    assertEquals(result.get('USER'), 'TundraLib');
    assertEquals(result.get('HOME'), '/home/TundraLib');
  });

  it('should not allow updating environment variables', async () => {
    const result = await envArgs();
    result.set('TEST_USER', 'sdfsdf');
    assertEquals(result.has('TEST_USER'), false);
  });
});
