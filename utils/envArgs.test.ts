import { assertEquals, assertStrictEquals } from '../dev.dependencies.ts';

import { envArgs } from './envArgs.ts';

Deno.test({ name: 'utils/envArgs' }, async (t) => {
  await t.step(
    'should retrieve environment variables and return them as an object',
    () => {
      const result = envArgs();
      assertEquals(typeof result, 'object');
      if (result.has('USER')) {
        assertStrictEquals(result.get('USER'), Deno.env.get('USER'));
      }
    },
  );

  await t.step(
    'should load additional environment variables from the specified file',
    () => {
      const result = envArgs('utils/fixtures');
      assertEquals(result.get('USER'), 'TundraLib');
      assertEquals(result.get('HOME'), '/home/TundraLib');
    },
  );

  await t.step('should not allow updating environment variables', () => {
    const result = envArgs();
    result.set('TEST_USER', 'sdfsdf');
    assertEquals(result.has('TEST_USER'), false);
  });
});
