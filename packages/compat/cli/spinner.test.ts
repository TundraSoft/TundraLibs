/**
 * @fileoverview Tests for Spinner.
 *
 * Uses an in-memory `CaptureStream` and a very large `intervalMs` so
 * the internal animation timer can't fire during the test window —
 * frame advancement is driven by `tick()` instead, keeping assertions
 * deterministic.
 */

import { describe, it } from '../test.ts';
import {
  Spinner,
  SPINNER_FRAMES_ASCII,
  SPINNER_FRAMES_BRAILLE,
} from './spinner.ts';
import type { WritableLike } from './progress.ts';
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
}

// Big enough that the auto-tick timer never fires within a test.
const NEVER = 60_000;

describe({
  name: 'compat.cli.spinner',
  fn: () => {
    // =========================================================================
    // Frame constants
    // =========================================================================

    describe('SPINNER_FRAMES_BRAILLE', () => {
      it('should be a non-empty array of strings', () => {
        asserts.assert(SPINNER_FRAMES_BRAILLE.length > 0);
        for (const f of SPINNER_FRAMES_BRAILLE) {
          asserts.assertStrictEquals(typeof f, 'string');
          asserts.assert(f.length > 0);
        }
      });
    });

    describe('SPINNER_FRAMES_ASCII', () => {
      it('should be a non-empty array of strings', () => {
        asserts.assert(SPINNER_FRAMES_ASCII.length > 0);
        for (const f of SPINNER_FRAMES_ASCII) {
          asserts.assertStrictEquals(typeof f, 'string');
          asserts.assert(f.length > 0);
        }
      });
    });

    // =========================================================================
    // Construction
    // =========================================================================

    describe('construction', () => {
      it('should default to braille frames', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          intervalMs: NEVER,
        });
        spin.start();
        asserts.assert(s.writes[0]?.includes(SPINNER_FRAMES_BRAILLE[0]!));
        spin.stop();
      });

      it('should accept custom frames', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          frames: SPINNER_FRAMES_ASCII,
          intervalMs: NEVER,
        });
        spin.start();
        asserts.assert(s.writes[0]?.includes(SPINNER_FRAMES_ASCII[0]!));
        spin.stop();
      });

      it('should fall back to braille when frames is empty', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          frames: [],
          intervalMs: NEVER,
        });
        spin.start();
        asserts.assert(s.writes[0]?.includes(SPINNER_FRAMES_BRAILLE[0]!));
        spin.stop();
      });

      it('should not render at construction time', () => {
        const s = new CaptureStream();
        new Spinner({ stream: s, tty: true, intervalMs: NEVER });
        asserts.assertStrictEquals(s.writes.length, 0);
      });

      it('running flag is false before start()', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          intervalMs: NEVER,
        });
        asserts.assertFalse(spin.running);
      });
    });

    // =========================================================================
    // TTY mode
    // =========================================================================

    describe('TTY mode', () => {
      it('start() renders the first frame', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          intervalMs: NEVER,
          label: 'Loading',
        });
        spin.start();
        const first = s.writes[0]!;
        asserts.assert(first.includes(SPINNER_FRAMES_BRAILLE[0]!));
        asserts.assert(first.includes('Loading'));
        spin.stop();
      });

      it('start() renders with a leading clear-line escape', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          intervalMs: NEVER,
        });
        spin.start();
        // The render prefix is "\r\x1b[2K" (clear current line).
        asserts.assert(s.writes[0]?.startsWith('\r\x1b[2K'));
        spin.stop();
      });

      it('tick() advances frames', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          intervalMs: NEVER,
        });
        spin.start();
        s.writes.length = 0;
        spin.tick();
        asserts.assert(s.writes[0]?.includes(SPINNER_FRAMES_BRAILLE[1]!));
        spin.tick();
        asserts.assert(s.writes[1]?.includes(SPINNER_FRAMES_BRAILLE[2]!));
        spin.stop();
      });

      it('tick() wraps at end of frames array', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          intervalMs: NEVER,
          frames: ['a', 'b', 'c'],
        });
        spin.start();
        s.writes.length = 0;
        spin.tick(); // → b
        spin.tick(); // → c
        spin.tick(); // → a (wrap)
        asserts.assert(s.writes[2]?.includes('a'));
        spin.stop();
      });

      it('setLabel() re-renders with the new label', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          intervalMs: NEVER,
          label: 'A',
        });
        spin.start();
        s.writes.length = 0;
        spin.setLabel('B');
        asserts.assert(s.writes[0]?.includes('B'));
        asserts.assertFalse(s.writes[0]?.includes('A'));
        spin.stop();
      });

      it('succeed() writes ✓ and final label ending with newline', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          intervalMs: NEVER,
        });
        spin.start();
        s.writes.length = 0;
        spin.succeed('Done');
        const last = s.last();
        asserts.assert(last.includes('✓'));
        asserts.assert(last.includes('Done'));
        asserts.assert(last.endsWith('\n'));
      });

      it('fail() writes ✗ and final label ending with newline', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          intervalMs: NEVER,
        });
        spin.start();
        s.writes.length = 0;
        spin.fail('Oops');
        const last = s.last();
        asserts.assert(last.includes('✗'));
        asserts.assert(last.includes('Oops'));
        asserts.assert(last.endsWith('\n'));
      });

      it('succeed() falls back to existing label when none passed', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          intervalMs: NEVER,
          label: 'Connecting',
        });
        spin.start();
        s.writes.length = 0;
        spin.succeed();
        asserts.assert(s.last().includes('Connecting'));
      });
    });

    // =========================================================================
    // Non-TTY mode
    // =========================================================================

    describe('non-TTY mode', () => {
      it('start() emits a single label line', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: false,
          label: 'Loading',
        });
        spin.start();
        asserts.assertStrictEquals(s.writes.length, 1);
        asserts.assert(s.writes[0]?.includes('Loading'));
        asserts.assert(s.writes[0]?.endsWith('\n'));
        spin.stop();
      });

      it('start() with no label emits nothing', () => {
        const s = new CaptureStream();
        const spin = new Spinner({ stream: s, tty: false });
        spin.start();
        asserts.assertStrictEquals(s.writes.length, 0);
        spin.stop();
      });

      it('tick() is a no-op', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: false,
          label: 'Wait',
        });
        spin.start();
        const before = s.writes.length;
        spin.tick();
        spin.tick();
        spin.tick();
        asserts.assertStrictEquals(s.writes.length, before);
        spin.stop();
      });

      it('succeed() emits only the label, no ✓', () => {
        const s = new CaptureStream();
        const spin = new Spinner({ stream: s, tty: false });
        spin.start();
        s.writes.length = 0;
        spin.succeed('Done');
        const last = s.last();
        asserts.assert(last.includes('Done'));
        asserts.assertFalse(last.includes('✓'));
        asserts.assert(last.endsWith('\n'));
      });

      it('fail() emits only the label, no ✗', () => {
        const s = new CaptureStream();
        const spin = new Spinner({ stream: s, tty: false });
        spin.start();
        s.writes.length = 0;
        spin.fail('Oops');
        const last = s.last();
        asserts.assert(last.includes('Oops'));
        asserts.assertFalse(last.includes('✗'));
      });

      it('stop() is a no-op (no clear-line)', () => {
        const s = new CaptureStream();
        const spin = new Spinner({ stream: s, tty: false });
        spin.start();
        const before = s.writes.length;
        spin.stop();
        asserts.assertStrictEquals(s.writes.length, before);
      });
    });

    // =========================================================================
    // Lifecycle
    // =========================================================================

    describe('lifecycle', () => {
      it('running flag flips on start/stop', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          intervalMs: NEVER,
        });
        asserts.assertFalse(spin.running);
        spin.start();
        asserts.assert(spin.running);
        spin.stop();
        asserts.assertFalse(spin.running);
      });

      it('start() after stop() is a no-op', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          intervalMs: NEVER,
        });
        spin.start();
        spin.stop();
        const after = s.writes.length;
        spin.start();
        asserts.assertStrictEquals(s.writes.length, after);
      });

      it('repeated start() is a no-op', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          intervalMs: NEVER,
        });
        spin.start();
        const after = s.writes.length;
        spin.start();
        spin.start();
        asserts.assertStrictEquals(s.writes.length, after);
        spin.stop();
      });

      it('succeed() after stop() is a no-op', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          intervalMs: NEVER,
        });
        spin.start();
        spin.stop();
        const after = s.writes.length;
        spin.succeed('Done');
        asserts.assertStrictEquals(s.writes.length, after);
      });

      it('tick() before start() is a no-op', () => {
        const s = new CaptureStream();
        const spin = new Spinner({
          stream: s,
          tty: true,
          intervalMs: NEVER,
        });
        spin.tick();
        spin.tick();
        asserts.assertStrictEquals(s.writes.length, 0);
      });
    });
  },
});
