import { Events } from './Events.ts';
import { assertEquals } from '../dev.dependencies.ts';

const delay = (ms: number) =>
  new Promise<true>((resolve) => setTimeout(() => resolve(true), ms));
let op: unknown[] = [];
//#region Typed Events
type TestEvents = {
  event1(a: string): unknown;
};

class EventTester extends Events<TestEvents> {
  getEventCount(): number {
    return this._events.get('event1')?.size || 0;
  }
  run() {
    this.emit('event1', 'Run');
  }
  runSync() {
    this.emitSync('event1', 'RunAsync');
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

const test: EventTester = new EventTester();

/**
 * Test to ensure addition events (Typed)
 */
Deno.test({
  name: 'Test to ensure addition events (Typed)',
  fn() {
    // Reset for test
    test.off();
    assertEquals(test.getEventCount(), 0);
    test.on('event1', first);
    assertEquals(test.getEventCount(), 1);
  },
});

/**
 * Test if to ensure deletion/removal of specific events name (Typed)
 */
Deno.test({
  name: 'Test if to ensure deletion/removal of specific events name (Typed)',
  fn() {
    // Reset for test
    test.off();
    assertEquals(test.getEventCount(), 0);
    test.on('event1', first);
    assertEquals(test.getEventCount(), 1);
    test.off('event1', first);
    assertEquals(test.getEventCount(), 0);
  },
});

/**
 * Test to ensure deletion of all callbacks in an event name (Typed)
 */
Deno.test({
  name: 'Test to ensure deletion of all callbacks in an event name (Typed)',
  fn() {
    // Reset for test
    test.off();
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
});

/**
 * Test to ensure removal (deletion) of all callbacks in all event name (Typed)
 */
Deno.test({
  name:
    'Test to ensure removal (deletion) of all callbacks in all event name (Typed)',
  fn() {
    // Reset for test
    test.off();
    assertEquals(test.getEventCount(), 0);
    test.on('event1', first);
    test.on('event1', second);
    assertEquals(test.getEventCount(), 2);
    test.off();
    assertEquals(test.getEventCount(), 0);
  },
});

/**
 * Test to ensure prevention of Duplicate callbacks in an event (Typed)
 */
Deno.test({
  name: 'Test to ensure prevention of Duplicate callbacks in an event (Typed)',
  fn() {
    // Reset for test
    test.off();
    assertEquals(test.getEventCount(), 0);
    test.on('event1', first);
    assertEquals(test.getEventCount(), 1);
    test.on('event1', first);
    assertEquals(test.getEventCount(), 1);
  },
});

/**
 * Test to ensure all callback with tagged as once is executed only one time (Typed)
 */
Deno.test({
  name:
    'Test to ensure all callback with tagged as once is executed only one time (Typed)',
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
});

/**
 * Test to ensure removal of callbacks marked as once (Typed)
 */
Deno.test({
  name: 'Test to ensure removal of callbacks marked as once (Typed)',
  fn() {
    // Reset for test
    test.off();
    op = [];
    test.once('event1', once);
    assertEquals(test.getEventCount(), 1);
    test.off('event1', once);
    assertEquals(test.getEventCount(), 0);
  },
});

/**
 * Run All callbacks in an event waiting for each callback to finish executing/return value (Typed)
 */
Deno.test({
  name:
    'Run All callbacks in an event waiting for each callback to finish executing/return value (Typed)',
  async fn() {
    op = [];
    test.on('event1', first);
    test.on('event1', second);
    test.on('event1', third);
    test.on('event1', fourth);
    test.runSync();
    await delay(2000);
    assertEquals(op.join(','), '1,2,4,3');
  },
});

/**
 * Run all callbacks in an event without waiting for each callback to finish executing/return value (Typed)
 */
Deno.test({
  name:
    'Run all callbacks in an event without waiting for each callback to finish executing/return value (Typed)',
  async fn() {
    op = [];
    test.on('event1', first);
    test.on('event1', second);
    test.on('event1', third);
    test.on('event1', fourth);
    test.run();
    await delay(2000);
    assertEquals(op.join(','), '1,2,3,4');
  },
});

// //#endregion Typed Event

//#region UnTyped Events
class EventTester2 extends Events {
  getEventCount(): number {
    return this._events.get('event1')?.size || 0;
  }
  run() {
    this.emit('event1', 'Run');
  }
  runSync() {
    this.emitSync('event1', 'RunAsync');
  }
}

const test2: EventTester2 = new EventTester2();

/**
 * Test if to ensure d eitionvents (UnTyped)
 */
Deno.test({
  name: 'Test if to ensure d eitionvents (UnTyped)',
  fn() {
    // Reset for test
    test2.off();
    assertEquals(test2.getEventCount(), 0);
    test2.on('event1', first);
    assertEquals(test2.getEventCount(), 1);
  },
});

/**
 * Test if to ensure deletion/removal of specific callback in event name (UnTyped)
 */
Deno.test({
  name:
    'Test if to ensure deletion/removal of specific callback in event name (UnTyped)',
  fn() {
    // Reset for test
    test2.off();
    assertEquals(test2.getEventCount(), 0);
    test2.on('event1', first);
    assertEquals(test2.getEventCount(), 1);
    test2.off('event1', first);
    assertEquals(test2.getEventCount(), 0);
  },
});

/**
 * Test to ensure deletion of all callbacks in an event name (UnTyped)
 */
Deno.test({
  name: 'Test to ensure deletion of all callbacks in an event name (UnTyped)',
  fn() {
    // Reset for test
    test2.off();
    assertEquals(test2.getEventCount(), 0);
    test2.on('event1', first);
    test2.on('event1', second);
    assertEquals(test2.getEventCount(), 2);
    test2.off('event1');
    assertEquals(test2.getEventCount(), 0);
    test2.on('event1', first);
    test2.on('event1', second);
    assertEquals(test2.getEventCount(), 2);
    test2.off();
    assertEquals(test2.getEventCount(), 0);
  },
});

/**
 * Test to ensure removal (deletion) of all callbacks in all events (UnTyped)
 */
Deno.test({
  name:
    'Test to ensure removal (deletion) of all callbacks in all events (UnTyped)',
  fn() {
    // Reset for test
    test2.off();
    assertEquals(test2.getEventCount(), 0);
    test2.on('event1', first);
    test2.on('event1', second);
    assertEquals(test2.getEventCount(), 2);
    test2.off();
    assertEquals(test2.getEventCount(), 0);
  },
});

/**
 * Test to ensure prevention of Duplicate callbacks in an event (UnTyped)
 */
Deno.test({
  name:
    'Test to ensure prevention of Duplicate callbacks in an event (UnTyped)',
  fn() {
    // Reset for test
    test2.off();
    assertEquals(test2.getEventCount(), 0);
    test2.on('event1', first);
    assertEquals(test2.getEventCount(), 1);
    test2.on('event1', first);
    assertEquals(test2.getEventCount(), 1);
  },
});

/**
 * Test to ensure all callback with tagged as once is executed only one time (UnTyped)
 */
Deno.test({
  name:
    'Test to ensure all callback with tagged as once is executed only one time (UnTyped)',
  async fn() {
    // Reset for test
    test2.off();
    op = [];
    test2.on('event1', first);
    test2.once('event1', once);
    test2.run();
    await delay(1000);
    test2.run();
    assertEquals(op.join(','), '1,once,1');
  },
});

/**
 * Test to ensure removal of callbacks marked as once (UnTyped)
 */
Deno.test({
  name: 'Test to ensure removal of callbacks marked as once (UnTyped)',
  fn() {
    // Reset for test
    test2.off();
    op = [];
    test2.once('event1', once);
    assertEquals(test2.getEventCount(), 1);
    test2.off('event1', once);
    assertEquals(test2.getEventCount(), 0);
  },
});

/**
 * Run All callbacks in an event waiting for each callback to finish executing/return value (Typed)
 */
Deno.test({
  name:
    'Run All callbacks in an event waiting for each callback to finish executing/return value (Typed)',
  async fn() {
    op = [];
    test2.on('event1', first);
    test2.on('event1', second);
    test2.on('event1', third);
    test2.on('event1', fourth);
    test2.runSync();
    await delay(2000);
    assertEquals(op.join(','), '1,2,4,3');
  },
});

/**
 * Run all callbacks in an event without waiting for each callback to finish executing/return value (UnTyped)
 */
Deno.test({
  name:
    'Run all callbacks in an event without waiting for each callback to finish executing/return value (UnTyped)',
  async fn() {
    op = [];
    test2.on('event1', first);
    test2.on('event1', second);
    test2.on('event1', third);
    test2.on('event1', fourth);
    test2.run();
    await delay(2000);
    assertEquals(op.join(','), '1,2,3,4');
  },
});

//#endregion UnTyped Events
