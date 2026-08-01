/**
 * @fileoverview Tests for ProgressBar.
 *
 * Uses an in-memory `CaptureStream` injected via the `stream` option so
 * we can assert on the exact characters written without touching real
 * stdout. TTY-vs-non-TTY behavior is exercised explicitly via the
 * `tty: true|false` option override.
 */

import { describe, it } from '../test.ts';
import { ProgressBar, type WritableLike } from './progress.ts';
import * as asserts from '@std/asserts';

class CaptureStream implements WritableLike {
  writes: string[] = [];
  write(chunk: string): void {
    this.writes.push(chunk);
  }
  joined(): string {
    return this.writes.join('');
  }
  last(): string {
    return this.writes[this.writes.length - 1] ?? '';
  }
  reset(): void {
    this.writes = [];
  }
}

describe({
  name: 'compat.cli.progress',
  fn: () => {
    // =========================================================================
    // Construction
    // =========================================================================

    describe('construction', () => {
      it('should reject zero total', () => {
        const s = new CaptureStream();
        asserts.assertThrows(
          () => new ProgressBar({ total: 0, stream: s }),
          RangeError,
        );
      });

      it('should reject negative total', () => {
        const s = new CaptureStream();
        asserts.assertThrows(
          () => new ProgressBar({ total: -1, stream: s }),
          RangeError,
        );
      });

      it('should reject NaN total', () => {
        const s = new CaptureStream();
        asserts.assertThrows(
          () => new ProgressBar({ total: NaN, stream: s }),
          RangeError,
        );
      });

      it('should reject Infinity total', () => {
        const s = new CaptureStream();
        asserts.assertThrows(
          () => new ProgressBar({ total: Infinity, stream: s }),
          RangeError,
        );
      });

      it('should accept positive integer total', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 100, stream: s });
        asserts.assertStrictEquals(bar.total, 100);
        asserts.assertStrictEquals(bar.value, 0);
      });

      it('should accept fractional total', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 0.5, stream: s });
        asserts.assertStrictEquals(bar.total, 0.5);
      });

      it('should not render at construction time', () => {
        const s = new CaptureStream();
        new ProgressBar({ total: 100, stream: s, tty: true });
        asserts.assertStrictEquals(s.writes.length, 0);
      });
    });

    // =========================================================================
    // TTY mode
    // =========================================================================

    describe('TTY mode rendering', () => {
      it('should render bar with carriage return prefix', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 10, stream: s, tty: true });
        bar.update(5);
        const out = s.last();
        asserts.assert(
          out.startsWith('\r'),
          `expected leading \\r, got: ${JSON.stringify(out)}`,
        );
      });

      it('should include percentage', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 10, stream: s, tty: true });
        bar.update(5);
        asserts.assert(s.last().includes('50%'));
      });

      it('should include value/total', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 10, stream: s, tty: true });
        bar.update(3);
        asserts.assert(s.last().includes('3/10'));
      });

      it('should include the label when provided', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({
          total: 10,
          stream: s,
          tty: true,
          label: 'Indexing',
        });
        bar.update(1);
        asserts.assert(s.last().includes('Indexing'));
      });

      it('should respect custom fill/empty chars', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({
          total: 10,
          stream: s,
          tty: true,
          width: 10,
          fillChar: '#',
          emptyChar: '-',
        });
        bar.update(5);
        asserts.assert(s.last().includes('#####-----'));
      });

      it('should respect custom width', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({
          total: 10,
          stream: s,
          tty: true,
          width: 4,
          fillChar: '#',
          emptyChar: '-',
        });
        bar.update(5);
        asserts.assert(s.last().includes('##--'));
      });

      it('should rate-limit consecutive updates', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 100, stream: s, tty: true });
        bar.update(1);
        bar.update(2);
        bar.update(3);
        bar.update(4);
        // Only the first non-throttled render should reach the stream.
        asserts.assertStrictEquals(s.writes.length, 1);
      });

      it('should always render on complete()', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 10, stream: s, tty: true });
        bar.update(5);
        const beforeComplete = s.writes.length;
        bar.complete();
        // complete() writes the final bar (force=true bypasses throttle)
        // and a trailing newline.
        asserts.assert(s.writes.length > beforeComplete);
        asserts.assertStrictEquals(s.last(), '\n');
      });
    });

    // =========================================================================
    // Behavior
    // =========================================================================

    describe('value handling', () => {
      it('should clamp negative values to 0', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 10, stream: s, tty: true });
        bar.update(-5);
        asserts.assertStrictEquals(bar.value, 0);
      });

      it('should clamp values above total', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 10, stream: s, tty: true });
        bar.update(50);
        asserts.assertStrictEquals(bar.value, 10);
      });

      it('increment() should advance by 1 by default', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 10, stream: s, tty: true });
        bar.increment();
        asserts.assertStrictEquals(bar.value, 1);
      });

      it('increment(n) should advance by n', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 10, stream: s, tty: true });
        bar.increment(3);
        asserts.assertStrictEquals(bar.value, 3);
      });

      it('label can be updated via update()', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({
          total: 10,
          stream: s,
          tty: true,
          label: 'A',
        });
        bar.update(5, 'B');
        asserts.assert(s.last().includes('B'));
        asserts.assertFalse(s.last().includes('A'));
      });
    });

    // =========================================================================
    // Non-TTY mode
    // =========================================================================

    describe('non-TTY mode rendering', () => {
      it('should not include carriage return', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 10, stream: s, tty: false });
        bar.update(5);
        asserts.assertFalse(s.last().includes('\r'));
      });

      it('should end each line with newline', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 10, stream: s, tty: false });
        bar.update(5);
        asserts.assert(s.last().endsWith('\n'));
      });

      it('should emit one line per percent change', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 100, stream: s, tty: false });
        bar.update(50); // 50%
        bar.update(50); // 50% — duplicate, suppressed
        bar.update(75); // 75%
        bar.update(76); // 76%
        // Distinct percents emitted: 50, 75, 76.
        asserts.assertStrictEquals(s.writes.length, 3);
        asserts.assert(s.writes[0]?.includes('50%'));
        asserts.assert(s.writes[1]?.includes('75%'));
        asserts.assert(s.writes[2]?.includes('76%'));
      });

      it('should not emit extra newline write on complete()', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 10, stream: s, tty: false });
        bar.update(5);
        bar.complete();
        // The 100% line itself ends with \n; no separate \n write.
        asserts.assertFalse(s.last() === '\n');
        asserts.assert(s.last().includes('100%'));
        asserts.assert(s.last().endsWith('\n'));
      });

      it('label flows into output line', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({
          total: 10,
          stream: s,
          tty: false,
          label: 'Migrating',
        });
        bar.update(5);
        asserts.assert(s.last().includes('Migrating'));
      });
    });

    // =========================================================================
    // Lifecycle
    // =========================================================================

    describe('lifecycle', () => {
      it('update() after complete() is a no-op', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 10, stream: s, tty: true });
        bar.complete();
        const after = s.writes.length;
        bar.update(5);
        bar.increment();
        asserts.assertStrictEquals(s.writes.length, after);
      });

      it('stop() emits a newline in TTY mode', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 10, stream: s, tty: true });
        bar.update(5);
        bar.stop();
        asserts.assertStrictEquals(s.last(), '\n');
      });

      it('stop() is a no-op in non-TTY mode', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 10, stream: s, tty: false });
        bar.update(5);
        const before = s.writes.length;
        bar.stop();
        asserts.assertStrictEquals(s.writes.length, before);
      });

      it('stop() is idempotent', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 10, stream: s, tty: true });
        bar.stop();
        const after = s.writes.length;
        bar.stop();
        bar.stop();
        asserts.assertStrictEquals(s.writes.length, after);
      });

      it('complete() after stop() is a no-op', () => {
        const s = new CaptureStream();
        const bar = new ProgressBar({ total: 10, stream: s, tty: true });
        bar.stop();
        const after = s.writes.length;
        bar.complete();
        asserts.assertStrictEquals(s.writes.length, after);
      });
    });
  },
});
