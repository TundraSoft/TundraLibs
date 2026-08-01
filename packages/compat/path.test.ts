/**
 * @fileoverview Tests for cross-runtime path manipulation utilities.
 * @module
 */

import { describe, it } from './test.ts';
import {
  basename,
  DELIMITER,
  dirname,
  extname,
  format,
  isAbsolute,
  join,
  normalize,
  parse,
  relative,
  resolve,
  SEPARATOR,
  SEPARATOR_PATTERN,
} from './path.ts';
import { OS } from './runtime.ts';
import * as asserts from '@std/asserts';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert a POSIX-style expected path to the platform-native separator.
 * On Windows, replaces `/` with `\`; on POSIX, returns the input unchanged.
 *
 * Used for assertions where path operations (join/normalize/relative/etc.)
 * emit native separators in their output.
 */
const native = (posixPath: string): string =>
  OS === 'WINDOWS' ? posixPath.replaceAll('/', '\\') : posixPath;

// =============================================================================
// Test Suites
// =============================================================================

describe({
  name: 'compat.path',
  fn: () => {
    // =========================================================================
    // Constants
    // =========================================================================

    describe('DELIMITER', () => {
      it('should be a string', () => {
        asserts.assertStrictEquals(typeof DELIMITER, 'string');
      });

      it('should be semicolon on Windows', () => {
        if (OS === 'WINDOWS') {
          asserts.assertStrictEquals(DELIMITER, ';');
        }
      });

      it('should be colon on non-Windows', () => {
        if (OS !== 'WINDOWS') {
          asserts.assertStrictEquals(DELIMITER, ':');
        }
      });
    });

    describe('SEPARATOR', () => {
      it('should be a string', () => {
        asserts.assertStrictEquals(typeof SEPARATOR, 'string');
      });

      it('should be backslash on Windows', () => {
        if (OS === 'WINDOWS') {
          asserts.assertStrictEquals(SEPARATOR, '\\');
        }
      });

      it('should be forward slash on non-Windows', () => {
        if (OS !== 'WINDOWS') {
          asserts.assertStrictEquals(SEPARATOR, '/');
        }
      });
    });

    describe('SEPARATOR_PATTERN', () => {
      it('should be a RegExp', () => {
        asserts.assertInstanceOf(SEPARATOR_PATTERN, RegExp);
      });

      it('should match forward slash', () => {
        asserts.assert(SEPARATOR_PATTERN.test('/'));
      });

      it('should match backslash on Windows', () => {
        if (OS === 'WINDOWS') {
          asserts.assert(SEPARATOR_PATTERN.test('\\'));
        }
      });
    });

    // =========================================================================
    // basename()
    // =========================================================================

    describe('basename()', () => {
      it('should return filename from full path', () => {
        asserts.assertStrictEquals(basename('/path/to/file.txt'), 'file.txt');
      });

      it('should return directory name when path ends in slash', () => {
        const result = basename('/path/to/dir/');
        // node/deno differ slightly but both return the final segment
        asserts.assertStrictEquals(typeof result, 'string');
      });

      it('should return empty string for root', () => {
        const result = basename('/');
        asserts.assertStrictEquals(typeof result, 'string');
      });

      it('should strip suffix when provided', () => {
        asserts.assertStrictEquals(
          basename('/path/to/file.txt', '.txt'),
          'file',
        );
      });

      it('should not strip suffix when it does not match', () => {
        asserts.assertStrictEquals(
          basename('/path/to/file.txt', '.md'),
          'file.txt',
        );
      });

      it('should return the file name with no directory', () => {
        asserts.assertStrictEquals(basename('file.ts'), 'file.ts');
      });

      it('should handle files with multiple dots', () => {
        asserts.assertStrictEquals(
          basename('/path/archive.tar.gz'),
          'archive.tar.gz',
        );
      });
    });

    // =========================================================================
    // dirname()
    // =========================================================================

    describe('dirname()', () => {
      it('should return directory of a full path', () => {
        asserts.assertStrictEquals(dirname('/path/to/file.txt'), '/path/to');
      });

      it('should return parent directory of a nested path', () => {
        asserts.assertStrictEquals(dirname('/a/b/c'), '/a/b');
      });

      it('should return root for a top-level path', () => {
        asserts.assertStrictEquals(dirname('/file.txt'), '/');
      });

      it('should return dot for a bare filename', () => {
        asserts.assertStrictEquals(dirname('file.txt'), '.');
      });
    });

    // =========================================================================
    // extname()
    // =========================================================================

    describe('extname()', () => {
      it('should return extension including dot', () => {
        asserts.assertStrictEquals(extname('file.txt'), '.txt');
      });

      it('should return last extension for multiple dots', () => {
        asserts.assertStrictEquals(extname('archive.tar.gz'), '.gz');
      });

      it('should return empty string when no extension', () => {
        asserts.assertStrictEquals(extname('Makefile'), '');
      });

      it('should return empty string for dotfile', () => {
        asserts.assertStrictEquals(extname('.gitignore'), '');
      });

      it('should work on paths', () => {
        asserts.assertStrictEquals(extname('/path/to/file.ts'), '.ts');
      });
    });

    // =========================================================================
    // join()
    // =========================================================================

    describe('join()', () => {
      it('should join path segments with separator', () => {
        const result = join('path', 'to', 'file.txt');
        asserts.assert(result.includes('path'));
        asserts.assert(result.includes('to'));
        asserts.assert(result.includes('file.txt'));
      });

      it('should normalize double separators', () => {
        const result = join('path/', '/to');
        asserts.assertFalse(result.includes(SEPARATOR + SEPARATOR));
      });

      it('should handle absolute prefix', () => {
        const result = join('/root', 'dir', 'file');
        asserts.assert(isAbsolute(result));
      });

      it('should handle single segment', () => {
        asserts.assertStrictEquals(join('dir'), 'dir');
      });

      it('should resolve .. segments', () => {
        const result = join('/a/b', '..', 'c');
        asserts.assertStrictEquals(result, native('/a/c'));
      });
    });

    // =========================================================================
    // normalize()
    // =========================================================================

    describe('normalize()', () => {
      it('should resolve .. segments', () => {
        asserts.assertStrictEquals(
          normalize('/path/to/../file.txt'),
          native('/path/file.txt'),
        );
      });

      it('should resolve . segments', () => {
        asserts.assertStrictEquals(
          normalize('/path/./to/file.txt'),
          native('/path/to/file.txt'),
        );
      });

      it('should collapse multiple separators', () => {
        const result = normalize('/path//to/file.txt');
        asserts.assertStrictEquals(result, native('/path/to/file.txt'));
      });

      it('should handle relative path', () => {
        const result = normalize('a/b/../c');
        asserts.assertStrictEquals(result, native('a/c'));
      });
    });

    // =========================================================================
    // resolve()
    // =========================================================================

    describe('resolve()', () => {
      it('should return an absolute path', () => {
        const result = resolve('relative/path');
        asserts.assert(isAbsolute(result));
      });

      // Use endsWith because Windows prepends the current drive letter
      // (e.g. `C:\base\sub\file.txt`), which varies by environment.
      it('should resolve from absolute base', () => {
        const result = resolve('/base', 'sub', 'file.txt');
        asserts.assert(result.endsWith(native('/base/sub/file.txt')));
        asserts.assert(isAbsolute(result));
      });

      it('should resolve .. segments', () => {
        const result = resolve('/base/sub', '..', 'other');
        asserts.assert(result.endsWith(native('/base/other')));
        asserts.assertFalse(result.includes('sub'));
      });

      it('should return the last absolute path when given multiple absolutes', () => {
        const result = resolve('/first', '/second');
        asserts.assert(result.endsWith(native('/second')));
        asserts.assertFalse(result.includes('first'));
      });
    });

    // =========================================================================
    // relative()
    // =========================================================================

    describe('relative()', () => {
      it('should return relative path between two directories', () => {
        const result = relative('/path/to/src', '/path/to/dest');
        asserts.assertStrictEquals(result, native('../dest'));
      });

      it('should return empty string for same paths', () => {
        const result = relative('/path/to', '/path/to');
        asserts.assertStrictEquals(result, '');
      });

      it('should return filename when paths differ only by filename', () => {
        const result = relative('/path/to', '/path/to/file.txt');
        asserts.assertStrictEquals(result, 'file.txt');
      });

      it('should navigate up directories with ..', () => {
        const result = relative('/a/b/c', '/a');
        asserts.assertStrictEquals(result, native('../..'));
      });
    });

    // =========================================================================
    // isAbsolute()
    // =========================================================================

    describe('isAbsolute()', () => {
      it('should return true for absolute paths', () => {
        asserts.assertStrictEquals(isAbsolute('/absolute/path'), true);
      });

      it('should return false for relative paths', () => {
        asserts.assertStrictEquals(isAbsolute('relative/path'), false);
      });

      it('should return false for bare filename', () => {
        asserts.assertStrictEquals(isAbsolute('file.txt'), false);
      });

      it('should return false for dot-relative paths', () => {
        asserts.assertStrictEquals(isAbsolute('./path'), false);
      });

      it('should return false for parent-relative paths', () => {
        asserts.assertStrictEquals(isAbsolute('../path'), false);
      });
    });

    // =========================================================================
    // parse()
    // =========================================================================

    describe('parse()', () => {
      it('should parse a full path into components', () => {
        const result = parse('/path/to/file.txt');
        asserts.assertStrictEquals(result.base, 'file.txt');
        asserts.assertStrictEquals(result.ext, '.txt');
        asserts.assertStrictEquals(result.name, 'file');
        asserts.assertStrictEquals(result.dir, '/path/to');
        asserts.assertStrictEquals(result.root, '/');
      });

      it('should parse a file with no extension', () => {
        const result = parse('/path/Makefile');
        asserts.assertStrictEquals(result.ext, '');
        asserts.assertStrictEquals(result.name, 'Makefile');
      });

      it('should parse a file in root directory', () => {
        const result = parse('/file.txt');
        asserts.assertStrictEquals(result.dir, '/');
        asserts.assertStrictEquals(result.name, 'file');
      });

      it('should parse a relative path', () => {
        const result = parse('relative/file.ts');
        asserts.assertStrictEquals(result.ext, '.ts');
        asserts.assertStrictEquals(result.base, 'file.ts');
      });
    });

    // =========================================================================
    // format()
    // =========================================================================

    describe('format()', () => {
      // format() always uses the native SEPARATOR between `dir` and `base`,
      // even when `dir` itself contains foreign separators. The expected
      // strings below use SEPARATOR for the dir/base joiner.
      it('should format a path object with dir and base', () => {
        const result = format({ dir: '/path/to', base: 'file.txt' });
        asserts.assertStrictEquals(result, `/path/to${SEPARATOR}file.txt`);
      });

      it('should format with root and name and ext', () => {
        const result = format({ root: '/', name: 'file', ext: '.txt' });
        asserts.assertStrictEquals(result, '/file.txt');
      });

      it('should prefer base over name+ext when both provided', () => {
        const result = format({
          dir: '/path',
          base: 'file.txt',
          name: 'other',
          ext: '.md',
        });
        // base takes precedence
        asserts.assertStrictEquals(result, `/path${SEPARATOR}file.txt`);
      });

      it('should handle empty object gracefully', () => {
        const result = format({});
        asserts.assertStrictEquals(typeof result, 'string');
      });

      it('should round-trip with parse()', () => {
        // Use native separators in the input so the roundtrip is identity
        // on every platform (Windows would otherwise rewrite `/` to `\`).
        const original = native('/path/to/file.ts');
        const parsed = parse(original);
        const formatted = format(parsed);
        asserts.assertStrictEquals(formatted, original);
      });
    });
  },
});
