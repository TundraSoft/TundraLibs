/**
 * @fileoverview Tests for the Counter metric.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Counter, type CounterOptions } from './mod.ts';
import { InvalidMetricOptionsError } from './errors/mod.ts';

describe('Counter', () => {
  describe('Validation', () => {
    it('should throw InvalidMetricOptionsError when name is missing', () => {
      asserts.assertThrows(
        () => new Counter({} as unknown as CounterOptions),
        InvalidMetricOptionsError,
        'Metric name is required',
      );
    });

    it('should attach `field: "name"` to the error context', () => {
      try {
        new Counter({} as unknown as CounterOptions);
        asserts.fail('Counter should have thrown');
      } catch (e) {
        asserts.assertInstanceOf(e, InvalidMetricOptionsError);
        asserts.assertEquals(e.context.field, 'name');
      }
    });
  });

  describe('inc()', () => {
    it('should increment the unlabelled series by 1 each call', () => {
      const counter = new Counter({ name: 'test_counter' });
      counter.inc();
      counter.inc();
      counter.inc();
      asserts.assertEquals(counter.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'COUNTER',
        labels: [],
        data: { no_label: 3 },
      });
    });

    it('should accept an explicit amount', () => {
      const counter = new Counter({ name: 'test_counter' });
      counter.inc(5);
      counter.inc(2, { route: '/users' });
      asserts.assertEquals(counter.toJSON().data, {
        no_label: 5,
        'route="/users"': 2,
      });
    });

    it('should reject a negative amount', () => {
      const counter = new Counter({ name: 'test_counter' });
      asserts.assertThrows(
        () => counter.inc(-1),
        Error,
        'Counter increment must be a non-negative finite number',
      );
    });

    it('should key per single-label value', () => {
      const counter = new Counter({ name: 'test_counter' });
      counter.inc({ label1: 'value1' });
      counter.inc({ label1: 'value1' });
      counter.inc({ label1: 'value2' });
      asserts.assertEquals(counter.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'COUNTER',
        labels: ['label1'],
        data: {
          'label1="value1"': 2,
          'label1="value2"': 1,
        },
      });
    });

    it('should key per multi-label combination', () => {
      const counter = new Counter({ name: 'test_counter' });
      counter.inc({ label1: 'value1', label2: 'value2' });
      counter.inc({ label1: 'value1', label2: 'value2' });
      counter.inc({ label1: 'value1', label2: 'value3' });
      asserts.assertEquals(counter.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'COUNTER',
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
      const counter = new Counter({ name: 'test_counter' });
      counter.inc({ label1: 'value1', label2: 'value2' });
      counter.inc({ label1: 'value1', label2: 'value2' });
      counter.inc({ label1: 'value1', label2: 'value3' });
      counter.inc();

      asserts.assertEquals(counter.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'COUNTER',
        labels: ['label1', 'label2'],
        data: {
          'label1="value1",label2="value2"': 2,
          'label1="value1",label2="value3"': 1,
          'no_label': 1,
        },
      });
      asserts.assertEquals(
        counter.toString(),
        '[type="COUNTER", name="test_counter", label1="value1",label2="value2"] 2\n[type="COUNTER", name="test_counter", label1="value1",label2="value3"] 1\n[type="COUNTER", name="test_counter"] 1',
      );
      asserts.assertEquals(
        counter.toPrometheus(),
        '# HELP test_counter \n# TYPE test_counter counter\ntest_counter{label1="value1",label2="value2"} 2\ntest_counter{label1="value1",label2="value3"} 1\ntest_counter 1\n',
      );
      asserts.assertEquals(counter.dump('JSON'), counter.toJSON());
      asserts.assertEquals(counter.dump('PROMETHEUS'), counter.toPrometheus());
      asserts.assertEquals(counter.dump('STRING'), counter.toString());
    });
  });

  describe('Label canonicalisation and escaping', () => {
    it('should produce the same key regardless of label entry order', () => {
      const counter = new Counter({ name: 'order_test' });
      counter.inc({ b: '2', a: '1' });
      counter.inc({ a: '1', b: '2' });
      asserts.assertEquals(counter.toJSON().data, { 'a="1",b="2"': 2 });
    });

    it('should escape backslash, double-quote, and newline in values', () => {
      const counter = new Counter({ name: 'escape_test' });
      counter.inc({ path: 'a"b\\c\nd' });
      const keys = Object.keys(counter.toJSON().data);
      asserts.assertEquals(keys, [String.raw`path="a\"b\\c\nd"`]);
    });
  });

  describe('reset() and remove()', () => {
    it('should drop all series with reset()', () => {
      const counter = new Counter({ name: 'reset_test' });
      counter.inc({ a: '1' });
      counter.inc({ a: '2' });
      counter.reset();
      asserts.assertEquals(counter.toJSON().data, {});
    });

    it('should drop a single series with remove(labels)', () => {
      const counter = new Counter({ name: 'remove_test' });
      counter.inc({ a: '1' });
      counter.inc({ a: '2' });
      asserts.assertEquals(counter.remove({ a: '1' }), true);
      asserts.assertEquals(Object.keys(counter.toJSON().data), ['a="2"']);
    });
  });
});
