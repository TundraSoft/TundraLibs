/**
 * @fileoverview Tests for prompt() and choose().
 *
 * The interactive paths (raw-mode reads, readline integration) are
 * tested manually. This file covers the pure-logic helper exposed for
 * direct verification (`_validateChoice`) plus structural shape
 * assertions on the public API.
 */

import { describe, it } from '../test.ts';
import { _validateChoice, choose, prompt } from './prompt.ts';
import * as asserts from '@std/asserts';

describe({
  name: 'compat.cli.prompt',
  fn: () => {
    describe('_validateChoice()', () => {
      it('should return null for empty input without default', () => {
        asserts.assertStrictEquals(_validateChoice('', 3), null);
      });

      it('should return default+1 for empty input with default', () => {
        asserts.assertStrictEquals(_validateChoice('', 3, 0), 1);
        asserts.assertStrictEquals(_validateChoice('', 3, 1), 2);
        asserts.assertStrictEquals(_validateChoice('', 3, 2), 3);
      });

      it('should return parsed integer when in range', () => {
        asserts.assertStrictEquals(_validateChoice('1', 3), 1);
        asserts.assertStrictEquals(_validateChoice('2', 3), 2);
        asserts.assertStrictEquals(_validateChoice('3', 3), 3);
      });

      it('should trim whitespace before parsing', () => {
        asserts.assertStrictEquals(_validateChoice('  2  ', 3), 2);
        asserts.assertStrictEquals(_validateChoice('\t2\n', 3), 2);
      });

      it('should treat whitespace-only as empty (use default)', () => {
        asserts.assertStrictEquals(_validateChoice('   ', 3), null);
        asserts.assertStrictEquals(_validateChoice('   ', 3, 1), 2);
      });

      it('should return null for non-integer input', () => {
        asserts.assertStrictEquals(_validateChoice('abc', 3), null);
        asserts.assertStrictEquals(_validateChoice('1.5', 3), null);
        asserts.assertStrictEquals(_validateChoice('1a', 3), null);
        asserts.assertStrictEquals(_validateChoice('NaN', 3), null);
      });

      it('should return null for out-of-range integers', () => {
        asserts.assertStrictEquals(_validateChoice('0', 3), null);
        asserts.assertStrictEquals(_validateChoice('4', 3), null);
        asserts.assertStrictEquals(_validateChoice('-1', 3), null);
        asserts.assertStrictEquals(_validateChoice('100', 3), null);
      });
    });

    describe('choose()', () => {
      it('should reject empty choices array', async () => {
        await asserts.assertRejects(
          () => choose('Pick one', []),
          RangeError,
          'at least one choice',
        );
      });
    });

    describe('prompt()', () => {
      it('should be a function', () => {
        asserts.assertStrictEquals(typeof prompt, 'function');
      });
    });
  },
});
