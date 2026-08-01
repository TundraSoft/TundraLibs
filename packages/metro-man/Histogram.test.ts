/**
 * @fileoverview Tests for the Histogram metric.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Histogram, type HistogramOptions } from './mod.ts';
import { InvalidLabelError, InvalidMetricOptionsError } from './errors/mod.ts';

describe('Histogram', () => {
  describe('Validation', () => {
    it('should throw InvalidMetricOptionsError when buckets contain non-numbers', () => {
      asserts.assertThrows(
        () =>
          new Histogram({
            name: 'test_counter',
            buckets: ['sdf', 'sdf', 'sdf'],
          } as unknown as HistogramOptions),
        InvalidMetricOptionsError,
        'Histogram buckets must be an array of numbers',
      );
    });

    it('should attach `field: "buckets"` to the error context', () => {
      try {
        new Histogram({
          name: 'test_counter',
          buckets: 'invalid',
        } as unknown as HistogramOptions);
        asserts.fail('Histogram should have thrown');
      } catch (e) {
        asserts.assertInstanceOf(e, InvalidMetricOptionsError);
        asserts.assertEquals(e.context.field, 'buckets');
      }
    });

    it('should throw when a bucket bound is NaN', () => {
      // Regression: `NaN` is `typeof 'number'`, so it passed the
      // number check and rendered a malformed `le="NaN"` bucket that
      // never incremented (`value <= NaN` is always false).
      asserts.assertThrows(
        () =>
          new Histogram({ name: 'test_counter', buckets: [1, Number.NaN, 5] }),
        InvalidMetricOptionsError,
        'Histogram buckets must be finite numbers',
      );
    });

    it('should throw when a bucket bound is Infinity', () => {
      // An `Infinity` bound rendered `le="Infinity"` alongside the
      // automatically-appended `le="+Inf"` line — a duplicate/invalid
      // upper bound Prometheus rejects.
      asserts.assertThrows(
        () =>
          new Histogram({
            name: 'test_counter',
            buckets: [1, Number.POSITIVE_INFINITY],
          }),
        InvalidMetricOptionsError,
        'Histogram buckets must be finite numbers',
      );
    });

    it('should reject the reserved label name `le`', () => {
      const h = new Histogram({ name: 'test_counter' });
      asserts.assertThrows(
        () => h.observe(1, { le: '5' }),
        InvalidLabelError,
        "'le' is a reserved label name on histograms",
      );
    });

    it('should reject a non-finite observation', () => {
      const h = new Histogram({ name: 'test_counter' });
      asserts.assertThrows(
        () => h.observe(Number.NaN),
        InvalidMetricOptionsError,
        'Histogram observation must be a finite number, got NaN',
      );
      asserts.assertThrows(
        () => h.observe(Number.POSITIVE_INFINITY),
        InvalidMetricOptionsError,
        'Histogram observation must be a finite number, got Infinity',
      );
      asserts.assertThrows(
        () => h.observe(Number.NEGATIVE_INFINITY),
        InvalidMetricOptionsError,
        'Histogram observation must be a finite number, got -Infinity',
      );
      // The rejected observations must not have created a series.
      asserts.assertEquals(h.toJSON().data, {});
    });
  });

  describe('observe()', () => {
    it('should distribute observations across default buckets', () => {
      const hist = new Histogram({ name: 'test_counter' });
      hist.observe(1);
      hist.observe(1);
      hist.observe(5);
      hist.observe(10);
      asserts.assertEquals(hist.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'HISTOGRAM',
        labels: [],
        data: {
          no_label: {
            buckets: [
              { le: 1, count: 2 },
              { le: 1.5, count: 2 },
              { le: 2, count: 2 },
              { le: 5, count: 3 },
              { le: 10, count: 4 },
            ],
            sum: 17,
            count: 4,
          },
        },
      });
    });

    it('should count observations exceeding the largest bucket', () => {
      const hist = new Histogram({
        name: 'test_counter',
        buckets: [1, 5, 10],
      });
      hist.observe(1);
      hist.observe(5);
      hist.observe(100); // above largest bucket
      const json = hist.toJSON();
      asserts.assertEquals(json.data.no_label!.buckets, [
        { le: 1, count: 1 },
        { le: 5, count: 2 },
        { le: 10, count: 2 },
      ]);
      asserts.assertEquals(json.data.no_label!.sum, 106);
      asserts.assertEquals(json.data.no_label!.count, 3);

      const prom = hist.toPrometheus();
      asserts.assertStringIncludes(
        prom,
        'test_counter_bucket{le="+Inf"} 3',
      );
      asserts.assertStringIncludes(prom, 'test_counter_count{} 3');
    });

    it('should distribute per-label series independently', () => {
      const hist = new Histogram({ name: 'test_counter' });
      hist.observe(1, { label1: 'value1' });
      hist.observe(1, { label1: 'value1' });
      hist.observe(5, { label1: 'value2' });
      hist.observe(10, { label1: 'value2' });
      asserts.assertEquals(hist.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'HISTOGRAM',
        labels: ['label1'],
        data: {
          'label1="value1"': {
            buckets: [
              { le: 1, count: 2 },
              { le: 1.5, count: 2 },
              { le: 2, count: 2 },
              { le: 5, count: 2 },
              { le: 10, count: 2 },
            ],
            sum: 2,
            count: 2,
          },
          'label1="value2"': {
            buckets: [
              { le: 1, count: 0 },
              { le: 1.5, count: 0 },
              { le: 2, count: 0 },
              { le: 5, count: 1 },
              { le: 10, count: 2 },
            ],
            sum: 15,
            count: 2,
          },
        },
      });
    });

    it('should distribute per multi-label series', () => {
      const hist = new Histogram({ name: 'test_counter' });
      hist.observe(1, { label1: 'value1', label2: 'value2' });
      hist.observe(1, { label1: 'value1', label2: 'value2' });
      hist.observe(5, { label1: 'value1', label2: 'value3' });
      hist.observe(10, { label1: 'value1', label2: 'value3' });
      asserts.assertEquals(hist.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'HISTOGRAM',
        labels: ['label1', 'label2'],
        data: {
          'label1="value1",label2="value2"': {
            buckets: [
              { le: 1, count: 2 },
              { le: 1.5, count: 2 },
              { le: 2, count: 2 },
              { le: 5, count: 2 },
              { le: 10, count: 2 },
            ],
            sum: 2,
            count: 2,
          },
          'label1="value1",label2="value3"': {
            buckets: [
              { le: 1, count: 0 },
              { le: 1.5, count: 0 },
              { le: 2, count: 0 },
              { le: 5, count: 1 },
              { le: 10, count: 2 },
            ],
            sum: 15,
            count: 2,
          },
        },
      });
    });
  });

  describe('Bucket ordering', () => {
    it('should list buckets in ascending bound order in every output format', () => {
      // Mixed integer/decimal bounds, deliberately passed unsorted. A
      // numeric-keyed record would list integer keys first (1, 5, 10,
      // then 0.5, 2.5) — the ordered array must not.
      const hist = new Histogram({
        name: 'test_counter',
        buckets: [10, 0.5, 5, 2.5, 1],
      });
      hist.observe(0.5);
      hist.observe(3);

      const series = hist.toJSON().data.no_label!;
      asserts.assertEquals(series.buckets, [
        { le: 0.5, count: 1 },
        { le: 1, count: 1 },
        { le: 2.5, count: 1 },
        { le: 5, count: 2 },
        { le: 10, count: 2 },
      ]);

      asserts.assertEquals(
        hist.toString(),
        '[type="HISTOGRAM", name="test_counter"] {"buckets":[{"le":0.5,"count":1},{"le":1,"count":1},{"le":2.5,"count":1},{"le":5,"count":2},{"le":10,"count":2}],"sum":3.5,"count":2}',
      );

      const les = [...hist.toPrometheus().matchAll(/le="([^"]+)"/g)]
        .map((m) => m[1]);
      asserts.assertEquals(les, ['0.5', '1', '2.5', '5', '10', '+Inf']);
    });
  });

  describe('Bucket de-duplication', () => {
    it('should render each `le` bucket exactly once when buckets contain duplicates', () => {
      // Regression: duplicate bounds (easy to hit when bucket lists are
      // concatenated from overlapping config groups) were sorted but not
      // de-duplicated, so the same `le="..."` series rendered twice — a
      // duplicate series a strict Prometheus scraper rejects, aborting
      // the whole scrape.
      const hist = new Histogram({
        name: 'test_counter',
        buckets: [0.1, 0.1, 1],
      });
      hist.observe(0.5);

      const les = [...hist.toPrometheus().matchAll(/le="([^"]+)"/g)]
        .map((m) => m[1]);
      asserts.assertEquals(les, ['0.1', '1', '+Inf']);

      // The internal ladder is de-duplicated too, so JSON stays clean.
      asserts.assertEquals(hist.toJSON().data.no_label!.buckets, [
        { le: 0.1, count: 0 },
        { le: 1, count: 1 },
      ]);
    });
  });

  describe('Output rendering', () => {
    it('should escape newlines in `help` on the HELP line', () => {
      const hist = new Histogram({
        name: 'test_counter',
        help: 'first\nsecond',
      });
      hist.observe(1);
      const lines = hist.toPrometheus().split('\n');
      asserts.assertEquals(
        lines[0],
        String.raw`# HELP test_counter first\nsecond`,
      );
      asserts.assertEquals(lines[1], '# TYPE test_counter histogram');
    });

    it('should produce identical STRING, PROMETHEUS, JSON outputs via dump()', () => {
      const hist = new Histogram({ name: 'test_counter' });
      hist.observe(1, { label1: 'value1', label2: 'value2' });
      hist.observe(1, { label1: 'value1', label2: 'value2' });
      hist.observe(5, { label1: 'value1', label2: 'value3' });
      hist.observe(10, { label1: 'value1', label2: 'value3' });
      hist.observe(10);

      asserts.assertEquals(
        hist.toString(),
        '[type="HISTOGRAM", name="test_counter", label1="value1",label2="value2"] {"buckets":[{"le":1,"count":2},{"le":1.5,"count":2},{"le":2,"count":2},{"le":5,"count":2},{"le":10,"count":2}],"sum":2,"count":2}\n[type="HISTOGRAM", name="test_counter", label1="value1",label2="value3"] {"buckets":[{"le":1,"count":0},{"le":1.5,"count":0},{"le":2,"count":0},{"le":5,"count":1},{"le":10,"count":2}],"sum":15,"count":2}\n[type="HISTOGRAM", name="test_counter"] {"buckets":[{"le":1,"count":0},{"le":1.5,"count":0},{"le":2,"count":0},{"le":5,"count":0},{"le":10,"count":1}],"sum":10,"count":1}',
      );
      asserts.assertEquals(
        hist.toPrometheus(),
        '# HELP test_counter \n# TYPE test_counter histogram\ntest_counter_bucket{label1="value1",label2="value2",le="1"} 2\ntest_counter_bucket{label1="value1",label2="value2",le="1.5"} 2\ntest_counter_bucket{label1="value1",label2="value2",le="2"} 2\ntest_counter_bucket{label1="value1",label2="value2",le="5"} 2\ntest_counter_bucket{label1="value1",label2="value2",le="10"} 2\ntest_counter_bucket{label1="value1",label2="value2",le="+Inf"} 2\ntest_counter_sum{label1="value1",label2="value2"} 2\ntest_counter_count{label1="value1",label2="value2"} 2\ntest_counter_bucket{label1="value1",label2="value3",le="1"} 0\ntest_counter_bucket{label1="value1",label2="value3",le="1.5"} 0\ntest_counter_bucket{label1="value1",label2="value3",le="2"} 0\ntest_counter_bucket{label1="value1",label2="value3",le="5"} 1\ntest_counter_bucket{label1="value1",label2="value3",le="10"} 2\ntest_counter_bucket{label1="value1",label2="value3",le="+Inf"} 2\ntest_counter_sum{label1="value1",label2="value3"} 15\ntest_counter_count{label1="value1",label2="value3"} 2\ntest_counter_bucket{le="1"} 0\ntest_counter_bucket{le="1.5"} 0\ntest_counter_bucket{le="2"} 0\ntest_counter_bucket{le="5"} 0\ntest_counter_bucket{le="10"} 1\ntest_counter_bucket{le="+Inf"} 1\ntest_counter_sum{} 10\ntest_counter_count{} 1\n',
      );
      asserts.assertEquals(hist.dump('JSON'), hist.toJSON());
      asserts.assertEquals(hist.dump('PROMETHEUS'), hist.toPrometheus());
      asserts.assertEquals(hist.dump('STRING'), hist.toString());
    });
  });

  describe('toJSON() snapshot isolation', () => {
    it('should return a point-in-time snapshot unaffected by later observe()', () => {
      // Regression: toJSON() used to alias the live HistogramSeries, so a
      // captured "snapshot" silently changed as more observations landed —
      // per-interval delta computation over two captures always saw zero.
      const hist = new Histogram({ name: 'snap', buckets: [1, 5, 10] });
      hist.observe(0.5);
      const t0 = hist.dump('JSON');
      const s0 = t0.data.no_label!;
      asserts.assertEquals(s0.sum, 0.5);
      asserts.assertEquals(s0.count, 1);
      asserts.assertEquals(s0.buckets[0]!.count, 1);

      hist.observe(2);
      hist.observe(8);

      // The earlier capture must still read its capture-time values.
      asserts.assertEquals(s0.sum, 0.5);
      asserts.assertEquals(s0.count, 1);
      asserts.assertEquals(s0.buckets[0]!.count, 1);

      // A fresh capture reflects the later observations.
      const t1 = hist.dump('JSON').data.no_label!;
      asserts.assertEquals(t1.sum, 10.5);
      asserts.assertEquals(t1.count, 3);
    });

    it('should not let a caller mutating the snapshot corrupt internal state', () => {
      const hist = new Histogram({ name: 'snap2', buckets: [1, 5, 10] });
      hist.observe(0.5);
      const snap = hist.toJSON();
      // Mutate the returned object — this must not reach into the metric.
      snap.data.no_label!.sum = 9999;
      snap.data.no_label!.buckets[0]!.count = 9999;
      const fresh = hist.toJSON().data.no_label!;
      asserts.assertEquals(fresh.sum, 0.5);
      asserts.assertEquals(fresh.buckets[0]!.count, 1);
    });
  });

  describe('reset() and remove()', () => {
    it('should drop all series with reset()', () => {
      const hist = new Histogram({ name: 'test_counter' });
      hist.observe(1, { a: '1' });
      hist.observe(2, { a: '2' });
      hist.reset();
      asserts.assertEquals(hist.toJSON().data, {});
    });

    it('should drop a single series with remove(labels)', () => {
      const hist = new Histogram({ name: 'test_counter' });
      hist.observe(1, { a: '1' });
      hist.observe(2, { a: '2' });
      asserts.assertEquals(hist.remove({ a: '1' }), true);
      asserts.assertEquals(Object.keys(hist.toJSON().data), ['a="2"']);
    });
  });
});
