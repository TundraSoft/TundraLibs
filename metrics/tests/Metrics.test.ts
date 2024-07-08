import { asserts } from '../../dev.dependencies.ts';
import { Metrics, tick } from '../mod.ts';

Deno.test('Metrics', async (t) => {
  const metrics = new Metrics();

  await t.step('basic mark', () => {
    metrics.mark('test');
    // No stats must be available
    asserts.assertEquals(metrics.stats('test'), {
      count: 0,
      timing: { min: 0, max: 0, average: 0, last: 0 },
    });
    asserts.assertEquals(metrics.count('test'), 0);
    asserts.assertEquals(metrics.running().includes('test'), true);
    metrics.mark('test');
    asserts.assertEquals(metrics.count('test'), 1);
  });

  await t.step('multiple marks on same mark', () => {
    metrics.purge();
    metrics.mark('test');
    // No stats must be available
    asserts.assertEquals(metrics.stats('test'), {
      count: 0,
      timing: { min: 0, max: 0, average: 0, last: 0 },
    });
    asserts.assertEquals(metrics.count('test'), 0);
    metrics.mark('test'); // 1
    metrics.mark('test');
    metrics.mark('test'); // 2
    metrics.mark('test');
    metrics.mark('test'); // 3
    asserts.assertEquals(metrics.count('test'), 3);
    metrics.mark('test');
    asserts.assertEquals(metrics.count('test'), 3);
    metrics.mark('test');
    asserts.assertEquals(metrics.count('test'), 4);
    // console.log(metrics.all());
  });

  await t.step('Test min, max and average', async () => {
    metrics.purge();
    const fn = async () => {
      metrics.mark('test');
      await new Promise((resolve) => setTimeout(resolve, 500));
      metrics.mark('test');
    };
    while (metrics.count('test') != 10) {
      await fn();
    }
    const stats = metrics.stats('test');
    asserts.assert(stats);
    asserts.assertGreater(stats.timing.max, stats.timing.average);
    asserts.assertGreaterOrEqual(stats.timing.min, 500);
    asserts.assertEquals(stats.count, 10);
  });

  await t.step('Test purge', async () => {
    metrics.purge();
    const fn = async () => {
      metrics.mark('test');
      await new Promise((resolve) => setTimeout(resolve, 500));
      metrics.mark('test');
    };
    while (metrics.count('test') != 10) {
      await fn();
    }
    asserts.assertEquals(metrics.count('test'), 10);
    metrics.purge();
    asserts.assertEquals(metrics.count('test'), 0);
    asserts.assertEquals(metrics.all(), {});
  });

  await t.step('Test decorator', async () => {
    metrics.purge();
    class Test {
      @tick
      async test() {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const a = new Test();
    await a.test();
    await a.test();
    await a.test();
    const stats = metrics.stats('test::test');
    asserts.assert(stats);
  });
});
