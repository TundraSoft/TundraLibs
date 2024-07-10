import { Events } from '../mod.ts';
import { asserts } from '../../dev.dependencies.ts';

const delay = (ms: number) =>
  new Promise<true>((resolve) => setTimeout(() => resolve(true), ms));

Deno.test('Events > Typed', async (t) => {
  let op: unknown[] = [],
    test: EventTester;
  //#region Typed Events
  type TestEvents = {
    event1(a: string, v: number): unknown;
  };

  class EventTester extends Events<TestEvents> {
    getEventCount(): number {
      return this._events.get('event1')?.size || 0;
    }
    run() {
      this.emit('event1', 'Run', 1);
    }
    runSync() {
      this.emitSync('event1', 'RunAsync', 0);
    }
  }

  function first(a: string) {
    op.push('1');
    return a + '1';
  }

  function second(a: string) {
    op.push('2');
    return a + '2';
  }

  async function third(a: string) {
    await delay(1000);
    op.push('3');
    return a + '3';
  }

  function fourth(a: string) {
    op.push('4');
    return a + '4';
  }

  function once(a: string) {
    op.push('once');
    return a + 'once';
  }

  await t.step({
    name: 'Call emit with no listeners',
    fn() {
      test = new EventTester();
      asserts.assertEquals(test.getEventCount(), 0);
      test.run();
    },
  });

  await t.step({
    name: 'Add new Events',
    fn() {
      test = new EventTester();
      asserts.assertEquals(test.getEventCount(), 0);
      test.on('event1', first);
      asserts.assertEquals(test.getEventCount(), 1);
    },
  });

  await t.step({
    name: 'Test if to ensure deletion/removal of specific events name',
    fn() {
      test = new EventTester();
      asserts.assertEquals(test.getEventCount(), 0);
      test.on('event1', first);
      test.on('event1', second);
      asserts.assertEquals(test.getEventCount(), 2);
      test.off('event1');
      asserts.assertEquals(test.getEventCount(), 0);
      test.on('event1', first);
      test.on('event1', second);
      asserts.assertEquals(test.getEventCount(), 2);
      test.off();
      asserts.assertEquals(test.getEventCount(), 0);
    },
  });
  await t.step({
    name: 'Test to ensure deletion of all callbacks in an event name',
    fn() {
      test = new EventTester();
      // Reset for test
      asserts.assertEquals(test.getEventCount(), 0);
      test.on('event1', first);
      test.on('event1', second);
      asserts.assertEquals(test.getEventCount(), 2);
      test.off('event1');
      asserts.assertEquals(test.getEventCount(), 0);
      test.on('event1', first);
      test.on('event1', second);
      asserts.assertEquals(test.getEventCount(), 2);
      test.off();
      asserts.assertEquals(test.getEventCount(), 0);
    },
  });

  await t.step({
    name:
      'Test to ensure removal (deletion) of all callbacks in all event name',
    fn() {
      test = new EventTester();
      asserts.assertEquals(test.getEventCount(), 0);
      test.on('event1', first);
      test.on('event1', second);
      asserts.assertEquals(test.getEventCount(), 2);
      test.off();
      asserts.assertEquals(test.getEventCount(), 0);
    },
  });

  await t.step({
    name: 'Test to ensure prevention of Duplicate callbacks in an event',
    fn() {
      const test = new EventTester();
      // Reset for test
      test.off();
      asserts.assertEquals(test.getEventCount(), 0);
      test.on('event1', first);
      asserts.assertEquals(test.getEventCount(), 1);
      test.on('event1', first);
      asserts.assertEquals(test.getEventCount(), 1);
    },
  });

  await t.step({
    name:
      'Test to ensure all callback with tagged as once is executed only one time',
    async fn() {
      const test = new EventTester();
      // Reset for test
      test.off();
      op = [];
      test.on('event1', first);
      test.once('event1', once);
      test.run();
      await delay(1000);
      test.run();
      asserts.assertEquals(op.join(','), '1,once,1');
    },
  });

  await t.step({
    name: 'Test to ensure removal of callbacks marked as once',
    fn() {
      const test = new EventTester();
      // Reset for test
      test.off();
      op = [];
      test.once('event1', once);
      asserts.assertEquals(test.getEventCount(), 1);
      test.off('event1', once);
      asserts.assertEquals(test.getEventCount(), 0);
    },
  });

  await t.step({
    name:
      'Run All callbacks in an event waiting for each callback to finish executing/return value',
    async fn() {
      const test = new EventTester();
      op = [];
      test.on('event1', first);
      test.on('event1', second);
      test.on('event1', third);
      test.once('event1', fourth);
      test.runSync();
      await delay(2000);
      asserts.assertEquals(op.join(','), '1,2,3,4');
    },
  });

  await t.step({
    name:
      'Run all callbacks in an event without waiting for each callback to finish executing/return value',
    async fn() {
      const test = new EventTester();
      op = [];
      test.on('event1', first);
      test.on('event1', second);
      test.on('event1', third);
      test.once('event1', fourth);
      test.run();
      await delay(2000);
      asserts.assertEquals(op.join(','), '1,2,4,3');
    },
  });

  await t.step('Test array of events', () => {
    const test = new EventTester();
    test.on('event1', [first, second]);
    test.once('event1', [third, fourth]);
    asserts.assertEquals(test.getEventCount(), 4);
    test.off('event1', [first, second]);
    asserts.assertEquals(test.getEventCount(), 2);
  });

  await t.step('Test emitSync with an event throwing an error', () => {
    const test = new EventTester();
    test.on('event1', () => {
      throw new Error('Error');
    });
    test.runSync();
  });
});

