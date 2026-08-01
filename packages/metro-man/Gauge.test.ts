/**
 * @fileoverview Tests for the Gauge metric.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Gauge, type GaugeOptions } from './mod.ts';
import { InvalidMetricOptionsError } from './errors/mod.ts';

describe('Gauge', () => {
  describe('Validation', () => {
    it('should throw InvalidMetricOptionsError when name is missing', () => {
      asserts.assertThrows(
        () => new Gauge({} as unknown as GaugeOptions),
        InvalidMetricOptionsError,
        'Metric name is required',
      );
    });
  });

  describe('Explicit amount overloads', () => {
    it('should accept inc(amount, labels?) and dec(amount, labels?)', () => {
      const gauge = new Gauge({ name: 'test_counter' });
      gauge.inc(5);
      gauge.dec(2);
      gauge.inc(10, { kind: 'a' });
      gauge.dec(3, { kind: 'a' });
      asserts.assertEquals(gauge.toJSON().data, {
        no_label: 3,
        'kind="a"': 7,
      });
    });
  });

  describe('set / inc / dec', () => {
    it('should reject a non-finite set() value', () => {
      const gauge = new Gauge({ name: 'test_counter' });
      asserts.assertThrows(
        () => gauge.set(Number.NaN),
        InvalidMetricOptionsError,
        'Gauge value must be a finite number, got NaN',
      );
      asserts.assertThrows(
        () => gauge.set(Number.POSITIVE_INFINITY),
        InvalidMetricOptionsError,
        'Gauge value must be a finite number, got Infinity',
      );
      asserts.assertThrows(
        () => gauge.set(Number.NEGATIVE_INFINITY),
        InvalidMetricOptionsError,
        'Gauge value must be a finite number, got -Infinity',
      );
      // The rejected calls must not have created a series.
      asserts.assertEquals(gauge.toJSON().data, {});
    });

    it('should compose set/inc/dec correctly on the unlabelled series', () => {
      const gauge = new Gauge({ name: 'test_counter' });
      gauge.dec();
      asserts.assertEquals(gauge.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'GAUGE',
        labels: [],
        data: { no_label: -1 },
      });
      gauge.set(5);
      asserts.assertEquals(gauge.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'GAUGE',
        labels: [],
        data: { no_label: 5 },
      });
      gauge.inc();
      gauge.inc();
      gauge.inc();
      asserts.assertEquals(gauge.toJSON().data, { no_label: 8 });
      gauge.dec();
      asserts.assertEquals(gauge.toJSON().data, { no_label: 7 });
    });

    it('should key per label value and compose set/inc/dec independently', () => {
      const gauge = new Gauge({ name: 'test_counter' });
      gauge.inc({ label1: 'value1' });
      gauge.inc({ label1: 'value1' });
      gauge.set(2, { label1: 'value2' });
      gauge.inc({ label1: 'value2' });
      asserts.assertEquals(gauge.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'GAUGE',
        labels: ['label1'],
        data: {
          'label1="value1"': 2,
          'label1="value2"': 3,
        },
      });
      gauge.dec({ label1: 'value2' });
      asserts.assertEquals(gauge.toJSON().data, {
        'label1="value1"': 2,
        'label1="value2"': 2,
      });
    });

    it('should key per multi-label combination', () => {
      const gauge = new Gauge({ name: 'test_counter' });
      gauge.inc({ label1: 'value1', label2: 'value2' });
      gauge.inc({ label1: 'value1', label2: 'value2' });
      gauge.inc({ label1: 'value1', label2: 'value3' });
      asserts.assertEquals(gauge.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'GAUGE',
        labels: ['label1', 'label2'],
        data: {
          'label1="value1",label2="value2"': 2,
          'label1="value1",label2="value3"': 1,
        },
      });
    });
  });

  describe('Output rendering', () => {
    it('should produce identical STRING, PROMETHEUS, JSON outputs via dump()', () => {
      const gauge = new Gauge({ name: 'test_counter' });
      gauge.inc({ label1: 'value1', label2: 'value2' });
      gauge.inc({ label1: 'value1', label2: 'value2' });
      gauge.inc({ label1: 'value1', label2: 'value3' });
      gauge.inc();
      gauge.inc({ label1: 'value1', label2: 'value3' });
      gauge.dec({ label1: 'value1', label2: 'value3' });

      asserts.assertEquals(gauge.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'GAUGE',
        labels: ['label1', 'label2'],
        data: {
          'label1="value1",label2="value2"': 2,
          'label1="value1",label2="value3"': 1,
          'no_label': 1,
        },
      });
      asserts.assertEquals(
        gauge.toString(),
        '[type="GAUGE", name="test_counter", label1="value1",label2="value2"] 2\n[type="GAUGE", name="test_counter", label1="value1",label2="value3"] 1\n[type="GAUGE", name="test_counter"] 1',
      );
      asserts.assertEquals(
        gauge.toPrometheus(),
        '# HELP test_counter \n# TYPE test_counter gauge\ntest_counter{label1="value1",label2="value2"} 2\ntest_counter{label1="value1",label2="value3"} 1\ntest_counter 1\n',
      );
      asserts.assertEquals(gauge.dump('JSON'), gauge.toJSON());
      asserts.assertEquals(gauge.dump('PROMETHEUS'), gauge.toPrometheus());
      asserts.assertEquals(gauge.dump('STRING'), gauge.toString());
    });
  });
});
