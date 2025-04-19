import { assertEquals, assertRejects, assertThrows } from '$asserts';
import { test } from '../../helpers/mod.ts';

// Delay for a given number of milliseconds
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.test('Guardian.helpers.test', async (t) => {
  // Basic functionality
  await t.step('passes value when test function returns true', () => {
    const testFn = test((value: number) => value > 5);
    assertEquals(testFn(10), 10);
  });

  await t.step('throws error when test function returns false', () => {
    const testFn = test((value: number) => value > 5);
    assertThrows(
      () => testFn(3),
      Error,
      'Unexpected value: 3',
    );
  });

  // Different data types
  await t.step('works with string values', () => {
    const testFn = test((value: string) => value.length > 3);
    assertEquals(testFn('hello'), 'hello');
    assertThrows(() => testFn('hi'), Error);
  });

  await t.step('works with boolean values', () => {
    const testFn = test((value: boolean) => value === true);
    assertEquals(testFn(true), true);
    assertThrows(() => testFn(false), Error);
  });

  await t.step('works with object values', () => {
    const testFn = test((value: Record<string, unknown>) => 'name' in value);
    assertEquals(testFn({ name: 'test' }), { name: 'test' });
    assertThrows(() => testFn({}), Error);
  });

  await t.step('works with array values', () => {
    const testFn = test((value: unknown[]) => value.length > 0);
    assertEquals(testFn([1, 2, 3]), [1, 2, 3]);
    assertThrows(() => testFn([]), Error);
  });

  // Edge cases
  await t.step('handles null and undefined correctly', () => {
    const notNullTest = test((value: unknown) => value !== null);
    assertEquals(notNullTest(undefined), undefined);
    assertEquals(notNullTest('value'), 'value');
    assertThrows(() => notNullTest(null), Error);

    const notUndefinedTest = test((value: unknown) => value !== undefined);
    assertEquals(notUndefinedTest(null), null);
    assertEquals(notUndefinedTest('value'), 'value');
    assertThrows(() => notUndefinedTest(undefined), Error);
  });

  // Complex predicates
  await t.step('works with complex predicate functions', () => {
    const complexTest = test(
      (value: { age: number; name: string }) =>
        value.age >= 18 && value.name.length > 2,
    );

    assertEquals(complexTest({ age: 25, name: 'John' }), {
      age: 25,
      name: 'John',
    });
    assertThrows(() => complexTest({ age: 17, name: 'John' }), Error);
    assertThrows(() => complexTest({ age: 25, name: 'Jo' }), Error);
  });

  // Custom error messages
  await t.step('supports custom error messages', () => {
    const customMessage = 'Custom validation error';
    const testFn = test((value: number) => value > 5, customMessage);

    assertThrows(
      () => testFn(3),
      Error,
      customMessage,
    );
  });

  // Async functionality
  await t.step('supports async test functions', async () => {
    const asyncTestFn = test(
      async (value: number) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return value > 5;
      },
      'Value must be greater than 5',
    );

    assertEquals(await asyncTestFn(10), 10);

    await assertRejects(
      async () => await asyncTestFn(3),
      Error,
      'Value must be greater than 5',
    );
  });

  await t.step('works with async predicate that rejects', async () => {
    const asyncTestFn = test(
      async (value: number) => {
        await delay(10);
        if (value < 0) {
          throw new Error('Negative value not allowed');
        }
        return value > 5;
      },
    );

    assertEquals(await asyncTestFn(10), 10);

    await assertRejects(
      async () => await asyncTestFn(-5),
      Error,
      'Negative value not allowed',
    );

    await assertRejects(
      async () => await asyncTestFn(3),
      Error,
    );
  });

  // Multiple calls
  await t.step('can be called multiple times with same validator', () => {
    const testFn = test((value: number) => value % 2 === 0, 'Must be even');

    assertEquals(testFn(2), 2);
    assertEquals(testFn(4), 4);
    assertThrows(() => testFn(3), Error, 'Must be even');
  });
});
