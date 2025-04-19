import { assertEquals } from '$asserts';
import { isPromiseLike } from '../../helpers/mod.ts';

Deno.test('Guardian.helpers.isPromiseLike', async (t) => {
  await t.step('identifies native Promise objects', () => {
    const promise = Promise.resolve('test');
    assertEquals(isPromiseLike(promise), true);
  });

  await t.step('identifies Promise-like objects with then method', () => {
    const promiseLike = {
      then: () => {},
    };
    assertEquals(isPromiseLike(promiseLike), true);
  });

  await t.step('identifies Promise-like objects from async functions', () => {
    const asyncFnResult = (async () => {
      await 1;
      return 'test';
    })();
    assertEquals(isPromiseLike(asyncFnResult), true);
  });

  await t.step('rejects non Promise-like values', () => {
    assertEquals(isPromiseLike(undefined), false);
    assertEquals(isPromiseLike(null), false);
    assertEquals(isPromiseLike(123), false);
    assertEquals(isPromiseLike('string'), false);
    assertEquals(isPromiseLike({}), false);
    assertEquals(isPromiseLike([]), false);
    assertEquals(isPromiseLike(() => {}), false);
  });

  await t.step('rejects objects with non-function then property', () => {
    const notPromiseLike = {
      then: 'not a function',
    };
    assertEquals(isPromiseLike(notPromiseLike), false);
  });
});
