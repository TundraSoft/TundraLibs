/**
 * @fileoverview Tests for the package base error and derived errors.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { BaseError } from '@tundralibs/utils';
import {
  DuplicateMetricError,
  InvalidLabelError,
  InvalidMetricOptionsError,
  MetricNotFoundError,
  MetroManError,
} from './mod.ts';

describe('errors', () => {
  describe('MetroManError', () => {
    it('should be a subclass of BaseError and Error', () => {
      const err = new MetroManError('boom', { foo: 'bar' });
      asserts.assert(err instanceof MetroManError);
      asserts.assert(err instanceof BaseError);
      asserts.assert(err instanceof Error);
      asserts.assertEquals(err.name, 'MetroManError');
      asserts.assertEquals(err.message, 'boom');
      asserts.assertEquals(err.context.foo, 'bar');
    });
  });

  describe('InvalidMetricOptionsError', () => {
    it('should derive from MetroManError and carry `field` context', () => {
      const err = new InvalidMetricOptionsError('bad opts', { field: 'name' });
      asserts.assert(err instanceof InvalidMetricOptionsError);
      asserts.assert(err instanceof MetroManError);
      asserts.assertEquals(err.name, 'InvalidMetricOptionsError');
      asserts.assertEquals(err.context.field, 'name');
    });

    it('should accept an optional `metricType` for additional context', () => {
      const err = new InvalidMetricOptionsError('buckets bad', {
        field: 'buckets',
        metricType: 'HISTOGRAM',
      });
      asserts.assertEquals(err.context.metricType, 'HISTOGRAM');
    });
  });

  describe('MetricNotFoundError', () => {
    it('should derive from MetroManError and carry `name` context', () => {
      const err = new MetricNotFoundError("Metric 'foo' not found", {
        name: 'foo',
      });
      asserts.assert(err instanceof MetricNotFoundError);
      asserts.assert(err instanceof MetroManError);
      asserts.assertEquals(err.name, 'MetricNotFoundError');
      asserts.assertEquals(err.context.name, 'foo');
    });
  });

  describe('DuplicateMetricError', () => {
    it('should derive from MetroManError and carry `name` context', () => {
      const err = new DuplicateMetricError(
        "Metric 'foo' is already registered",
        {
          name: 'foo',
        },
      );
      asserts.assert(err instanceof DuplicateMetricError);
      asserts.assert(err instanceof MetroManError);
      asserts.assertEquals(err.context.name, 'foo');
    });
  });

  describe('InvalidLabelError', () => {
    it('should derive from MetroManError and carry reserved-label context', () => {
      const err = new InvalidLabelError("'le' is reserved", {
        label: 'le',
        reason: 'reserved',
        metricType: 'HISTOGRAM',
      });
      asserts.assert(err instanceof InvalidLabelError);
      asserts.assert(err instanceof MetroManError);
      asserts.assertEquals(err.context.label, 'le');
      asserts.assertEquals(err.context.metricType, 'HISTOGRAM');
    });
  });
});
