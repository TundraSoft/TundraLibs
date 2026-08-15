import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { templatize } from './templatize.ts';

describe('utils.templatize', () => {
  it('should replace placeholders with values', () => {
    const template = 'Hello, ${name}!';
    const result = templatize(template);
    asserts.assertEquals(result({ name: 'sdf' }), 'Hello, sdf!');
  });

  it('parse multiple placeholders', () => {
    const template =
      'Hello, ${name}! Today is ${day}. It would be nice to see you, ${name}!';
    const result = templatize(template);
    asserts.assertEquals(
      result({ name: 'Alice', day: 'Monday' }),
      'Hello, Alice! Today is Monday. It would be nice to see you, Alice!',
    );
  });

  it(
    'should ignore any parameters passed if no placeholders are present',
    () => {
      const template = 'Hello, world!';
      const result = templatize(template);
      asserts.assertEquals(result({ name: 'sdf' }), 'Hello, world!');
    },
  );

  it('should replace missing values with an empty string', () => {
    const template = 'Hello, ${name}!';
    const result = templatize(template);
    asserts.assertEquals(result(JSON.parse(JSON.stringify({}))), 'Hello, !'); //NOSONAR
  });

  it('should handle adjacent placeholders', () => {
    const template = 'Value: ${prefix}${suffix}';
    const result = templatize(template);
    asserts.assertEquals(
      result({ prefix: 'pre', suffix: 'fix' }),
      'Value: prefix',
    );
  });

  it('should handle special characters in placeholder names', () => {
    const template = 'Special: ${special-name} and ${special_name}';
    const result = templatize(template);
    asserts.assertEquals(
      result({ 'special-name': 'hyphen', 'special_name': 'underscore' }),
      'Special: hyphen and underscore',
    );
  });

  it('should handle placeholders at the beginning and end', () => {
    const template = '${start}Middle${end}';
    const result = templatize(template);
    asserts.assertEquals(
      result({ start: 'Beginning-', end: '-End' }),
      'Beginning-Middle-End',
    );
  });

  it('should correctly handle empty string values', () => {
    const template = 'Hello, ${name}!';
    const result = templatize(template);
    asserts.assertEquals(result({ name: '' }), 'Hello, !');
  });

  it(
    'should handle complex nested structures in template names',
    () => {
      const template = 'User: ${user.name}, Age: ${user.details.age}';
      const result = templatize(template);
      asserts.assertEquals(
        result({ 'user.name': 'John', 'user.details.age': '30' }),
        'User: John, Age: 30',
      );
    },
  );

  // Additional comprehensive tests for edge cases and advanced functionality
  it('should handle templates with no variables efficiently', () => {
    const template = 'This is a static template with no variables.';
    const parser = templatize(template);

    // Should work with empty object
    asserts.assertEquals(
      parser({}),
      'This is a static template with no variables.',
    );

    // Should ignore any passed values
    asserts.assertEquals(
      parser({ ignored: 'value' }),
      'This is a static template with no variables.',
    );
  });

  it('should handle duplicate variables correctly', () => {
    const template = '${greeting} ${name}! Hope you have a great day, ${name}!';
    const parser = templatize(template);

    asserts.assertEquals(
      parser({ greeting: 'Hello', name: 'Alice' }),
      'Hello Alice! Hope you have a great day, Alice!',
    );
  });

  it('should handle variables with numbers and underscores', () => {
    const template = 'Item ${item_1} and ${item2} with ${special_item_3}';
    const parser = templatize(template);

    asserts.assertEquals(
      parser({
        item_1: 'first',
        item2: 'second',
        special_item_3: 'third',
      }),
      'Item first and second with third',
    );
  });

  it('should handle very long variable names', () => {
    const longVarName = 'very_long_variable_name_that_might_cause_issues';
    const template = `Value: \${${longVarName}}`;
    const parser = templatize(template);

    asserts.assertEquals(
      parser({ [longVarName]: 'success' }),
      'Value: success',
    );
  });

  it('should handle templates with only variables', () => {
    const template = '${var1}${var2}${var3}';
    const parser = templatize(template);

    asserts.assertEquals(
      parser({ var1: 'A', var2: 'B', var3: 'C' }),
      'ABC',
    );
  });

  it('should handle single character variables', () => {
    const template = 'Coordinates: (${x}, ${y})';
    const parser = templatize(template);

    asserts.assertEquals(
      parser({ x: '10', y: '20' }),
      'Coordinates: (10, 20)',
    );
  });

  it('should handle templates with braces in content', () => {
    const template = 'Object: { name: ${name}, value: ${value} }';
    const parser = templatize(template);

    asserts.assertEquals(
      parser({ name: 'test', value: '42' }),
      'Object: { name: test, value: 42 }',
    );
  });

  it('should handle whitespace around variables', () => {
    const template = 'Value: ${ spaced } and ${normal}';
    const parser = templatize(template);

    asserts.assertEquals(
      parser({ ' spaced ': 'with-spaces', normal: 'regular' }),
      'Value: with-spaces and regular',
    );
  });

  it('should handle numeric string values', () => {
    const template = 'Count: ${count}, Price: $${price}';
    const parser = templatize(template);

    asserts.assertEquals(
      parser({ count: '42', price: '19.99' }),
      'Count: 42, Price: $19.99',
    );
  });

  it('should handle boolean-like string values', () => {
    const template = 'Active: ${active}, Verified: ${verified}';
    const parser = templatize(template);

    asserts.assertEquals(
      parser({ active: 'true', verified: 'false' }),
      'Active: true, Verified: false',
    );
  });

  // ---------------------------------------------------------------------
  // New behaviour introduced by the templatize-vs-variableReplacer
  // consolidation. The compile + render is now the single template
  // engine; previously the engine was split between this and
  // `variableReplacer` (which still exists as a one-shot wrapper).
  // ---------------------------------------------------------------------

  describe('onMissing option', () => {
    it('default behaviour replaces missing keys with empty string', () => {
      const parser = templatize('a${x}b');
      asserts.assertEquals(parser({}), 'ab');
    });

    it('onMissing: "empty" matches the default', () => {
      const parser = templatize('a${x}b', { onMissing: 'empty' });
      asserts.assertEquals(parser({}), 'ab');
    });

    it('onMissing: "literal" keeps the `${var}` placeholder', () => {
      const parser = templatize('a${x}b', { onMissing: 'literal' });
      asserts.assertEquals(parser({}), 'a${x}b');
    });

    // `TemplateValues<T>` marks every key optional precisely because
    // `onMissing` is the documented escape hatch for absent values.
    // These render calls must therefore type-check with no cast — a
    // regression to required keys breaks compilation here, not just
    // the assertion.
    it('omitting a key type-checks and renders per onMissing', () => {
      const template = '[${time}] ${level}: ${msg}';

      const empty = templatize(template, { onMissing: 'empty' });
      asserts.assertEquals(
        empty({ time: '12:00:01', msg: 'hi' }),
        '[12:00:01] : hi',
      );

      const literal = templatize(template, { onMissing: 'literal' });
      asserts.assertEquals(
        literal({ time: '12:00:01', msg: 'hi' }),
        '[12:00:01] ${level}: hi',
      );

      // Every key omitted at once, still no cast needed.
      asserts.assertEquals(empty({}), '[] : ');
      asserts.assertEquals(
        literal({}),
        '[${time}] ${level}: ${msg}',
      );
    });

    it('explicit `undefined` is treated the same as an omitted key', () => {
      const parser = templatize('a${x}b', { onMissing: 'literal' });
      asserts.assertEquals(parser({ x: undefined }), 'a${x}b');
    });

    it('onMissing affects null/undefined differently — `null` becomes "null", undefined hits the missing path', () => {
      const empty = templatize('${a}/${b}', { onMissing: 'empty' });
      const literal = templatize('${a}/${b}', { onMissing: 'literal' });
      asserts.assertEquals(
        // deno-lint-ignore no-explicit-any
        empty({ a: null, b: undefined } as any),
        'null/',
      );
      asserts.assertEquals(
        // deno-lint-ignore no-explicit-any
        literal({ a: null, b: undefined } as any),
        'null/${b}',
      );
    });
  });

  describe('nested values — both flat and dot-path forms work', () => {
    it('accepts flat-key form (back-compat)', () => {
      const parser = templatize('User: ${user.name}');
      asserts.assertEquals(
        parser({ 'user.name': 'Alice' }),
        'User: Alice',
      );
    });

    it('also walks nested objects via dot path', () => {
      const parser = templatize('User: ${user.name}');
      asserts.assertEquals(
        // deno-lint-ignore no-explicit-any
        parser({ user: { name: 'Bob' } } as any),
        'User: Bob',
      );
    });

    it('flat key wins over nested when both are present', () => {
      const parser = templatize('${user.name}');
      asserts.assertEquals(
        // deno-lint-ignore no-explicit-any
        parser({ 'user.name': 'flat', user: { name: 'nested' } } as any),
        'flat',
      );
    });

    it('deep dot-path walking', () => {
      const parser = templatize('${a.b.c.d}');
      asserts.assertEquals(
        // deno-lint-ignore no-explicit-any
        parser({ a: { b: { c: { d: 'deep' } } } } as any),
        'deep',
      );
    });

    it('missing intermediate path part hits onMissing', () => {
      const parser = templatize('${a.b.c}', { onMissing: 'literal' });
      // deno-lint-ignore no-explicit-any
      asserts.assertEquals(parser({ a: {} } as any), '${a.b.c}');
    });
  });

  describe('value-type stringification', () => {
    it('arrays render as `(a, b, c)`', () => {
      const parser = templatize('Items: ${items}');
      // deno-lint-ignore no-explicit-any
      asserts.assertEquals(
        parser({ items: [1, 2, 3] } as any),
        'Items: (1, 2, 3)',
      );
    });

    it('null renders as the literal string "null"', () => {
      const parser = templatize('${x}');
      // deno-lint-ignore no-explicit-any
      asserts.assertEquals(parser({ x: null } as any), 'null');
    });

    it('Date instances render as ISO 8601 strings', () => {
      const parser = templatize('${d}', { onMissing: 'literal' });
      const d = new Date('2026-05-12T10:00:00.000Z');
      // deno-lint-ignore no-explicit-any
      asserts.assertEquals(parser({ d } as any), '2026-05-12T10:00:00.000Z');
    });

    it('RegExp instances render via toString()', () => {
      const parser = templatize('${r}');
      // deno-lint-ignore no-explicit-any
      asserts.assertEquals(parser({ r: /test/gi } as any), '/test/gi');
    });

    it('functions render via toString() (source form)', () => {
      const parser = templatize('${fn}');
      // deno-lint-ignore no-explicit-any
      const out = parser({ fn: () => 'noop' } as any);
      asserts.assert(
        out.includes('=>') || out.includes('function'),
        `expected function source, got: ${out}`,
      );
    });

    it('plain objects render via JSON.stringify', () => {
      const parser = templatize('${o}');
      // deno-lint-ignore no-explicit-any
      asserts.assertEquals(
        parser({ o: { a: 1, b: 'x' } } as any),
        '{"a":1,"b":"x"}',
      );
    });

    it('numbers and booleans coerce via String()', () => {
      const parser = templatize('${n}/${b}');
      // deno-lint-ignore no-explicit-any
      asserts.assertEquals(parser({ n: 42, b: true } as any), '42/true');
    });
  });

  describe('compile-time optimizations', () => {
    it('all-literal templates collapse to a constant function (no values needed)', () => {
      const parser = templatize('hello world');
      // deno-lint-ignore no-explicit-any
      asserts.assertEquals(parser(null as any), 'hello world');
      // deno-lint-ignore no-explicit-any
      asserts.assertEquals(parser(undefined as any), 'hello world');
      // deno-lint-ignore no-explicit-any
      asserts.assertEquals(parser({} as any), 'hello world');
    });

    it('single-token templates work without surrounding literals', () => {
      const parser = templatize('${name}');
      asserts.assertEquals(parser({ name: 'solo' }), 'solo');
    });

    it('unterminated `${` is preserved as a literal', () => {
      // No closing brace → treat the rest as literal text.
      const parser = templatize('hi ${name');
      // deno-lint-ignore no-explicit-any
      asserts.assertEquals(parser({} as any), 'hi ${name');
    });
  });

  describe('prototype-chain hardening — lookups stay on own data', () => {
    it('does not resolve inherited members (constructor/toString)', () => {
      const parser = templatize('${constructor}/${toString}', {
        onMissing: 'literal',
      });
      // deno-lint-ignore no-explicit-any
      asserts.assertEquals(parser({} as any), '${constructor}/${toString}');
    });

    it('rejects `__proto__` traversal (no prototype-pollution read)', () => {
      // Pollute Object.prototype, then confirm the template can't read it.
      // deno-lint-ignore no-explicit-any
      (Object.prototype as any).polluted = 'leaked';
      try {
        const parser = templatize('${__proto__.polluted}', {
          onMissing: 'literal',
        });
        // deno-lint-ignore no-explicit-any
        asserts.assertEquals(parser({} as any), '${__proto__.polluted}');
      } finally {
        // deno-lint-ignore no-explicit-any
        delete (Object.prototype as any).polluted;
      }
    });

    it('rejects `constructor` as an intermediate dot-path segment', () => {
      const parser = templatize('${user.constructor.name}', {
        onMissing: 'literal',
      });
      asserts.assertEquals(
        // deno-lint-ignore no-explicit-any
        parser({ user: { name: 'Ada' } } as any),
        '${user.constructor.name}',
      );
    });

    it('still resolves a legitimately-named own "constructor" data key', () => {
      // An own data property literally named `constructor` is the
      // developer's own data, not the inherited prototype member, so the
      // top-level flat-key lookup (Object.hasOwn) still resolves it. The
      // FORBIDDEN_KEYS guard only blocks it as a *dot-path* segment.
      const parser = templatize('${constructor}', { onMissing: 'literal' });
      asserts.assertEquals(
        // deno-lint-ignore no-explicit-any
        parser({ constructor: 'mine' } as any),
        'mine',
      );
    });
  });
});
