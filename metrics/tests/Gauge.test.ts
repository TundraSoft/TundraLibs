import { Gauge, type GaugeOptions } from '../mod.ts';
import { asserts } from '../../dev.dependencies.ts';

Deno.test('Metrics > Gauge', async (t) => {
  await t.step('Test invalid configuration', () => {
    asserts.assertThrows(
      () => {
        new Gauge({} as unknown as GaugeOptions);
      },
      Error,
      'Metric must have a name',
    );
  });

  await t.step('Test incrementing a counter', () => {
    const counter = new Gauge({ name: 'test_counter' });
    counter.set(5);
    counter.inc();
    counter.inc();
    counter.inc();
    asserts.assertEquals(counter.toJSON(), {
      name: 'test_counter',
      help: '',
      type: 'GAUGE',
      labels: [],
      data: {
        no_label: 8,
      },
    });
    counter.dec();
    asserts.assertEquals(counter.toJSON(), {
      name: 'test_counter',
      help: '',
      type: 'GAUGE',
      labels: [],
      data: {
        no_label: 7,
      },
    });
  });

  await t.step('Test incrementing a counter with labels', () => {
    const counter = new Gauge({ name: 'test_counter' });
    counter.inc({ label1: 'value1' });
    counter.inc({ label1: 'value1' });
    counter.set(2, { label1: 'value2' });
    counter.inc({ label1: 'value2' });
    asserts.assertEquals(counter.toJSON(), {
      name: 'test_counter',
      help: '',
      type: 'GAUGE',
      labels: ['label1'],
      data: {
        'label1="value1"': 2,
        'label1="value2"': 3,
      },
    });
    counter.dec({ label1: 'value2' });
    asserts.assertEquals(counter.toJSON(), {
      name: 'test_counter',
      help: '',
      type: 'GAUGE',
      labels: ['label1'],
      data: {
        'label1="value1"': 2,
        'label1="value2"': 2,
      },
    });
  });

  await t.step('Test incrementing a counter with multiple labels', () => {
    const counter = new Gauge({ name: 'test_counter' });
    counter.inc({ label1: 'value1', label2: 'value2' });
    counter.inc({ label1: 'value1', label2: 'value2' });
    counter.inc({ label1: 'value1', label2: 'value3' });
    asserts.assertEquals(counter.toJSON(), {
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

  await t.step('Test generation of different output', () => {
    const counter = new Gauge({ name: 'test_counter' });
    counter.inc({ label1: 'value1', label2: 'value2' });
    counter.inc({ label1: 'value1', label2: 'value2' });
    counter.inc({ label1: 'value1', label2: 'value3' });
    counter.inc();
    asserts.assertEquals(counter.toJSON(), {
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
      counter.toString(),
      '[type="GAUGE", name="test_counter", label1="value1",label2="value2"] 2\n[type="GAUGE", name="test_counter", label1="value1",label2="value3"] 1\n[type="GAUGE", name="test_counter"] 1',
    );
    asserts.assertEquals(
      counter.toPrometheus(),
      '# HELP test_counter \n# TYPE test_counter GAUGE\ntest_counter{label1="value1",label2="value2"} 2\ntest_counter{label1="value1",label2="value3"} 1\ntest_counter 1',
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
