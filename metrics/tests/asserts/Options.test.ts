import { asserts } from '../../../dev.dependencies.ts';
import {
  assertCounterOptions,
  assertGaugeOptions,
  assertHistogramOptions,
  assertMetricOptions,
  assertSummaryOptions,
} from '../../asserts/mod.ts';

Deno.test('Metric > assert', async (t) => {
  await t.step('assertMetricOptions', () => {
    const good = { name: 'test', type: 'COUNTER' };
    const bad = { name: 'test', type: 'COUNTER', help: 1 };
    asserts.assertEquals(assertMetricOptions(good), true);
    asserts.assertEquals(assertMetricOptions(bad), false);
  });

  await t.step('assertCounterOptions', () => {
    const good = { name: 'test', type: 'COUNTER' };
    const bad = { name: 'test', type: 'GAUGE' };
    asserts.assertEquals(assertCounterOptions(good), true);
    asserts.assertEquals(assertCounterOptions(bad), false);
  });

  await t.step('assertGaugeOptions', () => {
    const good = { name: 'test', type: 'GAUGE' };
    const bad = { name: 'test', type: 'COUNTER' };
    asserts.assertEquals(assertGaugeOptions(good), true);
    asserts.assertEquals(assertGaugeOptions(bad), false);
  });

  await t.step('assertHistogramOptions', () => {
    const good = { name: 'test', type: 'HISTOGRAM', buckets: [1, 2, 3] };
    const bad = { name: 'test', type: 'HISTOGRAM' };
    const bad2 = { name: 'test', type: 'HISTOGRAM', buckets: ['c', 'f', 'g'] };
    asserts.assertEquals(assertHistogramOptions(good), true);
    asserts.assertEquals(assertHistogramOptions(bad), false);
    asserts.assertEquals(assertHistogramOptions(bad2), false);
  });

  await t.step('assertSummaryOptions', () => {
    const good = { name: 'test', type: 'SUMMARY', quantiles: [0.5, 0.9, 0.99] };
    const bad = { name: 'test', type: 'SUMMARY' };
    const bad2 = { name: 'test', type: 'SUMMARY', window: 0 };
    const bad3 = {
      name: 'test',
      type: 'SUMMARY',
      quantiles: [0.5, 0.9, 0.99],
      window: 100000,
    };
    const bad4 = {
      name: 'test',
      type: 'GAUGE',
      quantiles: { 0.5: 1, 0.9: 2, 0.99: 3 },
    };
    asserts.assertEquals(assertSummaryOptions(good), true);
    asserts.assertEquals(assertSummaryOptions(bad), false);
    asserts.assertEquals(assertSummaryOptions(bad2), false);
    asserts.assertEquals(assertSummaryOptions(bad3), false);
    asserts.assertEquals(assertSummaryOptions(bad4), false);
  });
});
