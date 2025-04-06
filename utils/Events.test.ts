import * as asserts from '$asserts';
import { Events } from './Events.ts';

// Helper function to create a delayed function
const createDelayedFunction = (delay: number, callback: () => void) => {
  return async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    callback();
  };
};

Deno.test('utils.Events', async (t) => {
  await t.step('should register and emit untyped events', () => {
    let cnt = 0;
    const events = new Events();
    const cb = (_name: string) => cnt++;
    events.on('hello', cb);
    events.emit('hello', 'world');
    asserts.assertEquals(cnt, 1);
  });

  await t.step('should register and emit typed events', () => {
    type EventMap = {
      greet: (name: string) => void;
    };
    let cnt = 0;
    const events = new Events<EventMap>();
    const cb = (_name: string) => cnt += 2;
    events.on('greet', cb);
    events.emit('greet', 'world');
    asserts.assertEquals(cnt, 2);
  });

  await t.step(
    'should not wait for async callbacks when using emit',
    async () => {
      const events = new Events();
      let cnt = 0;

      // Create callbacks that increment counter after a delay
      const callback1 = createDelayedFunction(100, () => cnt++);
      const callback2 = createDelayedFunction(100, () => cnt++);

      events.on('hello', [callback1, callback2]);

      // emit should return immediately without waiting
      events.emit('hello', 'world');
      asserts.assertEquals(
        cnt,
        0,
        "Counter should still be 0 as callbacks haven't completed yet",
      );

      // Wait for callbacks to complete
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      asserts.assertEquals(
        cnt,
        2,
        'Both callbacks should have executed after waiting',
      );
    },
  );

  await t.step(
    'should register and emit async events synchronously',
    async () => {
      const events = new Events();
      let cnt = 3;
      let timer1: ReturnType<typeof setTimeout> | undefined;
      const cb = async (_name: string) => {
        // Delay
        await new Promise((resolve) => {
          timer1 = setTimeout(resolve, 250);
        });
        cnt++;
      };
      let timer2: ReturnType<typeof setTimeout> | undefined;
      const cb2 = async (_name: string) => {
        // Delay
        await new Promise((resolve) => {
          timer2 = setTimeout(resolve, 250);
        });
        cnt++;
      };
      events.on('hello', [cb, cb2]);
      await events.emitSync('hello', 'world');
      asserts.assertEquals(cnt, 5);

      // Clear timeouts safely
      if (timer1) clearTimeout(timer1);
      if (timer2) clearTimeout(timer2);
    },
  );

  await t.step('should unregister specific event listeners', () => {
    let cnt = 0;
    const events = new Events();
    const cb = (_name: string) => cnt++;
    const cb2 = (_name: string) => cnt++;
    const cb3 = (_name: string) => cnt++;
    events.on('hello', [cb, cb2, cb3]);
    events.off('hello', cb);
    events.emit('hello', 'world');
    asserts.assertEquals(cnt, 2);
  });

  await t.step('should unregister all event listeners', () => {
    let cnt = 0;
    const events = new Events();
    const cb = (_name: string) => cnt++;
    const cb2 = (_name: string) => cnt++;
    const cb3 = (_name: string) => cnt++;
    events.on('hello', [cb, cb2, cb3]);
    events.off('hello');
    events.emit('hello', 'world');
    asserts.assertEquals(cnt, 0);
  });

  await t.step('should call "once" event listeners only once', () => {
    let cnt = 0;
    const events = new Events();
    const cb = (_name: string) => cnt++;
    const cb2 = (_name: string) => cnt++;
    events.once('hello', [cb, cb2]);
    events.emit('hello', 'world');
    events.emit('hello', 'world');
    asserts.assertEquals(cnt, 2);
  });

  await t.step('should not throw when emitting an unregistered event', () => {
    const events = new Events();
    events.emit('hello');
  });

  await t.step(
    'should not throw when emitting an unregistered event',
    async () => {
      const events = new Events();
      // Both methods should be tested separately
      events.emit('hello');
      await events.emitSync('hello');
    },
  );

  await t.step('should support method chaining', () => {
    let count1 = 0;
    let count2 = 0;
    const events = new Events();

    // Chain multiple method calls
    events
      .on('event1', () => count1++)
      .on('event2', () => count2++)
      .emit('event1')
      .emit('event2');

    asserts.assertEquals(count1, 1);
    asserts.assertEquals(count2, 1);
  });

  await t.step('should not register duplicate callbacks', () => {
    let count = 0;
    const events = new Events();
    const callback = () => count++;

    // Register the same callback twice
    events.on('test', callback);
    events.on('test', callback);

    events.emit('test');
    asserts.assertEquals(count, 1, 'Callback should only be called once');
  });

  await t.step('should handle multiple event types independently', () => {
    let count1 = 0;
    let count2 = 0;
    const events = new Events();

    events.on('event1', () => count1++);
    events.on('event2', () => count2++);

    events.emit('event1');
    asserts.assertEquals(count1, 1);
    asserts.assertEquals(count2, 0);

    events.emit('event2');
    asserts.assertEquals(count1, 1);
    asserts.assertEquals(count2, 1);
  });

  await t.step('should continue execution when callbacks throw errors', () => {
    let executedCallbacks = 0;
    const events = new Events();

    events.on('error-test', [
      () => {
        throw new Error('Test error');
      },
      () => {
        executedCallbacks++;
      },
    ]);

    try {
      events.emit('error-test');
      asserts.fail('Should have thrown an error');
    } catch (e) {
      asserts.assertEquals((e as Error).message, 'Test error');
      asserts.assertEquals(
        executedCallbacks,
        0,
        'Second callback should not execute after error',
      );
    }
  });

  await t.step('should handle async errors in emitSync', async () => {
    let executedCallbacks = 0;
    const events = new Events();

    events.on('async-error', [
      () => {
        throw new Error('Async test error');
      },
      () => {
        executedCallbacks++;
      },
    ]);

    try {
      await events.emitSync('async-error');
      asserts.fail('Should have thrown an error');
    } catch (e) {
      asserts.assertEquals((e as Error).message, 'Async test error');
      asserts.assertEquals(
        executedCallbacks,
        0,
        'Second callback should not execute after error',
      );
    }
  });

  await t.step('should allow off() to remove an array of callbacks', () => {
    let count = 0;
    const events = new Events();
    const callback1 = () => count++;
    const callback2 = () => count++;

    events.on('multi-remove', [callback1, callback2]);
    events.off('multi-remove', [callback1, callback2]);

    events.emit('multi-remove');
    asserts.assertEquals(count, 0, 'No callbacks should be executed');
  });

  await t.step('should handle nested event emissions', () => {
    const events = new Events();
    let outerCount = 0;
    let innerCount = 0;

    events.on('outer', () => {
      outerCount++;
      events.emit('inner');
    });

    events.on('inner', () => innerCount++);

    events.emit('outer');
    asserts.assertEquals(
      outerCount,
      1,
      'Outer event handler should be called once',
    );
    asserts.assertEquals(
      innerCount,
      1,
      'Inner event should be triggered from outer event',
    );
  });

  await t.step('should correctly handle once() with nested emissions', () => {
    const events = new Events();
    let count = 0;

    events.once('test', () => {
      count++;
      // This second emission shouldn't trigger the handler again
      events.emit('test');
    });

    events.emit('test');
    asserts.assertEquals(
      count,
      1,
      'Handler should only execute once despite nested emission',
    );
  });

  await t.step(
    'should not fail when registering an empty callback array',
    () => {
      const events = new Events();
      events.on('test', []);
      events.emit('test'); // Should not throw
    },
  );

  await t.step(
    'should not fail when off() is called for non-existent callbacks',
    () => {
      const events = new Events();
      const callback = () => {};

      // Register no callbacks
      events.off('never-registered', callback); // Should not throw

      // Register an event but remove a different callback
      events.on('test', () => {});
      events.off('test', callback); // Should not throw
    },
  );

  await t.step('should properly handle multiple arguments', () => {
    const events = new Events<{
      multiArg: (arg1: number, arg2: string, arg3: boolean) => void;
    }>();

    // deno-lint-ignore no-explicit-any
    let receivedArgs: any[] = [];
    events.on('multiArg', (num, str, bool) => {
      receivedArgs = [num, str, bool];
    });

    events.emit('multiArg', 42, 'test', true);
    asserts.assertEquals(
      receivedArgs,
      [42, 'test', true],
      'All arguments should be passed correctly',
    );
  });

  await t.step(
    'should maintain correct execution order in emitSync',
    async () => {
      const events = new Events();
      const executionOrder: number[] = [];

      events.on('ordered', [
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          executionOrder.push(1);
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          executionOrder.push(2);
        },
        () => executionOrder.push(3),
      ]);

      await events.emitSync('ordered');
      asserts.assertEquals(
        executionOrder,
        [1, 2, 3],
        'Callbacks should execute in registration order',
      );
    },
  );

  await t.step('should allow once() to work with async callbacks', async () => {
    const events = new Events();
    let count = 0;

    events.once('async-once', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      count++;
    });

    // First emit should trigger the callback
    events.emit('async-once');
    await new Promise((resolve) => setTimeout(resolve, 20));
    asserts.assertEquals(count, 1, 'Callback should have executed once');

    // Second emit should not trigger the callback again
    events.emit('async-once');
    await new Promise((resolve) => setTimeout(resolve, 20));
    asserts.assertEquals(count, 1, 'Callback should not execute again');
  });

  await t.step(
    'should preserve callback context when using typed events',
    () => {
      type ComplexEventMap = {
        complexEvent: (obj: { id: number; name: string }) => void;
      };

      const events = new Events<ComplexEventMap>();
      let receivedObject: { id: number; name: string } | null = null;

      events.on('complexEvent', (obj) => {
        receivedObject = obj;
        // TypeScript should know obj has id and name properties
        obj.id++;
        obj.name = obj.name.toUpperCase();
      });

      const testObj = { id: 1, name: 'test' };
      events.emit('complexEvent', testObj);

      asserts.assertEquals(
        receivedObject,
        { id: 2, name: 'TEST' },
        'Object should be modified by the callback',
      );
    },
  );
});
