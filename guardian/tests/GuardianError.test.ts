import { assertEquals } from '$asserts';
import { GuardianError } from '../GuardianError.ts';

Deno.test('GuardianError', async (t) => {
  await t.step('constructor', async (t) => {
    await t.step('creates error with default message', () => {
      const error = new GuardianError({
        got: 'string',
        expected: 'number',
      });
      assertEquals(
        error.message,
        'Expected value to be number, but got string',
      );
    });

    await t.step('creates error with custom message', () => {
      const error = new GuardianError({
        got: 'string',
        expected: 'number',
      }, 'Custom error message');
      assertEquals(error.message, 'Custom error message');
    });

    await t.step('formats array values correctly', () => {
      const error = new GuardianError({
        got: ['a', 'b'],
        expected: ['c', 'd'],
      });
      assertEquals(
        error.message,
        'Expected value to be (c, d), but got (a, b)',
      );
    });
  });

  await t.step('cause handling', async (t) => {
    await t.step('adds and tracks causes', () => {
      const error = new GuardianError({ got: 'root' }, 'Root error');
      error.addCause('prop1', new GuardianError({ got: 'string' }, 'Error 1'));
      error.addCause('prop2', new GuardianError({ got: 42 }, 'Error 2'));

      assertEquals(error.causeSize(), 2);
      assertEquals(error.listCauses().sort(), ['prop1', 'prop2']);
    });

    await t.step('converts to JSON with causes', () => {
      const error = new GuardianError({ got: 'root' }, 'Root error');
      error.addCause('prop1', new GuardianError({ got: 'string' }, 'Error 1'));

      const json = error.toJSON();
      assertEquals(typeof json.causes, 'object');
      assertEquals((json.causes as Record<string, string>)['prop1'], 'Error 1');
    });
  });

  await t.step('_formatValue', async (t) => {
    await t.step('formats different types correctly', () => {
      const errorWithDate = new GuardianError({
        got: new Date('2023-01-01'),
      });
      assertEquals(errorWithDate.got?.includes('2023'), true);

      const errorWithRegex = new GuardianError({
        got: /test/,
      });
      assertEquals(errorWithRegex.got?.includes('/test/'), true);

      const errorWithObject = new GuardianError({
        got: { a: 1 },
      });
      assertEquals(errorWithObject.got?.includes('{"a":1}'), true);

      const errorWithNull = new GuardianError({
        got: null,
      });
      assertEquals(errorWithNull.got, undefined);

      const errorWithBoolean = new GuardianError({
        got: true,
      });
      assertEquals(errorWithBoolean.got, 'TRUE');
    });
  });
});
