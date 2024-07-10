import { asserts } from '../../dev.dependencies.ts';
import { passwordGenerator } from '../mod.ts';

Deno.test('id > passwordGenerator', async (t) => {
  await t.step('Check for length consistency on sample set of 10000', () => {
    for (let i = 6; i <= 40; i++) {
      for (let j = 0; j < 10000; j++) {
        asserts.assertEquals(i, passwordGenerator(i).length);
      }
    }
  });
});
