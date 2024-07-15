import { Summary, type SummaryOptions } from '../mod.ts';
import { asserts } from '../../dev.dependencies.ts';

Deno.test('Metrics > Summary', async (t) => {
  await t.step('Test invalid configuration', () => {
    asserts.assertThrows(
      () => {
        new Summary(
          {
            name: 'test_counter',
            quantiles: ['sdf', 'sdf', 'sdf'],
          } as unknown as SummaryOptions,
        );
      },
      Error,
      'Summary metric requires quantiles to be defined',
    );

    asserts.assertThrows(
      () => {
        new Summary(
          { name: 'test_counter', window: 0 } as unknown as SummaryOptions,
        );
      },
      Error,
      'Summary metric window must be between 1 and 600 seconds',
    );

    asserts.assertThrows(
      () => {
        new Summary(
          { name: 'test_counter', window: 700 } as unknown as SummaryOptions,
        );
      },
      Error,
      'Summary metric window must be between 1 and 600 seconds',
    );
  });

  await t.step('Test incrementing a counter', () => {
    const counter = new Summary({ name: 'test_counter' });
    counter.observe(10);
    counter.observe(20);
    counter.observe(30);
    asserts.assertEquals(counter.toJSON(), {
      name: 'test_counter',
      help: '',
      type: 'SUMMARY',
      labels: [],
      data: {
        no_label: {
          quantile: { '0.5': 20, '0.9': 44, '0.99': 49.4 },
          count: 3,
          sum: 60,
        },
      },
    });
  });

  await t.step('Test incrementing a counter with labels', () => {
    const counter = new Summary({ name: 'test_counter' });
    counter.observe(10, { label1: 'value1' });
    counter.observe(20, { label1: 'value1' });
    counter.observe(30, { label1: 'value2' });
    asserts.assertEquals(counter.toJSON(), {
      name: 'test_counter',
      help: '',
      type: 'SUMMARY',
      labels: ['label1'],
      data: {
        'label1="value1"': {
          quantile: { '0.5': 20, '0.9': 28, '0.99': 29.8 },
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

  await t.step('Test incrementing a counter with multiple labels', () => {
    const counter = new Summary({ name: 'test_counter' });
    counter.observe(10, { label1: 'value1', label2: 'value2' });
    counter.observe(20, { label1: 'value1', label2: 'value2' });
    counter.observe(10, { label1: 'value1', label2: 'value3' });
    counter.observe(30, { label1: 'value1', label2: 'value3' });
    asserts.assertEquals(counter.toJSON(), {
      name: 'test_counter',
      help: '',
      type: 'SUMMARY',
      labels: ['label1', 'label2'],
      data: {
        'label1="value1",label2="value2"': {
          quantile: { '0.5': 20, '0.9': 28, '0.99': 29.8 },
          count: 2,
          sum: 30,
        },
        'label1="value1",label2="value3"': {
          quantile: { '0.5': 25, '0.9': 37, '0.99': 39.7 },
          count: 2,
          sum: 40,
        },
      },
    });
  });

  await t.step('Test window', async () => {
    const counter = new Summary({
      name: 'test_counter',
      window: 1,
    });
    counter.observe(10, { label1: 'value1', label2: 'value2' });
    counter.observe(20, { label1: 'value1', label2: 'value2' });
    counter.observe(10, { label1: 'value1', label2: 'value3' });
    asserts.assertEquals(counter.toJSON(), {
      name: 'test_counter',
      help: '',
      type: 'SUMMARY',
      labels: ['label1', 'label2'],
      data: {
        'label1="value1",label2="value2"': {
          quantile: { '0.5': 20, '0.9': 28, '0.99': 29.8 },
          count: 2,
          sum: 30,
        },
        'label1="value1",label2="value3"': {
          quantile: { '0.5': 10, '0.9': 10, '0.99': 10 },
          count: 1,
          sum: 10,
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 2000)).then(() => {
      counter.observe(30, { label1: 'value1', label2: 'value3' });
      asserts.assertEquals(counter.toJSON(), {
        name: 'test_counter',
        help: '',
        type: 'SUMMARY',
        labels: ['label1', 'label2'],
        data: {
          'label1="value1",label2="value2"': {
            quantile: { '0.5': NaN, '0.9': NaN, '0.99': NaN },
            count: 0,
            sum: 0,
          },
          'label1="value1",label2="value3"': {
            quantile: { '0.5': 30, '0.9': 30, '0.99': 30 },
            count: 1,
            sum: 30,
          },
        },
      });
    });
  });

  await t.step('Test generation of different output', () => {
    const counter = new Summary({ name: 'test_counter' });
    counter.observe(1, { label1: 'value1', label2: 'value2' });
    counter.observe(1, { label1: 'value1', label2: 'value2' });
    counter.observe(5, { label1: 'value1', label2: 'value3' });
    counter.observe(10, { label1: 'value1', label2: 'value3' });
    counter.observe(10);
    asserts.assertEquals(counter.toJSON(), {
      name: 'test_counter',
      help: '',
      type: 'SUMMARY',
      labels: ['label1', 'label2'],
      data: {
        'label1="value1",label2="value2"': {
          quantile: { '0.5': 1.5, '0.9': 1.9, '0.99': 1.99 },
          count: 2,
          sum: 2,
        },
        'label1="value1",label2="value3"': {
          quantile: { '0.5': 10, '0.9': 14, '0.99': 14.9 },
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
    asserts.assertEquals(
      counter.toString(),
      '[type="SUMMARY", name="test_counter", label1="value1",label2="value2"] {"quantile":{"0.5":1.5,"0.9":1.9,"0.99":1.99},"count":2,"sum":2}\n[type="SUMMARY", name="test_counter", label1="value1",label2="value3"] {"quantile":{"0.5":10,"0.9":14,"0.99":14.9},"count":2,"sum":15}\n[type="SUMMARY", name="test_counter"] {"quantile":{"0.5":10,"0.9":10,"0.99":10},"count":1,"sum":10}',
    );
    asserts.assertEquals(
      counter.toPrometheus(),
      '# HELP test_counter \n# TYPE test_counter SUMMARY\ntest_counter{label1="value1",label2="value2",quantile="0.5"} 1.5\ntest_counter{label1="value1",label2="value2",quantile="0.9"} 1.9\ntest_counter{label1="value1",label2="value2",quantile="0.99"} 1.99\ntest_counter_sum{label1="value1",label2="value2"} 2\ntest_counter_count{label1="value1",label2="value2"} 2\ntest_counter{label1="value1",label2="value3",quantile="0.5"} 10\ntest_counter{label1="value1",label2="value3",quantile="0.9"} 14\ntest_counter{label1="value1",label2="value3",quantile="0.99"} 14.9\ntest_counter_sum{label1="value1",label2="value3"} 15\ntest_counter_count{label1="value1",label2="value3"} 2\ntest_counter{quantile="0.5"} 10\ntest_counter{quantile="0.9"} 10\ntest_counter{quantile="0.99"} 10\ntest_counter_sum{} 10\ntest_counter_count{} 1',
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
