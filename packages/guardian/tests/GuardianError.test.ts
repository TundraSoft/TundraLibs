import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { GuardianError } from '../errors/Base.ts';
import type { GuardianErrorMeta } from '../types/mod.ts';

describe('guardian.GuardianError', () => {
  describe('constructor and basic properties', () => {
    it('should create error with basic meta', () => {
      const meta: GuardianErrorMeta = {
        got: 'string',
        expected: 'number',
        comparison: 'type',
      };
      const error = new GuardianError('Invalid type', meta);

      asserts.assertEquals(error.name, 'GuardianError');
      asserts.assertEquals(error.message, 'Invalid type');
      asserts.assertEquals(error.context, meta);
      asserts.assertInstanceOf(error.timeStamp, Date);
    });

    it('should create error with type meta', () => {
      const meta: GuardianErrorMeta = {
        type: 'string',
        got: 42,
        expected: 'string',
        comparison: 'type',
      };
      const error = new GuardianError('Expected string, got number', meta);

      asserts.assertEquals(error.context.type, 'string');
      asserts.assertEquals(error.context.got, 42);
      asserts.assertEquals(error.context.expected, 'string');
      asserts.assertEquals(error.context.comparison, 'type');
    });

    it('should inherit from Error', () => {
      const meta: GuardianErrorMeta = {
        got: null,
        comparison: 'required',
      };
      const error = new GuardianError('Value is required', meta);

      asserts.assertInstanceOf(error, Error);
      asserts.assertInstanceOf(error, GuardianError);
    });
  });

  describe('cause management', () => {
    it('should start with no causes', () => {
      const meta: GuardianErrorMeta = {
        got: {},
        comparison: 'object',
      };
      const error = new GuardianError('Object validation failed', meta);

      asserts.assertEquals(error.causeSize(), 0);
      asserts.assertEquals(error.listCauses(), {});
    });

    it('should add single cause', () => {
      const parentMeta: GuardianErrorMeta = {
        got: { name: 123 },
        comparison: 'object',
      };
      const parentError = new GuardianError(
        'Object validation failed',
        parentMeta,
      );

      const childMeta: GuardianErrorMeta = {
        got: 123,
        expected: 'string',
        comparison: 'type',
      };
      const childError = new GuardianError(
        'Expected string, got number',
        childMeta,
      );

      parentError.addCause('name', childError);

      asserts.assertEquals(parentError.causeSize(), 1);
      asserts.assertEquals(parentError.listCauses(), {
        'name': 'Expected string, got number',
      });
    });

    it('should add multiple causes', () => {
      const parentMeta: GuardianErrorMeta = {
        got: { name: 123, age: 'invalid' },
        comparison: 'object',
      };
      const parentError = new GuardianError(
        'Object validation failed',
        parentMeta,
      );

      const nameError = new GuardianError('Expected string, got number', {
        got: 123,
        expected: 'string',
        comparison: 'type',
      });

      const ageError = new GuardianError('Expected number, got string', {
        got: 'invalid',
        expected: 'number',
        comparison: 'type',
      });

      parentError.addCause('name', nameError);
      parentError.addCause('age', ageError);

      asserts.assertEquals(parentError.causeSize(), 2);
      asserts.assertEquals(parentError.listCauses(), {
        'name': 'Expected string, got number',
        'age': 'Expected number, got string',
      });
    });

    it('should handle nested causes', () => {
      const rootError = new GuardianError('Root validation failed', {
        got: { user: { profile: { name: 123 } } },
        comparison: 'object',
      });

      const userError = new GuardianError('User validation failed', {
        got: { profile: { name: 123 } },
        comparison: 'object',
      });

      const profileError = new GuardianError('Profile validation failed', {
        got: { name: 123 },
        comparison: 'object',
      });

      const nameError = new GuardianError('Expected string, got number', {
        got: 123,
        expected: 'string',
        comparison: 'type',
      });

      profileError.addCause('name', nameError);
      userError.addCause('profile', profileError);
      rootError.addCause('user', userError);

      asserts.assertEquals(rootError.listCauses(), {
        'user.profile.name': 'Expected string, got number',
      });
    });

    it('should handle circular references', () => {
      const error1 = new GuardianError('Error 1', {
        got: 'value1',
        comparison: 'test',
      });

      const error2 = new GuardianError('Error 2', {
        got: 'value2',
        comparison: 'test',
      });

      // Create circular reference
      error1.addCause('error2', error2);
      error2.addCause('error1', error1);

      const causes = error1.listCauses();
      asserts.assertEquals(causes['error2.error1'], 'Error 1 [circular]');
    });
  });

  describe('JSON serialization', () => {
    it('should serialize basic error to JSON', () => {
      const meta: GuardianErrorMeta = {
        type: 'string',
        got: 42,
        expected: 'string',
        comparison: 'type',
      };
      const error = new GuardianError('Expected string, got number', meta);
      const json = error.toJSON();

      asserts.assertEquals(json.name, 'GuardianError');
      asserts.assertEquals(json.message, 'Expected string, got number');
      asserts.assertEquals(json.context, meta);
      asserts.assertExists(json.timeStamp);
      asserts.assertExists(json.stack);
      asserts.assertEquals(json.causes, undefined);
    });

    it('should serialize error with causes to JSON', () => {
      const parentError = new GuardianError('Parent error', {
        got: { field1: 'invalid', field2: 123 },
        comparison: 'object',
      });

      const child1Error = new GuardianError('Child 1 error', {
        got: 'invalid',
        comparison: 'validation',
      });

      const child2Error = new GuardianError('Child 2 error', {
        got: 123,
        comparison: 'validation',
      });

      parentError.addCause('field1', child1Error);
      parentError.addCause('field2', child2Error);

      const json = parentError.toJSON();

      asserts.assertEquals(json.causes, {
        'field1': 'Child 1 error',
        'field2': 'Child 2 error',
      });
    });

    it('should serialize error without causes as undefined', () => {
      const error = new GuardianError('Simple error', {
        got: 'test',
        comparison: 'validation',
      });

      const json = error.toJSON();
      asserts.assertEquals(json.causes, undefined);
    });

    it('redacts the raw received value from the serialized context', () => {
      // Regression: `toJSON()` (and therefore `JSON.stringify`) must not
      // echo the raw offending value — it can hold secrets / PII.
      const secret = 'hunter2-super-secret';
      const error = new GuardianError('bad', {
        got: secret,
        expected: 'password policy',
        comparison: 'password',
        type: 'string',
      });

      const json = error.toJSON();
      // The value is summarised to type + length, never emitted verbatim.
      asserts.assertEquals(
        json.context.got,
        `[redacted string, length ${secret.length}]`,
      );
      asserts.assertEquals(JSON.stringify(json).includes(secret), false);
      asserts.assertEquals(JSON.stringify(error).includes(secret), false);
      // The developer-authored `expected` label is preserved.
      asserts.assertEquals(json.context.expected, 'password policy');
      // The raw value stays reachable in-memory for programmatic use.
      asserts.assertEquals(error.context.got, secret);
    });

    it('redacts structural containers (object / array) in serialized context', () => {
      const error = new GuardianError('bad', {
        got: { password: 'p@ss', token: 'abc123' },
        comparison: 'object',
      });
      const json = error.toJSON();
      asserts.assertEquals(JSON.stringify(json).includes('p@ss'), false);
      asserts.assertEquals(JSON.stringify(json).includes('abc123'), false);
      asserts.assertEquals(json.context.got, '[redacted object, 2 key(s)]');
    });

    it('does not leak a nested field value through an aggregate error', () => {
      // A composite guardian's aggregate stores child errors whose own
      // `got` may hold a secret; the whole tree must serialize safely.
      const secret = 'nested-secret-value';
      const child = new GuardianError('field bad', {
        got: secret,
        comparison: 'password',
      });
      const parent = new GuardianError('object bad', {
        got: { password: secret },
        comparison: 'object',
      });
      parent.addCause('password', child);
      asserts.assertEquals(JSON.stringify(parent).includes(secret), false);
    });
  });

  describe('value formatting', () => {
    it('should format array values', () => {
      const meta: GuardianErrorMeta = {
        got: [1, 'hello', true],
        expected: 'string',
        comparison: 'type',
      };
      const error = new GuardianError('Expected ${expected}, got ${got}', meta);

      asserts.assertStringIncludes(error.message, '(1, hello, true)');
    });

    it('should format nested array values', () => {
      const meta: GuardianErrorMeta = {
        got: [1, [2, 3], 'hello'],
        expected: 'string',
        comparison: 'type',
      };
      const error = new GuardianError('Expected ${expected}, got ${got}', meta);

      asserts.assertStringIncludes(error.message, '(1, 2,3, hello)');
    });

    it('should format Date values', () => {
      const testDate = new Date('2023-01-01T00:00:00.000Z');
      const meta: GuardianErrorMeta = {
        got: testDate,
        expected: 'string',
        comparison: 'type',
      };
      const error = new GuardianError('Expected ${expected}, got ${got}', meta);

      asserts.assertStringIncludes(error.message, '2023-01-01T00:00:00.000Z');
    });

    it('should format RegExp values', () => {
      const regex = /test/gi;
      const meta: GuardianErrorMeta = {
        got: regex,
        expected: 'string',
        comparison: 'type',
      };
      const error = new GuardianError('Expected ${expected}, got ${got}', meta);

      asserts.assertStringIncludes(error.message, '/test/gi');
    });

    it('should format object values', () => {
      const obj = { name: 'test', age: 30 };
      const meta: GuardianErrorMeta = {
        got: obj,
        expected: 'string',
        comparison: 'type',
      };
      const error = new GuardianError('Expected ${expected}, got ${got}', meta);

      asserts.assertStringIncludes(error.message, '{"name":"test","age":30}');
    });

    it('should format null and undefined values', () => {
      const nullMeta: GuardianErrorMeta = {
        got: null,
        expected: 'string',
        comparison: 'type',
      };
      const nullError = new GuardianError(
        'Expected ${expected}, got ${got}',
        nullMeta,
      );

      const undefinedMeta: GuardianErrorMeta = {
        got: undefined,
        expected: 'string',
        comparison: 'type',
      };
      const undefinedError = new GuardianError(
        'Expected ${expected}, got ${got}',
        undefinedMeta,
      );

      asserts.assertStringIncludes(nullError.message, 'null');
      asserts.assertStringIncludes(undefinedError.message, 'undefined');
    });

    it('should format boolean values', () => {
      const trueMeta: GuardianErrorMeta = {
        got: true,
        expected: 'string',
        comparison: 'type',
      };
      const trueError = new GuardianError(
        'Expected ${expected}, got ${got}',
        trueMeta,
      );

      const falseMeta: GuardianErrorMeta = {
        got: false,
        expected: 'string',
        comparison: 'type',
      };
      const falseError = new GuardianError(
        'Expected ${expected}, got ${got}',
        falseMeta,
      );

      asserts.assertStringIncludes(trueError.message, 'true');
      asserts.assertStringIncludes(falseError.message, 'false');
    });

    it('should format primitive values as strings', () => {
      const numberMeta: GuardianErrorMeta = {
        got: 42,
        expected: 'string',
        comparison: 'type',
      };
      const numberError = new GuardianError(
        'Expected ${expected}, got ${got}',
        numberMeta,
      );

      const stringMeta: GuardianErrorMeta = {
        got: 'hello',
        expected: 'number',
        comparison: 'type',
      };
      const stringError = new GuardianError(
        'Expected ${expected}, got ${got}',
        stringMeta,
      );

      asserts.assertStringIncludes(numberError.message, '42');
      asserts.assertStringIncludes(stringError.message, 'hello');
    });
  });

  describe('message templating', () => {
    it('should support variable replacement in messages', () => {
      const meta: GuardianErrorMeta = {
        type: 'string',
        got: 42,
        expected: 'string',
        comparison: 'type',
      };
      const error = new GuardianError(
        'Expected ${expected}, got ${got} (type: ${type})',
        meta,
      );

      asserts.assertEquals(
        error.message,
        'Expected string, got 42 (type: string)',
      );
    });

    it('should handle missing variables gracefully', () => {
      const meta: GuardianErrorMeta = {
        got: 42,
        comparison: 'type',
      };
      const error = new GuardianError('Expected ${expected}, got ${got}', meta);

      asserts.assertStringIncludes(error.message, 'got 42');
      asserts.assertStringIncludes(error.message, 'Expected undefined');
    });

    it('should include timestamp in message variables', () => {
      const meta: GuardianErrorMeta = {
        got: 'test',
        comparison: 'validation',
      };
      const error = new GuardianError(
        'Error at ${timeStamp}: ${message}',
        meta,
      );

      asserts.assertStringIncludes(error.message, 'Error at');
      asserts.assertStringIncludes(error.message, 'T');
      asserts.assertStringIncludes(error.message, 'Z');
    });

    it('should handle nested variable replacement', () => {
      const meta: GuardianErrorMeta = {
        got: 'test value',
        comparison: 'validation',
      };
      const error = new GuardianError('Validation failed: ${got}', meta);

      // The message should contain the formatted value
      asserts.assertStringIncludes(error.message, 'test value');
    });
  });

  describe('edge cases and error conditions', () => {
    it('should handle empty causes object', () => {
      const meta: GuardianErrorMeta = {
        cause: {},
        got: 'test',
        comparison: 'validation',
      };
      const error = new GuardianError('Test error', meta);

      asserts.assertEquals(error.causeSize(), 0);
      asserts.assertEquals(error.listCauses(), {});
    });

    it('should handle complex nested objects in got/expected', () => {
      const complexObject = {
        nested: {
          array: [1, 2, { deep: 'value' }],
          date: new Date('2023-01-01'),
          regex: /test/g,
        },
      };

      const meta: GuardianErrorMeta = {
        got: complexObject,
        expected: 'simple string',
        comparison: 'type',
      };
      const error = new GuardianError('Expected ${expected}, got ${got}', meta);

      asserts.assertStringIncludes(error.message, 'simple string');
      asserts.assertStringIncludes(error.message, 'nested');
    });

    it('should handle bigint values', () => {
      const meta: GuardianErrorMeta = {
        got: 42n,
        expected: 'number',
        comparison: 'type',
      };
      const error = new GuardianError('Expected ${expected}, got ${got}', meta);

      asserts.assertStringIncludes(error.message, '42');
    });

    it('should handle symbol values', () => {
      const symbol = Symbol('test');
      const meta: GuardianErrorMeta = {
        got: symbol,
        expected: 'string',
        comparison: 'type',
      };
      const error = new GuardianError('Expected ${expected}, got ${got}', meta);

      asserts.assertStringIncludes(error.message, 'Symbol(test)');
    });

    it('should handle function values', () => {
      const func = () => 'test';
      const meta: GuardianErrorMeta = {
        got: func,
        expected: 'string',
        comparison: 'type',
      };
      const error = new GuardianError('Expected ${expected}, got ${got}', meta);

      // Functions should be converted to string representation
      asserts.assertStringIncludes(error.message, '=>');
    });
  });

  describe('inheritance and compatibility', () => {
    it('should be instanceof Error and GuardianError', () => {
      const meta: GuardianErrorMeta = {
        got: 'test',
        comparison: 'validation',
      };
      const error = new GuardianError('Test error', meta);

      asserts.assertInstanceOf(error, Error);
      asserts.assertInstanceOf(error, GuardianError);
    });

    it('should have correct error name', () => {
      const meta: GuardianErrorMeta = {
        got: 'test',
        comparison: 'validation',
      };
      const error = new GuardianError('Test error', meta);

      asserts.assertEquals(error.name, 'GuardianError');
    });

    it('should have stack trace', () => {
      const meta: GuardianErrorMeta = {
        got: 'test',
        comparison: 'validation',
      };
      const error = new GuardianError('Test error', meta);

      asserts.assertExists(error.stack);
      asserts.assertStringIncludes(error.stack, 'GuardianError');
    });
  });

  describe('path support', () => {
    it('path is empty by default', () => {
      const err = new GuardianError('test', { got: 1, comparison: 'type' });
      asserts.assertEquals(err.path, []);
    });

    it('prependPath builds path in correct order (outermost first)', () => {
      const err = new GuardianError('inner', { got: 1, comparison: 'type' });
      err.prependPath('zipCode');
      err.prependPath('address');
      err.prependPath('user');
      asserts.assertEquals(err.path, ['user', 'address', 'zipCode']);
    });

    it('mixes string and numeric segments', () => {
      const err = new GuardianError('inner', { got: 1, comparison: 'type' });
      err.prependPath(2);
      err.prependPath('items');
      asserts.assertEquals(err.path, ['items', 2]);
    });

    it('prependPath recurses into nested causes', () => {
      const leaf = new GuardianError('leaf', { got: 1, comparison: 'type' });
      const mid = new GuardianError('mid', { got: 1, comparison: 'type' });
      mid.addCause('field', leaf);
      const root = new GuardianError('root', { got: 1, comparison: 'type' });
      root.addCause('inner', mid);

      // Prepending on the root must update every descendant.
      root.prependPath('outer');
      asserts.assertEquals(root.path, ['outer']);
      asserts.assertEquals(mid.path, ['outer']);
      asserts.assertEquals(leaf.path, ['outer']);
    });

    it('prependPath handles cycles without infinite recursion', () => {
      const a = new GuardianError('a', { got: 1, comparison: 'type' });
      const b = new GuardianError('b', { got: 1, comparison: 'type' });
      a.addCause('b', b);
      b.addCause('a', a); // cycle

      // Should not stack-overflow.
      a.prependPath('root');
      asserts.assertEquals(a.path, ['root']);
      asserts.assertEquals(b.path, ['root']);
    });

    it('leafErrors yields paths for every leaf', () => {
      const leafA = new GuardianError('A', {
        got: 1,
        comparison: 'type',
        path: ['a'],
      });
      const leafB = new GuardianError('B', {
        got: 1,
        comparison: 'type',
        path: ['b'],
      });
      const root = new GuardianError('root', { got: 1, comparison: 'type' });
      root.addCause('a', leafA);
      root.addCause('b', leafB);

      const leaves = [...root.leafErrors()];
      asserts.assertEquals(leaves.length, 2);
      const paths = leaves.map((l) => l.path);
      asserts.assertEquals(paths, [['a'], ['b']]);
    });

    it('leafErrors returns self when there are no causes', () => {
      const lone = new GuardianError(
        'lone',
        { got: 1, comparison: 'type', path: ['x'] },
      );
      const leaves = [...lone.leafErrors()];
      asserts.assertEquals(leaves.length, 1);
      asserts.assertEquals(leaves[0]!.path, ['x']);
      asserts.assertStrictEquals(leaves[0]!.error, lone);
    });

    it('refinement errors no longer carry a self-referential cause (regression)', async () => {
      // Regression: previously `_createRefinementError` did
      // `error.addCause(path, error)` — the error pointed at itself in
      // its own cause map, producing a cycle that `listCauses` had to
      // tip-toe around via visited-set bookkeeping. The path is now
      // surfaced via the structured `path` field instead, so a fresh
      // refinement error has zero causes and a clean `path` array.
      const { Guardian } = await import('../mod.ts');
      const schema = Guardian.object({
        password: Guardian.string(),
        confirmPassword: Guardian.string(),
      }).refine(
        (data) => data.password === data.confirmPassword,
        'passwords must match',
        'confirmPassword',
      );
      const [err] = schema.safeParse({
        password: 'x',
        confirmPassword: 'y',
      });
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(err.path, ['confirmPassword']);
      // Cause graph contains nothing self-referential.
      const causes = err.context.cause ?? {};
      for (const [, child] of Object.entries(causes)) {
        asserts.assertNotStrictEquals(child, err);
      }
    });
  });
});
