import { Events } from '../Events.ts';
import {
  afterEach,
  assertEquals,
  beforeEach,
  describe,
  it,
} from '../../dev.dependencies.ts';

const delay = (ms: number) =>
  new Promise<true>((resolve) => setTimeout(() => resolve(true), ms));

/**
 * Typed events
 */
describe(`[library='Events' mode='typed']`, () => {
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

  beforeEach(() => {
    test = new EventTester();
  }),
    it({
      name: 'Add new Events',
      fn() {
        assertEquals(test.getEventCount(), 0);
        test.on('event1', first);
        assertEquals(test.getEventCount(), 1);
      },
    }),
    it({
      name: 'Test if to ensure deletion/removal of specific events name',
      fn() {
        assertEquals(test.getEventCount(), 0);
        test.on('event1', first);
        test.on('event1', second);
        assertEquals(test.getEventCount(), 2);
        test.off('event1');
        assertEquals(test.getEventCount(), 0);
        test.on('event1', first);
        test.on('event1', second);
        assertEquals(test.getEventCount(), 2);
        test.off();
        assertEquals(test.getEventCount(), 0);
      },
    }),
    it({
      name: 'Test to ensure deletion of all callbacks in an event name',
      fn() {
        // Reset for test
        assertEquals(test.getEventCount(), 0);
        test.on('event1', first);
        test.on('event1', second);
        assertEquals(test.getEventCount(), 2);
        test.off('event1');
        assertEquals(test.getEventCount(), 0);
        test.on('event1', first);
        test.on('event1', second);
        assertEquals(test.getEventCount(), 2);
        test.off();
        assertEquals(test.getEventCount(), 0);
      },
    }),
    it({
      name:
        'Test to ensure removal (deletion) of all callbacks in all event name',
      fn() {
        assertEquals(test.getEventCount(), 0);
        test.on('event1', first);
        test.on('event1', second);
        assertEquals(test.getEventCount(), 2);
        test.off();
        assertEquals(test.getEventCount(), 0);
      },
    }),
    it({
      name: 'Test to ensure prevention of Duplicate callbacks in an event',
      fn() {
        // Reset for test
        test.off();
        assertEquals(test.getEventCount(), 0);
        test.on('event1', first);
        assertEquals(test.getEventCount(), 1);
        test.on('event1', first);
        assertEquals(test.getEventCount(), 1);
      },
    }),
    it({
      name:
        'Test to ensure all callback with tagged as once is executed only one time',
      async fn() {
        // Reset for test
        test.off();
        op = [];
        test.on('event1', first);
        test.once('event1', once);
        test.run();
        await delay(1000);
        test.run();
        assertEquals(op.join(','), '1,once,1');
      },
    }),
    it({
      name: 'Test to ensure removal of callbacks marked as once',
      fn() {
        // Reset for test
        test.off();
        op = [];
        test.once('event1', once);
        assertEquals(test.getEventCount(), 1);
        test.off('event1', once);
        assertEquals(test.getEventCount(), 0);
      },
    }),
    it({
      name:
        'Run All callbacks in an event waiting for each callback to finish executing/return value',
      async fn() {
        op = [];
        test.on('event1', first);
        test.on('event1', second);
        test.on('event1', third);
        test.on('event1', fourth);
        test.runSync();
        await delay(2000);
        assertEquals(op.join(','), '1,2,3,4');
      },
    }),
    it({
      name:
        'Run all callbacks in an event without waiting for each callback to finish executing/return value',
      async fn() {
        op = [];
        test.on('event1', first);
        test.on('event1', second);
        test.on('event1', third);
        test.on('event1', fourth);
        test.run();
        await delay(2000);
        assertEquals(op.join(','), '1,2,4,3');
      },
    });
});

/**
 * UnTyped events
 */
describe(`[library='Events' mode='untyped']`, () => {
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

  beforeEach(() => {
    test = new EventTester();
  }),
    it({
      name: 'Add new Events',
      fn() {
        assertEquals(test.getEventCount(), 0);
        test.on('event1', first);
        assertEquals(test.getEventCount(), 1);
      },
    }),
    it({
      name: 'Test if to ensure deletion/removal of specific events name',
      fn() {
        assertEquals(test.getEventCount(), 0);
        test.on('event1', first);
        test.on('event1', second);
        assertEquals(test.getEventCount(), 2);
        test.off('event1');
        assertEquals(test.getEventCount(), 0);
        test.on('event1', first);
        test.on('event1', second);
        assertEquals(test.getEventCount(), 2);
        test.off();
        assertEquals(test.getEventCount(), 0);
      },
    }),
    it({
      name: 'Test to ensure deletion of all callbacks in an event name',
      fn() {
        // Reset for test
        assertEquals(test.getEventCount(), 0);
        test.on('event1', first);
        test.on('event1', second);
        assertEquals(test.getEventCount(), 2);
        test.off('event1');
        assertEquals(test.getEventCount(), 0);
        test.on('event1', first);
        test.on('event1', second);
        assertEquals(test.getEventCount(), 2);
        test.off();
        assertEquals(test.getEventCount(), 0);
      },
    }),
    it({
      name:
        'Test to ensure removal (deletion) of all callbacks in all event name',
      fn() {
        assertEquals(test.getEventCount(), 0);
        test.on('event1', first);
        test.on('event1', second);
        assertEquals(test.getEventCount(), 2);
        test.off();
        assertEquals(test.getEventCount(), 0);
      },
    }),
    it({
      name: 'Test to ensure prevention of Duplicate callbacks in an event',
      fn() {
        // Reset for test
        test.off();
        assertEquals(test.getEventCount(), 0);
        test.on('event1', first);
        assertEquals(test.getEventCount(), 1);
        test.on('event1', first);
        assertEquals(test.getEventCount(), 1);
      },
    }),
    it({
      name:
        'Test to ensure all callback with tagged as once is executed only one time',
      async fn() {
        // Reset for test
        test.off();
        op = [];
        test.on('event1', first);
        test.once('event1', once);
        test.run();
        await delay(1000);
        test.run();
        assertEquals(op.join(','), '1,once,1');
      },
    }),
    it({
      name: 'Test to ensure removal of callbacks marked as once',
      fn() {
        // Reset for test
        test.off();
        op = [];
        test.once('event1', once);
        assertEquals(test.getEventCount(), 1);
        test.off('event1', once);
        assertEquals(test.getEventCount(), 0);
      },
    }),
    it({
      name:
        'Run All callbacks in an event waiting for each callback to finish executing/return value',
      async fn() {
        op = [];
        test.on('event1', first);
        test.on('event1', second);
        test.on('event1', third);
        test.on('event1', fourth);
        test.runSync();
        await delay(2000);
        assertEquals(op.join(','), '1,2,3,4');
      },
    }),
    it({
      name:
        'Run all callbacks in an event without waiting for each callback to finish executing/return value',
      async fn() {
        op = [];
        test.on('event1', first);
        test.on('event1', second);
        test.on('event1', third);
        test.on('event1', fourth);
        test.run();
        await delay(2000);
        assertEquals(op.join(','), '1,2,4,3');
      },
    });
});

// Path: events/tests/Events.test.ts
