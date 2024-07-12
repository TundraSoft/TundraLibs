import { Counter, Gauge, MetroMan } from '../mod.ts';
import { asserts } from '../../dev.dependencies.ts';

Deno.test('Metrics > MetroMan', async (t) => {
  const metrics = new MetroMan();
  await t.step('Register instances and retrieve them', () => {
    const counter = new Counter({ name: 'counter', help: 'A counter metric' });
    const gauge = new Gauge({ name: 'gauge', help: 'A gauge metric' });
    metrics.register(counter, gauge);
    asserts.assertInstanceOf(metrics.get('counter'), Counter);
    asserts.assertInstanceOf(metrics.get('gauge'), Gauge);
  });

  await t.step('Retrieve non-existent metric', () => {
    asserts.assertThrows(
      () => {
        metrics.get('non_existent');
      },
      Error,
      "Metric 'non_existent' not found",
    );
  });

  await t.step('Collect metrics in different formats', () => {
    const counter = new Counter({ name: 'counter1', help: 'A counter metric' });
    const gauge = new Gauge({ name: 'gauge1', help: 'A gauge metric' });
    metrics.register(counter, gauge);
    counter.inc();
    gauge.set(10);
    const collected = metrics.collect('STRING');
    asserts.assert(collected.includes('counter'));
    asserts.assert(collected.includes('gauge'));
    // deno-lint-ignore no-prototype-builtins
    asserts.assert(metrics.collect('JSON').hasOwnProperty('counter1'));
    asserts.assert(metrics.collect('PROMETHEUS').includes('counter1'));
  });
});
