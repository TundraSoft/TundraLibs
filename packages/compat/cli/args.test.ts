/**
 * @fileoverview Tests for args() and argv().
 */

import { describe, it } from '../test.ts';
import { args, argv } from './args.ts';
import * as asserts from '@std/asserts';

describe({
  name: 'compat.cli.args',
  fn: () => {
    describe('args()', () => {
      it('should return an array', () => {
        const result = args();
        asserts.assert(Array.isArray(result), 'args() must return array');
      });

      it('should return a fresh array (not aliased)', () => {
        const a = args();
        a.push('__synthetic__');
        const b = args();
        asserts.assertFalse(
          b.includes('__synthetic__'),
          'args() should return a fresh array each call',
        );
      });

      it('should return only string entries', () => {
        for (const tok of args()) {
          asserts.assertEquals(typeof tok, 'string');
        }
      });
    });

    describe('argv()', () => {
      it('should return { _: [] } for empty input', () => {
        const result = argv([]);
        asserts.assertEquals(result, { _: [] });
      });

      it('should collect positional args into _', () => {
        const result = argv(['foo', 'bar', 'baz']);
        asserts.assertEquals(result, { _: ['foo', 'bar', 'baz'] });
      });

      it('should parse --name=value', () => {
        const result = argv(['--name=value']);
        asserts.assertEquals(result, { _: [], name: 'value' });
      });

      it('should parse --name value', () => {
        const result = argv(['--name', 'value']);
        asserts.assertEquals(result, { _: [], name: 'value' });
      });

      it('should parse --flag as boolean true', () => {
        const result = argv(['--flag']);
        asserts.assertEquals(result, { _: [], flag: true });
      });

      it('should parse short -x as boolean true', () => {
        const result = argv(['-x']);
        asserts.assertEquals(result, { _: [], x: true });
      });

      it('should parse short -x value', () => {
        const result = argv(['-x', 'foo']);
        asserts.assertEquals(result, { _: [], x: 'foo' });
      });

      it('should treat consecutive flags as separate booleans', () => {
        const result = argv(['--a', '--b']);
        asserts.assertEquals(result, { _: [], a: true, b: true });
      });

      it('should coerce integer values', () => {
        const result = argv(['--port=8080']);
        asserts.assertEquals(result, { _: [], port: 8080 });
      });

      it('should coerce decimal values', () => {
        const result = argv(['--ratio=0.5']);
        asserts.assertEquals(result, { _: [], ratio: 0.5 });
      });

      it('should coerce negative integers via =', () => {
        const result = argv(['--n=-5']);
        asserts.assertEquals(result, { _: [], n: -5 });
      });

      it('should not coerce alphanumeric values', () => {
        const result = argv(['--id=abc123']);
        asserts.assertEquals(result, { _: [], id: 'abc123' });
      });

      it('should not coerce mixed-content values', () => {
        const result = argv(['--size=5px']);
        asserts.assertEquals(result, { _: [], size: '5px' });
      });

      it('should collect a repeated flag into an array', () => {
        const result = argv(['--inc', 'a', '--inc', 'b']);
        asserts.assertEquals(result, { _: [], inc: ['a', 'b'] });
      });

      it('should collect three repetitions in order', () => {
        const result = argv(['--inc=a', '--inc=b', '--inc=c']);
        asserts.assertEquals(result, { _: [], inc: ['a', 'b', 'c'] });
      });

      it('should mix repeated flag with coercion per-occurrence', () => {
        const result = argv(['--port=80', '--port=8080']);
        asserts.assertEquals(result, { _: [], port: [80, 8080] });
      });

      it('should treat bare `--` as positional', () => {
        const result = argv(['--', 'rest']);
        asserts.assertEquals(result, { _: ['--', 'rest'] });
      });

      it('should mix flags and positionals', () => {
        const result = argv([
          '--name',
          'foo',
          'pos1',
          '--port=8080',
          'pos2',
          '--flag',
        ]);
        asserts.assertEquals(result, {
          _: ['pos1', 'pos2'],
          name: 'foo',
          port: 8080,
          flag: true,
        });
      });

      it('should handle --name followed by another flag (not a value)', () => {
        const result = argv(['--a', '--b', 'value']);
        asserts.assertEquals(result, { _: [], a: true, b: 'value' });
      });

      it('should preserve empty string after =', () => {
        const result = argv(['--name=']);
        asserts.assertEquals(result, { _: [], name: '' });
      });

      it('should default to args() when input omitted', () => {
        const result = argv();
        asserts.assert(Array.isArray(result._), 'argv()._ must be an array');
      });
    });
  },
});
