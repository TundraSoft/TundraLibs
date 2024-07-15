import { Histogram, type HistogramOptions } from '../mod.ts';
import { asserts } from '../../dev.dependencies.ts';

Deno.test('Metrics > Histogram', async (t) => {
  await t.step('Test invalid configuration', () => {
    asserts.assertThrows(
      () => {
        new Histogram(
          {
            name: 'test_counter',
            type: 'HISTOGRAM',
            buckets: ['sdf', 'sdf', 'sdf'],
          } as unknown as HistogramOptions,
        );
      },
      Error,
      'Histogram metric requires buckets to be defined',
    );
  });

  await t.step('Test incrementing a counter', () => {
    const counter = new Histogram({ name: 'test_counter' });
    counter.observe(1);
    counter.observe(1);
    counter.observe(5);
    counter.observe(10);
    asserts.assertEquals(counter.toJSON(), {
      name: 'test_counter',
      help: '',
      type: 'HISTOGRAM',
      labels: [],
      data: {
        no_label: {
          buckets: { '1': 2, '2': 2, '5': 3, '10': 4, '1.5': 2 },
          sum: 17,
        },
      },
    });
  });

  await t.step('Test incrementing a counter with labels', () => {
    const counter = new Histogram({ name: 'test_counter' });
    counter.observe(1, { label1: 'value1' });
    counter.observe(1, { label1: 'value1' });
    counter.observe(5, { label1: 'value2' });
    counter.observe(10, { label1: 'value2' });
    asserts.assertEquals(counter.toJSON(), {
      name: 'test_counter',
      help: '',
      type: 'HISTOGRAM',
      labels: ['label1'],
      data: {
        'label1="value1"': {
          buckets: { '1': 2, '2': 2, '5': 2, '10': 2, '1.5': 2 },
          sum: 2,
        },
        'label1="value2"': {
          buckets: { '1': 0, '2': 0, '5': 1, '10': 2, '1.5': 0 },
          sum: 15,
        },
      },
    });
  });

  await t.step('Test incrementing a counter with multiple labels', () => {
    const counter = new Histogram({ name: 'test_counter' });
    counter.observe(1, { label1: 'value1', label2: 'value2' });
    counter.observe(1, { label1: 'value1', label2: 'value2' });
    counter.observe(5, { label1: 'value1', label2: 'value3' });
    counter.observe(10, { label1: 'value1', label2: 'value3' });
    asserts.assertEquals(counter.toJSON(), {
      name: 'test_counter',
      help: '',
      type: 'HISTOGRAM',
      labels: ['label1', 'label2'],
      data: {
        'label1="value1",label2="value2"': {
          buckets: { '1': 2, '2': 2, '5': 2, '10': 2, '1.5': 2 },
          sum: 2,
        },
        'label1="value1",label2="value3"': {
          buckets: { '1': 0, '2': 0, '5': 1, '10': 2, '1.5': 0 },
          sum: 15,
        },
      },
    });
  });

  await t.step('Test generation of different output', () => {
    const counter = new Histogram({ name: 'test_counter' });
    counter.observe(1, { label1: 'value1', label2: 'value2' });
    counter.observe(1, { label1: 'value1', label2: 'value2' });
    counter.observe(5, { label1: 'value1', label2: 'value3' });
    counter.observe(10, { label1: 'value1', label2: 'value3' });
    counter.observe(10);
    asserts.assertEquals(counter.toJSON(), {
      name: 'test_counter',
      help: '',
      type: 'HISTOGRAM',
      labels: ['label1', 'label2'],
      data: {
        'label1="value1",label2="value2"': {
          buckets: { '1': 2, '2': 2, '5': 2, '10': 2, '1.5': 2 },
          sum: 2,
        },
        'label1="value1",label2="value3"': {
          buckets: { '1': 0, '2': 0, '5': 1, '10': 2, '1.5': 0 },
          sum: 15,
        },
        no_label: {
          buckets: { '1': 0, '2': 0, '5': 0, '10': 1, '1.5': 0 },
          sum: 10,
        },
      },
    });
    asserts.assertEquals(
      counter.toString(),
      '[type="HISTOGRAM", name="test_counter", label1="value1",label2="value2"] {"buckets":{"1":2,"2":2,"5":2,"10":2,"1.5":2},"sum":2}\n[type="HISTOGRAM", name="test_counter", label1="value1",label2="value3"] {"buckets":{"1":0,"2":0,"5":1,"10":2,"1.5":0},"sum":15}\n[type="HISTOGRAM", name="test_counter"] {"buckets":{"1":0,"2":0,"5":0,"10":1,"1.5":0},"sum":10}',
    );
    asserts.assertEquals(
      counter.toPrometheus(),
      '# HELP test_counter \n# TYPE test_counter HISTOGRAM\ntest_counter_bucket{label1="value1",label2="value2",le="1"} 2\ntest_counter_bucket{label1="value1",label2="value2",le="1.5"} 2\ntest_counter_bucket{label1="value1",label2="value2",le="2"} 2\ntest_counter_bucket{label1="value1",label2="value2",le="5"} 2\ntest_counter_bucket{label1="value1",label2="value2",le="10"} 2\ntest_counter_bucket{label1="value1",label2="value2",le="+Inf"} 2\ntest_counter_sum{label1="value1",label2="value2"} 2\ntest_counter_count{label1="value1",label2="value2"} 2\ntest_counter_bucket{label1="value1",label2="value3",le="1"} 0\ntest_counter_bucket{label1="value1",label2="value3",le="1.5"} 0\ntest_counter_bucket{label1="value1",label2="value3",le="2"} 0\ntest_counter_bucket{label1="value1",label2="value3",le="5"} 1\ntest_counter_bucket{label1="value1",label2="value3",le="10"} 2\ntest_counter_bucket{label1="value1",label2="value3",le="+Inf"} 2\ntest_counter_sum{label1="value1",label2="value3"} 15\ntest_counter_count{label1="value1",label2="value3"} 2\ntest_counter_bucket{le="1"} 0\ntest_counter_bucket{le="1.5"} 0\ntest_counter_bucket{le="2"} 0\ntest_counter_bucket{le="5"} 0\ntest_counter_bucket{le="10"} 1\ntest_counter_bucket{le="+Inf"} 1\ntest_counter_sum{} 10\ntest_counter_count{} 1',
    );
    asserts.assertEquals(
      counter.dump('JSON'),
      counter.toJSON(),
    );
    asserts.assertEquals(
      counter.dump('PROMETHEUS'),
      counter.toPrometheus(),
    );
    asserts.assertEquals(
      counter.dump('STRING'),
      counter.toString(),
    );
  });
});