Deno.test('Events > UnTyped', async (t) => {
  let op: unknown[] = [],
    test: EventTester;
  //#region Typed Events

  class EventTester extends Events {
    getEventCount(): number {
      return this._events.get('event1')?.size || 0;
    }
    run() {
      this.emit('event1', 'Run', 1);
    }
    runSync() {
      this.emitSync('event1', 'RunAsync', 0);
    }
  }

  function first(a: string) {
    op.push('1');
    return a + '1';
  }

  function second(a: string) {
    op.push('2');
    return a + '2';
  }

  async function third(a: string) {
    await delay(1000);
    op.push('3');
    return a + '3';
  }

  function fourth(a: string) {
    op.push('4');
    return a + '4';
  }

  function once(a: string) {
    op.push('once');
    return a + 'once';
  }

  await t.step({
    name: 'Call emit with no listeners',
    fn() {
      test = new EventTester();
      asserts.assertEquals(test.getEventCount(), 0);
      test.run();
    },
  });

  await t.step({
    name: 'Add new Events',
    fn() {
      test = new EventTester();
      asserts.assertEquals(test.getEventCount(), 0);
      test.on('event1', first);
      asserts.assertEquals(test.getEventCount(), 1);
    },
  });

  await t.step({
    name: 'Test if to ensure deletion/removal of specific events name',
    fn() {
      test = new EventTester();
      asserts.assertEquals(test.getEventCount(), 0);
      test.on('event1', first);
      test.on('event1', second);
      asserts.assertEquals(test.getEventCount(), 2);
      test.off('event1');
      asserts.assertEquals(test.getEventCount(), 0);
      test.on('event1', first);
      test.on('event1', second);
      asserts.assertEquals(test.getEventCount(), 2);
      test.off();
      asserts.assertEquals(test.getEventCount(), 0);
    },
  });

  await t.step({
    name: 'Test to ensure deletion of all callbacks in an event name',
    fn() {
      test = new EventTester();
      // Reset for test
      asserts.assertEquals(test.getEventCount(), 0);
      test.on('event1', first);
      test.on('event1', second);
      asserts.assertEquals(test.getEventCount(), 2);
      test.off('event1');
      asserts.assertEquals(test.getEventCount(), 0);
      test.on('event1', first);
      test.on('event1', second);
      asserts.assertEquals(test.getEventCount(), 2);
      test.off();
      asserts.assertEquals(test.getEventCount(), 0);
    },
  });

  await t.step({
    name:
      'Test to ensure removal (deletion) of all callbacks in all event name',
    fn() {
      test = new EventTester();
      asserts.assertEquals(test.getEventCount(), 0);
      test.on('event1', first);
      test.on('event1', second);
      asserts.assertEquals(test.getEventCount(), 2);
      test.off();
      asserts.assertEquals(test.getEventCount(), 0);
    },
  });

  await t.step({
    name: 'Test to ensure prevention of Duplicate callbacks in an event',
    fn() {
      test = new EventTester();
      // Reset for test
      test.off();
      asserts.assertEquals(test.getEventCount(), 0);
      test.on('event1', first);
      asserts.assertEquals(test.getEventCount(), 1);
      test.on('event1', first);
      asserts.assertEquals(test.getEventCount(), 1);
    },
  });

  await t.step({
    name:
      'Test to ensure all callback with tagged as once is executed only one time',
    async fn() {
      test = new EventTester();
      // Reset for test
      test.off();
      op = [];
      test.on('event1', first);
      test.once('event1', once);
      test.run();
      await delay(1000);
      test.run();
      asserts.assertEquals(op.join(','), '1,once,1');
    },
  });

  await t.step({
    name: 'Test to ensure removal of callbacks marked as once',
    fn() {
      test = new EventTester();
      // Reset for test
      test.off();
      op = [];
      test.once('event1', once);
      asserts.assertEquals(test.getEventCount(), 1);
      test.off('event1', once);
      asserts.assertEquals(test.getEventCount(), 0);
    },
  });

  await t.step({
    name:
      'Run All callbacks in an event waiting for each callback to finish executing/return value',
    async fn() {
      test = new EventTester();
      op = [];
      test.on('event1', first);
      test.on('event1', second);
      test.on('event1', third);
      test.once('event1', fourth);
      test.runSync();
      await delay(2000);
      asserts.assertEquals(op.join(','), '1,2,3,4');
    },
  });

  await t.step({
    name:
      'Run all callbacks in an event without waiting for each callback to finish executing/return value',
    async fn() {
      test = new EventTester();
      op = [];
      test.on('event1', first);
      test.on('event1', second);
      test.on('event1', third);
      test.on('event1', fourth);
      test.run();
      await delay(2000);
      asserts.assertEquals(op.join(','), '1,2,4,3');
    },
  });

  await t.step('Test array of events', () => {
    const test = new EventTester();
    test.on('event1', [first, second]);
    test.once('event1', [third, fourth]);
    asserts.assertEquals(test.getEventCount(), 4);
    test.off('event1', [first, second]);
    asserts.assertEquals(test.getEventCount(), 2);
  });

  await t.step('Test emitSync with an event throwing an error', () => {
    const test = new EventTester();
    test.on('event1', () => {
      throw new Error('Error');
    });
    test.runSync();
  });
});
