import { assertEquals, assertThrows } from 'jsr:@std/assert';
import { parse } from '../parse.ts';
import type {
  ArrayGuardianSchema,
  BigIntGuardianSchema,
  BooleanGuardianSchema,
  DateGuardianSchema,
  FunctionGuardianSchema,
  GuardianSchema,
  NumberGuardianSchema,
  ObjectGuardianSchema,
  OneOfGuardianSchema,
  StringGuardianSchema,
  UnknownGuardianSchema,
} from '../types/mod.ts';
import { GuardianError } from '../GuardianError.ts';

Deno.test('Guardian Parse Module', async (t) => {
  await t.step('String Guardian Parsing', async (t) => {
    await t.step('basic string schema', () => {
      const schema: StringGuardianSchema = { type: 'string' };
      const guardian = parse(schema);

      assertEquals(guardian('hello'), 'hello');
      assertThrows(
        () => guardian(123),
        GuardianError,
        'Expected value to be a string',
      );
    });

    await t.step('string with validations', () => {
      const schema: StringGuardianSchema = {
        type: 'string',
        minLength: 3,
        maxLength: 10,
        pattern: '^[a-z]+$',
      };
      const guardian = parse(schema);

      assertEquals(guardian('hello'), 'hello');
      assertThrows(() => guardian('hi'), GuardianError); // too short
      assertThrows(() => guardian('verylongstring'), GuardianError); // too long
      assertThrows(() => guardian('Hello'), GuardianError); // doesn't match pattern
    });

    await t.step('string with transformations', () => {
      const schema: StringGuardianSchema = {
        type: 'string',
        trim: true,
        upperCase: true,
      };
      const guardian = parse(schema);

      assertEquals(guardian('  hello  '), 'HELLO');
    });

    await t.step('string with format validations', () => {
      const emailSchema: StringGuardianSchema = {
        type: 'string',
        email: true,
      };
      const emailGuardian = parse(emailSchema);

      assertEquals(emailGuardian('test@example.com'), 'test@example.com');
      assertThrows(() => emailGuardian('invalid-email'), GuardianError);

      const urlSchema: StringGuardianSchema = {
        type: 'string',
        url: true,
      };
      const urlGuardian = parse(urlSchema);

      assertEquals(urlGuardian('https://example.com'), 'https://example.com');
      assertThrows(() => urlGuardian('not-a-url'), GuardianError);
    });

    await t.step('string with replace and slice', () => {
      const schema: StringGuardianSchema = {
        type: 'string',
        replace: {
          searchValue: 'old',
          replaceValue: 'new',
        },
        slice: {
          start: 0,
          end: 5,
        },
      };
      const guardian = parse(schema);

      assertEquals(guardian('old text here'), 'new t');
    });

    await t.step('string with equals and in validations', () => {
      const equalsSchema: StringGuardianSchema = {
        type: 'string',
        equals: 'exact',
      };
      const equalsGuardian = parse(equalsSchema);

      assertEquals(equalsGuardian('exact'), 'exact');
      assertThrows(() => equalsGuardian('different'), GuardianError);

      const inSchema: StringGuardianSchema = {
        type: 'string',
        in: ['red', 'green', 'blue'],
      };
      const inGuardian = parse(inSchema);

      assertEquals(inGuardian('red'), 'red');
      assertThrows(() => inGuardian('yellow'), GuardianError);
    });
  });

  await t.step('Number Guardian Parsing', async (t) => {
    await t.step('basic number schema', () => {
      const schema: NumberGuardianSchema = { type: 'number' };
      const guardian = parse(schema);

      assertEquals(guardian(42), 42);
      assertEquals(guardian('42'), 42); // coercion
      assertThrows(() => guardian('not-a-number'), GuardianError);
    });

    await t.step('number with validations', () => {
      const schema: NumberGuardianSchema = {
        type: 'number',
        min: 0,
        max: 100,
        integer: true,
      };
      const guardian = parse(schema);

      assertEquals(guardian(50), 50);
      assertThrows(() => guardian(-1), GuardianError); // below min
      assertThrows(() => guardian(101), GuardianError); // above max
      assertThrows(() => guardian(50.5), GuardianError); // not integer
    });

    await t.step('number with range validation', () => {
      const schema: NumberGuardianSchema = {
        type: 'number',
        range: { min: 10, max: 20 },
      };
      const guardian = parse(schema);

      assertEquals(guardian(15), 15);
      assertThrows(() => guardian(5), GuardianError);
      assertThrows(() => guardian(25), GuardianError);
    });

    await t.step('number with transformations', () => {
      const schema: NumberGuardianSchema = {
        type: 'number',
        abs: true,
        ceil: true,
      };
      const guardian = parse(schema);

      assertEquals(guardian(-3.2), 3); // abs then ceil
    });

    await t.step('number with positive/negative', () => {
      const positiveSchema: NumberGuardianSchema = {
        type: 'number',
        positive: true,
      };
      const positiveGuardian = parse(positiveSchema);

      assertEquals(positiveGuardian(5), 5);
      assertThrows(() => positiveGuardian(-5), GuardianError);

      const negativeSchema: NumberGuardianSchema = {
        type: 'number',
        negative: true,
      };
      const negativeGuardian = parse(negativeSchema);

      assertEquals(negativeGuardian(-5), -5);
      assertThrows(() => negativeGuardian(5), GuardianError);
    });
  });

  await t.step('BigInt Guardian Parsing', async (t) => {
    await t.step('basic bigint schema', () => {
      const schema: BigIntGuardianSchema = { type: 'bigint' };
      const guardian = parse(schema);

      assertEquals(guardian(42n), 42n);
      assertEquals(guardian(42), 42n); // coercion
      assertEquals(guardian('42'), 42n); // coercion
      assertThrows(() => guardian('not-a-number'), GuardianError);
    });

    await t.step('bigint with validations', () => {
      const schema: BigIntGuardianSchema = {
        type: 'bigint',
        min: '10',
        max: '100',
        positive: true,
      };
      const guardian = parse(schema);

      assertEquals(guardian('50'), 50n);
      assertThrows(() => guardian('5'), GuardianError); // below min
      assertThrows(() => guardian('150'), GuardianError); // above max
      assertThrows(() => guardian('-10'), GuardianError); // not positive
    });

    await t.step('bigint with range validation', () => {
      const schema: BigIntGuardianSchema = {
        type: 'bigint',
        range: { min: '1000', max: '2000' },
      };
      const guardian = parse(schema);

      assertEquals(guardian('1500'), 1500n);
      assertThrows(() => guardian('500'), GuardianError);
      assertThrows(() => guardian('2500'), GuardianError);
    });
  });

  await t.step('Boolean Guardian Parsing', async (t) => {
    await t.step('basic boolean schema', () => {
      const schema: BooleanGuardianSchema = { type: 'boolean' };
      const guardian = parse(schema);

      assertEquals(guardian(true), true);
      assertEquals(guardian(false), false);
      assertEquals(guardian('true'), true); // coercion
      assertEquals(guardian('false'), false); // coercion
      assertEquals(guardian(1), true); // coercion
      assertEquals(guardian(0), false); // coercion
    });

    await t.step('boolean with equals validation', () => {
      const schema: BooleanGuardianSchema = {
        type: 'boolean',
        equals: true,
      };
      const guardian = parse(schema);

      assertEquals(guardian(true), true);
      assertEquals(guardian('true'), true);
      assertThrows(() => guardian(false), GuardianError);
    });
  });

  await t.step('Date Guardian Parsing', async (t) => {
    await t.step('basic date schema', () => {
      const schema: DateGuardianSchema = { type: 'date' };
      const guardian = parse(schema);

      const date = new Date('2023-01-01');
      assertEquals(guardian(date), date);
      assertEquals(guardian('2023-01-01'), new Date('2023-01-01'));
      assertEquals(guardian(1672531200000), new Date(1672531200000)); // timestamp
    });

    await t.step('date with validations', () => {
      const schema: DateGuardianSchema = {
        type: 'date',
        min: '2023-01-01T00:00:00.000Z',
        max: '2023-12-31T23:59:59.999Z',
      };
      const guardian = parse(schema);

      assertEquals(guardian('2023-06-15'), new Date('2023-06-15'));
      assertThrows(() => guardian('2022-12-31'), GuardianError); // before min
      assertThrows(() => guardian('2024-01-01'), GuardianError); // after max
    });

    await t.step('date with range validation', () => {
      const schema: DateGuardianSchema = {
        type: 'date',
        range: {
          min: '2023-01-01T00:00:00.000Z',
          max: '2023-12-31T23:59:59.999Z',
        },
      };
      const guardian = parse(schema);

      assertEquals(guardian('2023-06-15'), new Date('2023-06-15'));
      assertThrows(() => guardian('2022-12-31'), GuardianError);
      assertThrows(() => guardian('2024-01-01'), GuardianError);
    });
  });

  await t.step('Array Guardian Parsing', async (t) => {
    await t.step('basic array schema', () => {
      const schema: ArrayGuardianSchema = { type: 'array' };
      const guardian = parse(schema);

      assertEquals(guardian([1, 2, 3]), [1, 2, 3]);
      assertThrows(() => guardian('not-an-array'), GuardianError);
    });

    await t.step('array with element type', () => {
      const schema: ArrayGuardianSchema = {
        type: 'array',
        of: { type: 'string' },
      };
      const guardian = parse(schema);

      assertEquals(guardian(['a', 'b', 'c']), ['a', 'b', 'c']);
      assertThrows(() => guardian([1, 2, 3]), GuardianError);
    });

    await t.step('array with validations', () => {
      const schema: ArrayGuardianSchema = {
        type: 'array',
        minLength: 2,
        maxLength: 5,
        notEmpty: true,
      };
      const guardian = parse(schema);

      assertEquals(guardian([1, 2, 3]), [1, 2, 3]);
      assertThrows(() => guardian([]), GuardianError); // empty
      assertThrows(() => guardian([1]), GuardianError); // too short
      assertThrows(() => guardian([1, 2, 3, 4, 5, 6]), GuardianError); // too long
    });

    await t.step('array with exact length', () => {
      const schema: ArrayGuardianSchema = {
        type: 'array',
        length: 3,
      };
      const guardian = parse(schema);

      assertEquals(guardian([1, 2, 3]), [1, 2, 3]);
      assertThrows(() => guardian([1, 2]), GuardianError);
      assertThrows(() => guardian([1, 2, 3, 4]), GuardianError);
    });

    await t.step('array with unique constraint', () => {
      const schema: ArrayGuardianSchema = {
        type: 'array',
        unique: true,
      };
      const guardian = parse(schema);

      assertEquals(guardian([1, 2, 3]), [1, 2, 3]);
      assertThrows(() => guardian([1, 2, 2]), GuardianError); // duplicate
    });
  });

  await t.step('Object Guardian Parsing', async (t) => {
    await t.step('basic object schema', () => {
      const schema: ObjectGuardianSchema = { type: 'object' };
      const guardian = parse(schema);

      assertEquals(guardian({ key: 'value' }), { key: 'value' });
      assertThrows(() => guardian('not-an-object'), GuardianError);
      assertThrows(() => guardian(null), GuardianError);
      assertThrows(() => guardian([]), GuardianError);
    });

    await t.step('object with property schema', () => {
      const schema: ObjectGuardianSchema = {
        type: 'object',
        schema: {
          name: { type: 'string' },
          age: { type: 'number', min: 0 },
        },
      };
      const guardian = parse(schema);

      const validObj = { name: 'John', age: 30 };
      assertEquals(guardian(validObj), validObj);

      assertThrows(() => guardian({ name: 'John', age: -5 }), GuardianError); // invalid age
      assertThrows(() => guardian({ name: 123, age: 30 }), GuardianError); // invalid name
    });

    await t.step('object with strict mode', () => {
      const schema: ObjectGuardianSchema = {
        type: 'object',
        schema: {
          name: { type: 'string' },
        },
        strict: true,
      };
      const guardian = parse(schema);

      assertEquals(guardian({ name: 'John' }), { name: 'John' });
      assertThrows(
        () => guardian({ name: 'John', extra: 'value' }),
        GuardianError,
      );
    });

    await t.step('object with additionalProperties false', () => {
      const schema: ObjectGuardianSchema = {
        type: 'object',
        schema: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      };
      const guardian = parse(schema);

      // additionalProperties: false should ignore extra properties, not throw
      const result = guardian({ name: 'John', extra: 'value' });
      assertEquals(result.name, 'John');
      assertEquals((result as any).extra, undefined); // extra property not copied
    });

    await t.step('object with notEmpty validation', () => {
      const schema: ObjectGuardianSchema = {
        type: 'object',
        notEmpty: true,
      };
      const guardian = parse(schema);

      assertEquals(guardian({ key: 'value' }), { key: 'value' });
      assertThrows(() => guardian({}), GuardianError);
    });
  });

  await t.step('Function Guardian Parsing', async (t) => {
    await t.step('basic function schema', () => {
      const schema: FunctionGuardianSchema = { type: 'function' };
      const guardian = parse(schema);

      const fn = () => {};
      assertEquals(guardian(fn), fn);
      assertThrows(() => guardian('not-a-function'), GuardianError);
    });
  });

  await t.step('Unknown Guardian Parsing', async (t) => {
    await t.step('basic unknown schema', () => {
      const schema: UnknownGuardianSchema = { type: 'unknown' };
      const guardian = parse(schema);

      // Unknown guardian accepts any value
      assertEquals(guardian('string'), 'string');
      assertEquals(guardian(123), 123);
      assertEquals(guardian(true), true);
      assertEquals(guardian({}), {});
      assertEquals(guardian([]), []);
      assertEquals(guardian(null), null);
      assertEquals(guardian(undefined), undefined);
    });
  });

  await t.step('OneOf Guardian Parsing', async (t) => {
    await t.step('basic oneOf schema', () => {
      const schema: OneOfGuardianSchema = {
        type: 'oneOf',
        options: [
          { type: 'string' },
          { type: 'number' },
        ],
      };
      const guardian = parse(schema);

      assertEquals(guardian('hello'), 'hello');
      assertEquals(guardian(42), 42);
      assertThrows(() => guardian(true), GuardianError); // not in options
    });

    await t.step('oneOf with complex schemas', () => {
      const schema: OneOfGuardianSchema = {
        type: 'oneOf',
        options: [
          { type: 'string', minLength: 3 },
          { type: 'number', min: 0 },
        ],
      };
      const guardian = parse(schema);

      assertEquals(guardian('hello'), 'hello');
      assertEquals(guardian(42), 42);
      assertThrows(() => guardian('hi'), GuardianError); // string too short
      assertThrows(() => guardian(-5), GuardianError); // number too small
    });
  });

  await t.step('Optional and Nullable Modifiers', async (t) => {
    await t.step('optional schema', () => {
      const schema: StringGuardianSchema = {
        type: 'string',
        optional: true,
      };
      const guardian = parse(schema);

      assertEquals(guardian('hello'), 'hello');
      assertEquals(guardian(undefined), undefined);
      assertThrows(() => guardian(123), GuardianError);
    });

    await t.step('nullable schema', () => {
      const schema: StringGuardianSchema = {
        type: 'string',
        nullable: true,
      };
      const guardian = parse(schema);

      assertEquals(guardian('hello'), 'hello');
      assertEquals(guardian(null), null);
      assertThrows(() => guardian(123), GuardianError);
    });

    await t.step('optional and nullable schema', () => {
      const schema: StringGuardianSchema = {
        type: 'string',
        optional: true,
        nullable: true,
      };
      const guardian = parse(schema);

      assertEquals(guardian('hello'), 'hello');
      assertEquals(guardian(null), null);
      assertEquals(guardian(undefined), undefined);
      assertThrows(() => guardian(123), GuardianError);
    });
  });

  await t.step('Complex Nested Schemas', async (t) => {
    await t.step('nested object with array', () => {
      const schema: ObjectGuardianSchema = {
        type: 'object',
        schema: {
          users: {
            type: 'array',
            of: {
              type: 'object',
              schema: {
                name: { type: 'string', minLength: 2 },
                age: { type: 'number', min: 0 },
                active: { type: 'boolean', optional: true },
              },
            },
          },
        },
      };
      const guardian = parse(schema);

      const validData = {
        users: [
          { name: 'John', age: 30, active: true },
          { name: 'Jane', age: 25 },
        ],
      };
      const result = guardian(validData);

      // Check the structure and properties that should be present
      assertEquals(result.users.length, 2);
      assertEquals(result.users[0].name, 'John');
      assertEquals(result.users[0].age, 30);
      assertEquals(result.users[0].active, true);
      assertEquals(result.users[1].name, 'Jane');
      assertEquals(result.users[1].age, 25);
      // Note: active is optional and not provided for Jane, so it won't be present

      const invalidData = {
        users: [
          { name: 'J', age: 30 }, // name too short
        ],
      };
      assertThrows(() => guardian(invalidData), GuardianError);
    });
  });

  await t.step('Error Handling', async (t) => {
    await t.step('unsupported schema type', () => {
      const invalidSchema = { type: 'invalid' } as unknown as GuardianSchema;
      assertThrows(
        () => parse(invalidSchema),
        Error,
        'Unsupported schema type: invalid',
      );
    });

    await t.step('custom error message', () => {
      const schema: StringGuardianSchema = {
        type: 'string',
        error: 'Custom error message',
      };
      const guardian = parse(schema);

      assertThrows(
        () => guardian(123),
        GuardianError,
        'Custom error message',
      );
    });
  });
});
