import { assertEquals, assertThrows } from '$asserts';
import { Guardian, GuardianError, type GuardianType } from '../mod.ts';

Deno.test('Guardian entry point', async (t) => {
  await t.step('provides access to all guardian types', async (t) => {
    await t.step('string guardian', () => {
      const guard = Guardian.string();
      assertEquals(guard('hello'), 'hello');
      assertThrows(() => guard(123), GuardianError);
    });

    await t.step('number guardian', () => {
      const guard = Guardian.number();
      assertEquals(guard(123), 123);
      assertThrows(() => guard('hello'), GuardianError);
    });

    await t.step('boolean guardian', () => {
      const guard = Guardian.boolean();
      assertEquals(guard(true), true);
      assertThrows(() => guard('sdf'), GuardianError);
    });

    await t.step('bigint guardian', () => {
      const guard = Guardian.bigint();
      assertEquals(guard(123n), 123n);
      assertThrows(() => guard('hello'), GuardianError);
    });

    await t.step('array guardian', () => {
      const guard = Guardian.array();
      assertEquals(guard([1, 2, 3]), [1, 2, 3]);
      assertThrows(() => guard('not an array'), GuardianError);
    });

    await t.step('object guardian', () => {
      const guard = Guardian.object();
      assertEquals(guard({ a: 1 }), { a: 1 });
      assertThrows(() => guard('not an object'), GuardianError);
    });

    await t.step('function guardian', () => {
      const fn = () => 42;
      const guard = Guardian.function();
      assertEquals(guard(fn), fn);
      assertThrows(() => guard('not a function'), GuardianError);
    });

    await t.step('date guardian', () => {
      const date = new Date();
      const guard = Guardian.date();
      assertEquals(guard(date).getTime(), date.getTime());
      assertThrows(() => guard('not a date'), GuardianError);
    });
  });

  await t.step('oneOf', async (t) => {
    await t.step('validates against multiple types', () => {
      const stringOrNumber = Guardian.oneOf([
        Guardian.string(),
        Guardian.number(),
      ]);

      assertEquals(stringOrNumber('hello'), 'hello');
      assertEquals(stringOrNumber(42), 42);
      assertThrows(() => stringOrNumber(true), GuardianError);
    });

    await t.step('works with complex schemas', () => {
      const userGuard = Guardian.object().schema({
        id: Guardian.oneOf([Guardian.string(), Guardian.number()]),
        name: Guardian.string(),
      });

      assertEquals(userGuard({ id: '123', name: 'John' }), {
        id: '123',
        name: 'John',
      });
      assertEquals(userGuard({ id: 123, name: 'John' }), {
        id: 123,
        name: 'John',
      });

      assertThrows(() => userGuard({ id: true, name: 'John' }), GuardianError);
    });

    await t.step('provides clear error messages', () => {
      const guard = Guardian.oneOf([
        Guardian.string(),
        Guardian.number().positive(),
      ]);

      try {
        guard(true);
        throw new Error('Should have thrown');
      } catch (error) {
        assertEquals(error instanceof GuardianError, true);
        // Error should mention both string and number types
        assertEquals(
          (error as GuardianError).message,
          'Expected value to match one of the types: string, number',
        );
      }
    });

    await t.step('accepts custom error message', () => {
      const guard = Guardian.oneOf(
        [Guardian.string(), Guardian.number()],
        'Must be string or number',
      );

      assertThrows(() => guard({}), GuardianError, 'Must be string or number');
    });
  });

  await t.step('supports complex validation chains', () => {
    const userGuard = Guardian.object().schema({
      name: Guardian.string().minLength(3),
      age: Guardian.number().min(18),
      email: Guardian.string().optional(),
      tags: Guardian.array().of(Guardian.string()),
    });

    const validUser = {
      name: 'John',
      age: 30,
      email: undefined,
      tags: ['developer', 'typescript'],
    };

    assertEquals(userGuard(validUser), validUser);

    assertThrows(
      () => userGuard({ name: 'John', age: 17, tags: ['developer'] }),
      GuardianError,
    );

    assertThrows(
      () => userGuard({ name: 'Jo', age: 30, tags: ['developer'] }),
      GuardianError,
    );

    assertThrows(
      () => userGuard({ name: 'John', age: 30, tags: [123] }),
      GuardianError,
    );
  });

  await t.step('supports type inference with GuardianType', () => {
    const userGuard = Guardian.object().schema({
      name: Guardian.string(),
      age: Guardian.number(),
      active: Guardian.boolean(),
    });

    // This is a type-level test, so we're just ensuring this code compiles
    type User = GuardianType<typeof userGuard>;

    // Type assertion to make sure User has the correct shape
    const _test: User = { name: 'John', age: 30, active: true };
  });
});
