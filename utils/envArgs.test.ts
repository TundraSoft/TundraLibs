import {
  assertEquals,
  assertStrictEquals,
  describe, it
} from '../dev.dependencies.ts';

import { envArgs } from './envArgs.ts';

describe(`[library='utils' name='envArgs']`, () => {
  it('should retrieve environment variables and return them as an object', () => {
    const result = envArgs();
    assertEquals(typeof result, 'object');
    if (result.has('USER')) {
      assertStrictEquals(result.get('USER'), Deno.env.get('USER'));
    }
  });

  it('should load additional environment variables from the specified file', () => {
    const result = envArgs('utils/testdata');
    assertEquals(result.get('USER'), 'TundraLib');
    assertEquals(result.get('HOME'), '/home/TundraLib');
  });

  it('should not allow updating environment variables', () => {
    const result = envArgs();
    result.set('TEST_USER', 'sdfsdf');
    assertEquals(result.has('TEST_USER'), false);
  });
});
