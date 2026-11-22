/**
 * @fileoverview Tests for isTTY(), consoleSize() and writeStdout().
 */

import { describe, it } from '../test.ts';
import { consoleSize, isTTY, writeStdout } from './terminal.ts';
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

    describe('writeStdout()', () => {
      // deno-lint-ignore no-explicit-any
      const g = globalThis as any;

      it('should write every byte, even when the OS takes a few at a time', () => {
        const text = 'first line\nsecond — line\n';
        if (RUNTIME === 'DENO') {
          const original = g.Deno.stdout.writeSync;
          const chunks: Uint8Array[] = [];
          g.Deno.stdout.writeSync = (b: Uint8Array) => {
            const n = Math.min(3, b.length);
            chunks.push(b.slice(0, n));
            return n;
          };
          try {
            writeStdout(text);
          } finally {
            g.Deno.stdout.writeSync = original;
          }
          const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
          let at = 0;
          for (const c of chunks) {
            all.set(c, at);
            at += c.length;
          }
          asserts.assert(chunks.length > 1);
          asserts.assertEquals(new TextDecoder().decode(all), text);
        } else {
          const original = g.process.stdout.write;
          const written: string[] = [];
          g.process.stdout.write = (t: string) => {
            written.push(t);
            return true;
          };
          try {
            writeStdout(text);
          } finally {
            g.process.stdout.write = original;
          }
          asserts.assertEquals(written, [text]);
        }
      });
    });
  },
});
