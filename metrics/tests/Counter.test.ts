import { Counter, type CounterOptions } from '../mod.ts';
import { asserts } from '../../dev.dependencies.ts';

Deno.test('Metrics > Counter', async (t) => {
  await t.step('Test invalid configuration', () => {
    asserts.assertThrows(
      () => {
        new Counter({} as unknown as CounterOptions);
      },
      Error,
      'Metric must have a name',
    );
  });

  await t.step('Test incrementing a counter', () => {
    const counter = new Counter({ name: 'test_counter' });
    counter.inc();
    counter.inc();
    counter.inc();
    asserts.assertEquals(counter.toJSON(), {
      name: 'test_counter',
      help: '',
      type: 'COUNTER',
      labels: [],
      data: {
        no_label: 3,
      },
    });
  });

  await t.step('Test incrementing a counter with labels', () => {
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

  await t.step('Test incrementing a counter with multiple labels', () => {
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

  await t.step('Test generation of different output', () => {
    const counter = new Counter({ name: 'test_counter' });
    counter.inc({ label1: 'value1', label2: 'value2' });
    counter.inc({ label1: 'value1', label2: 'value2' });
    counter.inc({ label1: 'value1', label2: 'value3' });
    counter.inc();
    console.log(counter.toPrometheus());
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
      '# HELP test_counter \n# TYPE test_counter COUNTER\ntest_counter{label1="value1",label2="value2"} 2\ntest_counter{label1="value1",label2="value3"} 1\ntest_counter 1',
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
