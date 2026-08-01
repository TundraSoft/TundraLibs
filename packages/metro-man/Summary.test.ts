/**
 * @fileoverview Tests for the Summary metric.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Summary, type SummaryOptions } from './mod.ts';
import { InvalidLabelError, InvalidMetricOptionsError } from './errors/mod.ts';

const FAKE_CLOCK_START = 1_700_000_000;

/**
 * Summary with a controllable clock, driven through the `_now()`
 * seam so sliding-window behavior is deterministic — no real sleeps.
 * Call `advance(seconds)` to move fake time forward.
 */
class FakeClockSummary extends Summary {
  // Left undefined until `advance()` runs: the base constructor calls
  // `_now()` (to seed `_lastPurge`) before this subclass's field
  // initializers would run, so `_now()` falls back to the start value.
  public clock?: number;

  public advance(seconds: number): void {
    this.clock = this._now() + seconds;
  }

  public get lastPurge(): number {
    return this._lastPurge;
  }

  public read(): void {
    this._calculate();
  }

  protected override _now(): number {
    return this.clock ?? FAKE_CLOCK_START;
  }
}

describe('Summary', () => {
  describe('Validation', () => {
    it('should throw when quantiles are not numbers', () => {
      asserts.assertThrows(
        () =>
          new Summary({
            name: 'test_counter',
            quantiles: ['sdf', 'sdf', 'sdf'],
          } as unknown as SummaryOptions),
        InvalidMetricOptionsError,
        'Summary quantiles must be an array of numbers',
      );
    });

    it('should throw when a quantile is above 1', () => {
      asserts.assertThrows(
        () => new Summary({ name: 'test_counter', quantiles: [0.5, 1.5] }),
        InvalidMetricOptionsError,
        'Summary quantiles must be finite numbers between 0 and 1',
      );
    });

    it('should throw when a quantile is below 0', () => {
      asserts.assertThrows(
        () => new Summary({ name: 'test_counter', quantiles: [-0.5] }),
        InvalidMetricOptionsError,
        'Summary quantiles must be finite numbers between 0 and 1',
      );
    });

    it('should throw when a quantile is not finite', () => {
      asserts.assertThrows(
        () => new Summary({ name: 'test_counter', quantiles: [Number.NaN] }),
        InvalidMetricOptionsError,
        'Summary quantiles must be finite numbers between 0 and 1',
      );
    });

    it('should accept the boundary quantiles 0 and 1', () => {
      const s = new Summary({ name: 'test_counter', quantiles: [0, 1] });
      s.observe(10);
      s.observe(20);
      s.observe(30);
      const q = s.toJSON().data['no_label']!.quantile;
      asserts.assertEquals(q[0], 10);
      asserts.assertEquals(q[1], 30);
    });

    it('should throw when window is not a number', () => {
      asserts.assertThrows(
        () =>
          new Summary({
            name: 'test_counter',
            window: '23',
          } as unknown as SummaryOptions),
        InvalidMetricOptionsError,
        'Invalid summary window',
      );
    });

    it('should throw when window is below the [1, 600] range', () => {
      asserts.assertThrows(
        () => new Summary({ name: 'test_counter', window: 0 }),
        InvalidMetricOptionsError,
        'Summary window must be between 1 and 600 seconds',
      );
    });

    it('should throw when window is above the [1, 600] range', () => {
      asserts.assertThrows(
        () => new Summary({ name: 'test_counter', window: 700 }),
        InvalidMetricOptionsError,
        'Summary window must be between 1 and 600 seconds',
      );
    });

    it('should throw when window is NaN', () => {
      // Regression: `NaN` is `typeof 'number'` and passes both range
      // comparisons (`NaN < 1` / `NaN > 600` are false), so it used to
      // sneak through and set `_window = NaN`, permanently disabling
      // every purge and letting `_rawData` grow without bound.
      asserts.assertThrows(
        () => new Summary({ name: 'test_counter', window: Number.NaN }),
        InvalidMetricOptionsError,
        'Summary window must be between 1 and 600 seconds',
      );
    });

    it('should throw when window is Infinity', () => {
      asserts.assertThrows(
        () =>
          new Summary({
            name: 'test_counter',
            window: Number.POSITIVE_INFINITY,
          }),
        InvalidMetricOptionsError,
        'Summary window must be between 1 and 600 seconds',
      );
    });

    it('should still slide the quantile window after the finite guard', () => {
      // The finiteness guard must not disturb the happy path: a valid
      // window keeps sliding, so the quantile drops observations out of
      // range while the cumulative sum/count keep every observation.
      const s = new FakeClockSummary({ name: 'test_counter', window: 1 });
      s.observe(10);
      s.advance(2);
      const data = s.toJSON().data;
      // _count/_sum are lifetime totals — the single observation stays.
      asserts.assertEquals(data['no_label']!.count, 1);
      asserts.assertEquals(data['no_label']!.sum, 10);
      // The quantile window is now empty — emits 0, not the aged-out 10.
      asserts.assertEquals(data['no_label']!.quantile[0.5], 0);
    });

    it('should reject the reserved label name `quantile`', () => {
      const s = new Summary({ name: 'test_counter' });
      asserts.assertThrows(
        () => s.observe(1, { quantile: '0.5' }),
        InvalidLabelError,
        "'quantile' is a reserved label name on summaries",
      );
    });
  });

  describe('observe()', () => {
    it('should reject a non-finite observation', () => {
      const s = new Summary({ name: 'test_counter' });
      asserts.assertThrows(
        () => s.observe(Number.NaN),
        InvalidMetricOptionsError,
        'Summary observation must be a finite number, got NaN',
      );
      asserts.assertThrows(
        () => s.observe(Number.POSITIVE_INFINITY),
        InvalidMetricOptionsError,
        'Summary observation must be a finite number, got Infinity',
      );
      asserts.assertThrows(
        () => s.observe(Number.NEGATIVE_INFINITY),
        InvalidMetricOptionsError,
        'Summary observation must be a finite number, got -Infinity',
      );
      // The rejected observations must not have created a series.
      asserts.assertEquals(s.toJSON().data, {});
    });

    it('should compute quantiles with linear interpolation', () => {
      const s = new Summary({ name: 'test_counter' });
      s.observe(10);
      s.observe(20);
      s.observe(30);
      // sorted=[10,20,30], n=3.
      // q=0.5  → rank=1.0,  value=20
      // q=0.9  → rank=1.8,  value=20 + 0.8 * (30-20) = 28
      // q=0.99 → rank=1.98, value=20 + 0.98 * (30-20) = 29.8
      asserts.assertEquals(s.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'SUMMARY',
        labels: [],
        data: {
          no_label: {
            quantile: { '0.5': 20, '0.9': 28, '0.99': 29.8 },
            count: 3,
            sum: 60,
          },
        },
      });
    });

    it('should compute quantiles per label-value', () => {
      const s = new Summary({ name: 'test_counter' });
      s.observe(10, { label1: 'value1' });
      s.observe(20, { label1: 'value1' });
      s.observe(30, { label1: 'value2' });
      asserts.assertEquals(s.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'SUMMARY',
        labels: ['label1'],
        data: {
          'label1="value1"': {
            quantile: { '0.5': 15, '0.9': 19, '0.99': 19.9 },
            count: 2,
            sum: 30,
          },
          'label1="value2"': {
            quantile: { '0.5': 30, '0.9': 30, '0.99': 30 },
            count: 1,
            sum: 30,
          },
        },
      });
    });

    it('should compute quantiles per multi-label series', () => {
      const s = new Summary({ name: 'test_counter' });
      s.observe(10, { label1: 'value1', label2: 'value2' });
      s.observe(20, { label1: 'value1', label2: 'value2' });
      s.observe(10, { label1: 'value1', label2: 'value3' });
      s.observe(30, { label1: 'value1', label2: 'value3' });
      asserts.assertEquals(s.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'SUMMARY',
        labels: ['label1', 'label2'],
        data: {
          'label1="value1",label2="value2"': {
            quantile: { '0.5': 15, '0.9': 19, '0.99': 19.9 },
            count: 2,
            sum: 30,
          },
          'label1="value1",label2="value3"': {
            quantile: { '0.5': 20, '0.9': 28, '0.99': 29.8 },
            count: 2,
            sum: 40,
          },
        },
      });
    });
  });

  describe('Sliding window', () => {
    it('should slide the quantile window while keeping _sum/_count cumulative', () => {
      const s = new FakeClockSummary({ name: 'test_counter', window: 1 });
      s.observe(10, { label1: 'value1' });
      s.observe(20, { label1: 'value1' });
      s.observe(10, { label1: 'value2' });
      s.advance(2);
      s.observe(30, { label1: 'value2' });
      const data = s.toJSON().data;
      // value1's two samples aged out of the quantile window, but its
      // cumulative totals are lifetime — count/sum never decrease.
      asserts.assertEquals(data['label1="value1"']!.count, 2);
      asserts.assertEquals(data['label1="value1"']!.sum, 30);
      // With no in-window samples the quantile emits 0, not NaN.
      asserts.assertEquals(data['label1="value1"']!.quantile[0.5], 0);
      // value2 kept only its recent sample (30) in the quantile window
      // and dropped the older 10, yet its cumulative totals count both.
      asserts.assertEquals(data['label1="value2"']!.count, 2);
      asserts.assertEquals(data['label1="value2"']!.sum, 40);
      asserts.assertEquals(data['label1="value2"']!.quantile[0.5], 30);
    });

    it('should keep _count/_sum cumulative while quantiles slide with the window', () => {
      // Prometheus/client_golang semantics: _sum/_count are lifetime
      // totals (monotonic — safe to scrape with rate()/increase()),
      // while only the quantile estimates track the recent window. This
      // is the split the whole change pins: cumulative totals + a
      // windowed quantile.
      const s = new FakeClockSummary({ name: 'test_counter', window: 1 });
      s.observe(10);
      s.observe(20);
      s.observe(30);
      s.advance(2); // the three samples age out of the 1s window
      s.observe(40); // lands in the current window
      const data = s.toJSON().data['no_label']!;
      // Cumulative totals count every observation ever made.
      asserts.assertEquals(data.count, 4);
      asserts.assertEquals(data.sum, 100);
      // The quantile reflects only the in-window sample (40).
      asserts.assertEquals(data.quantile[0.5], 40);
    });

    it('should purge quantile samples older than the default 600s window when `window` is omitted', () => {
      // Regression: a window-less Summary previously never purged its
      // quantile buffer, so `_rawData` grew without bound. `window` now
      // defaults to 600.
      const s = new FakeClockSummary({ name: 'test_counter' });
      s.observe(10);
      s.advance(599);
      // Still inside the default window — the sample feeds the quantile.
      asserts.assertEquals(s.toJSON().data['no_label']!.quantile[0.5], 10);
      s.advance(2);
      // 601 seconds after the observation — dropped from the quantile
      // window, but the cumulative totals are lifetime and stay put.
      const data = s.toJSON().data;
      asserts.assertEquals(data['no_label']!.count, 1);
      asserts.assertEquals(data['no_label']!.sum, 10);
      asserts.assertEquals(data['no_label']!.quantile[0.5], 0);
    });

    it('should not advance the purge marker on a read-time purge', () => {
      // A read (`_calculate`) must not reset `_lastPurge`, otherwise
      // reads more frequent than `window` starve the observe-time
      // purge and `_rawData` grows unbounded.
      const s = new FakeClockSummary({ name: 'test_counter', window: 60 });
      s.observe(1);
      const marker = s.lastPurge;
      s.advance(120); // well past the window
      s.read(); // read-time purge — must leave the marker untouched
      asserts.assertEquals(s.lastPurge, marker);
      // The observe-time purge still fires on the next write, and only
      // that path advances the marker.
      s.observe(2);
      asserts.assertEquals(s.lastPurge, marker + 120);
    });

    it('should render a finite (non-NaN) value for an empty window', () => {
      const s = new FakeClockSummary({ name: 'test_counter', window: 1 });
      s.observe(10);
      s.advance(2);
      const prom = s.toPrometheus();
      asserts.assertEquals(prom.includes('NaN'), false);
      asserts.assertStringIncludes(prom, 'test_counter{quantile="0.5"} 0');
    });
  });

  describe('Quantile de-duplication', () => {
    it('should render each `quantile` series exactly once when quantiles contain duplicates', () => {
      // Regression: duplicate quantiles (easy to hit when quantile lists
      // are concatenated from overlapping config groups) were sorted but
      // not de-duplicated, so the same `quantile="..."` series rendered
      // twice — a duplicate series a strict Prometheus scraper rejects,
      // aborting the whole scrape.
      const s = new Summary({ name: 'test_counter', quantiles: [0.5, 0.5] });
      s.observe(1);
      s.observe(2);

      const qs = [...s.toPrometheus().matchAll(/quantile="([^"]+)"/g)]
        .map((m) => m[1]);
      asserts.assertEquals(qs, ['0.5']);

      // The internal quantile list is de-duplicated too, so JSON stays clean.
      asserts.assertEquals(s.toJSON().data.no_label!.quantile, { '0.5': 1.5 });
    });
  });

  describe('Output rendering', () => {
    it('should escape newlines in `help` on the HELP line', () => {
      const s = new Summary({ name: 'test_counter', help: 'first\nsecond' });
      s.observe(1);
      const lines = s.toPrometheus().split('\n');
      asserts.assertEquals(
        lines[0],
        String.raw`# HELP test_counter first\nsecond`,
      );
      asserts.assertEquals(lines[1], '# TYPE test_counter summary');
    });

    it('should produce identical STRING, PROMETHEUS, JSON outputs via dump()', () => {
      const s = new Summary({ name: 'test_counter' });
      s.observe(1, { label1: 'value1', label2: 'value2' });
      s.observe(1, { label1: 'value1', label2: 'value2' });
      s.observe(5, { label1: 'value1', label2: 'value3' });
      s.observe(10, { label1: 'value1', label2: 'value3' });
      s.observe(10);
      asserts.assertEquals(s.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'SUMMARY',
        labels: ['label1', 'label2'],
        data: {
          'label1="value1",label2="value2"': {
            quantile: { '0.5': 1, '0.9': 1, '0.99': 1 },
            count: 2,
            sum: 2,
          },
          'label1="value1",label2="value3"': {
            quantile: { '0.5': 7.5, '0.9': 9.5, '0.99': 9.95 },
            count: 2,
            sum: 15,
          },
          no_label: {
            quantile: { '0.5': 10, '0.9': 10, '0.99': 10 },
            count: 1,
            sum: 10,
          },
        },
      });
      asserts.assertEquals(s.dump('JSON'), s.toJSON());
      asserts.assertEquals(s.dump('PROMETHEUS'), s.toPrometheus());
      asserts.assertEquals(s.dump('STRING'), s.toString());
    });
  });

  describe('reset() and remove()', () => {
    it('should drop all series with reset()', () => {
      const s = new Summary({ name: 'test_counter' });
      s.observe(1, { a: '1' });
      s.observe(2, { a: '2' });
      s.reset();
      asserts.assertEquals(s.toJSON().data, {});
    });

    it('should drop a single series with remove(labels)', () => {
      const s = new Summary({ name: 'test_counter' });
      s.observe(1, { a: '1' });
      s.observe(2, { a: '2' });
      asserts.assertEquals(s.remove({ a: '1' }), true);
      asserts.assertEquals(Object.keys(s.toJSON().data), ['a="2"']);
    });
  });
});
