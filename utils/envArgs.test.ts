import { asserts } from '../dev.dependencies.ts';

import { envArgs } from './envArgs.ts';

Deno.test(
  { name: 'utils:envArgs', permissions: { env: true, read: true } },
  async (t) => {
    await t.step(
      'should retrieve environment variables and return them as an object',
      () => {
        const result = envArgs();
        asserts.assertEquals(typeof result, 'object');
        if (result.has('USER')) {
          asserts.assertStrictEquals(result.get('USER'), Deno.env.get('USER'));
        }
      },
    );

    await t.step(
      'should load additional environment variables from the specified file',
      () => {
        const result = envArgs('utils/fixtures');
        asserts.assertEquals(result.get('USER'), 'TundraLib');
        asserts.assertEquals(result.get('HOME'), '/home/TundraLib');
      },
    );

    await t.step('should not allow updating environment variables', () => {
      const result = envArgs();
      result.set('TEST_USER', 'sdfsdf');
      asserts.assertEquals(result.has('TEST_USER'), false);
    });
  },
);

Deno.test(
  { name: 'utils:envArgs', permissions: { env: false, read: true } },
  async (t) => {
    await t.step(
      'load env variables only from file',
      () => {
        const result = envArgs('utils/fixtures');
        asserts.assertEquals(typeof result, 'object');
        asserts.assertEquals(result.keys().length, 2);
        if (result.has('USER')) {
          asserts.assertStrictEquals(result.get('USER'), 'TundraLib');
        }
      },
    );
  },
);
