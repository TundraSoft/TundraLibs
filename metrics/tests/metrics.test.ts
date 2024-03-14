import { assertEquals } from 'https://deno.land/std@0.205.0/assert/mod.ts';
import { Metrics, tick } from '../mod.ts';
import {
  afterEach,
  assert,
  assertGreater,
  assertGreaterOrEqual,
  describe,
  it,
} from '../../dev.dependencies.ts';

describe('Metrics', () => {
  const metrics = new Metrics();

  afterEach(() => {
    metrics.purge();
  });

  it('basic mark', () => {
    metrics.mark('test');
    // No stats must be available
    assertEquals(metrics.stats('test'), {
      count: 0,
      timing: { min: 0, max: 0, average: 0, last: 0 },
    });
    assertEquals(metrics.count('test'), 0);
    assertEquals(metrics.running().includes('test'), true);
    metrics.mark('test');
    assertEquals(metrics.count('test'), 1);
  });

  it('multiple marks on same mark', () => {
    metrics.mark('test');
    // No stats must be available
    assertEquals(metrics.stats('test'), {
      count: 0,
      timing: { min: 0, max: 0, average: 0, last: 0 },
    });
    assertEquals(metrics.count('test'), 0);
    metrics.mark('test'); // 1
    metrics.mark('test');
    metrics.mark('test'); // 2
    metrics.mark('test');
    metrics.mark('test'); // 3
    assertEquals(metrics.count('test'), 3);
    metrics.mark('test');
    assertEquals(metrics.count('test'), 3);
    metrics.mark('test');
    assertEquals(metrics.count('test'), 4);
    // console.log(metrics.all());
  });

  it('Test min, max and average', async () => {
    const fn = async () => {
      metrics.mark('test');
      await new Promise((resolve) => setTimeout(resolve, 500));
      metrics.mark('test');
    };
    while (metrics.count('test') != 10) {
      await fn();
    }
    const stats = metrics.stats('test');
    assert(stats);
    assertGreater(stats.timing.max, stats.timing.average);
    assertGreaterOrEqual(stats.timing.min, 500);
    assertEquals(stats.count, 10);
  });

  it('Test purge', async () => {
    const fn = async () => {
      metrics.mark('test');
      await new Promise((resolve) => setTimeout(resolve, 500));
      metrics.mark('test');
    };
    while (metrics.count('test') != 10) {
      await fn();
    }
    assertEquals(metrics.count('test'), 10);
    metrics.purge();
    assertEquals(metrics.count('test'), 0);
    assertEquals(metrics.all(), {});
  });

  it('Test decorator', async () => {
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
    assert(stats);
  });
});
