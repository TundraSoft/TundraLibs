/**
 * @fileoverview Tests for isTTY() and consoleSize().
 */

import { describe, it } from '../test.ts';
import { consoleSize, isTTY } from './terminal.ts';
import { RUNTIME } from '../runtime.ts';
import * as asserts from '@std/asserts';

describe({
  name: 'compat.cli.terminal',
  fn: () => {
    describe('isTTY()', () => {
      it('should return a boolean', () => {
        asserts.assertEquals(typeof isTTY(), 'boolean');
      });

      it('should default to stdout when no stream specified', () => {
        asserts.assertEquals(isTTY(), isTTY('stdout'));
      });

      it('should accept all three standard streams', () => {
        for (const stream of ['stdin', 'stdout', 'stderr'] as const) {
          asserts.assertEquals(typeof isTTY(stream), 'boolean');
        }
      });

      it('should be consistent across calls', () => {
        asserts.assertEquals(isTTY('stdout'), isTTY('stdout'));
      });
    });

    describe('consoleSize()', () => {
      it('should return an object with columns and rows', () => {
        const size = consoleSize();
        asserts.assertEquals(typeof size, 'object');
        asserts.assertEquals(typeof size.columns, 'number');
        asserts.assertEquals(typeof size.rows, 'number');
      });

      it('should return positive integers', () => {
        const size = consoleSize();
        asserts.assert(
          Number.isInteger(size.columns) && size.columns > 0,
          `columns should be positive integer, got ${size.columns}`,
        );
        asserts.assert(
          Number.isInteger(size.rows) && size.rows > 0,
          `rows should be positive integer, got ${size.rows}`,
        );
      });

      it('should fall back to 80x24 when the runtime has no usable size', () => {
        // We can't reliably trigger the runtime fallback path from inside
        // a normal `deno test` invocation: on Deno, `consoleSize()` reads
        // from the controlling tty regardless of stdout's TTY status;
        // under Bun/Node, `process.stdout.columns` reflects the parent
        // terminal. So stub the relevant runtime surface and verify the
        // implementation hands back the documented default.
        // deno-lint-ignore no-explicit-any
        const g = globalThis as any;
        if (RUNTIME === 'DENO') {
          const orig = g.Deno.consoleSize;
          try {
            g.Deno.consoleSize = () => {
              throw new Error('no tty');
            };
            asserts.assertEquals(consoleSize(), { columns: 80, rows: 24 });
            g.Deno.consoleSize = () => ({ columns: 0, rows: 0 });
            asserts.assertEquals(consoleSize(), { columns: 80, rows: 24 });
          } finally {
            g.Deno.consoleSize = orig;
          }
        } else if (RUNTIME === 'BUN' || RUNTIME === 'NODE') {
          const stdout = g.process.stdout;
          const origCols = stdout.columns;
          const origRows = stdout.rows;
          try {
            stdout.columns = undefined;
            stdout.rows = undefined;
            asserts.assertEquals(consoleSize(), { columns: 80, rows: 24 });
            stdout.columns = 0;
            stdout.rows = 0;
            asserts.assertEquals(consoleSize(), { columns: 80, rows: 24 });
          } finally {
            stdout.columns = origCols;
            stdout.rows = origRows;
          }
        }
      });
    });
  },
});
