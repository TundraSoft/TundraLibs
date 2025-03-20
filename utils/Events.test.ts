import * as asserts from '$asserts';
import { Events } from './Events.ts';

// Helper function to create a delayed function
const createDelayedFunction = (delay: number, callback: () => void) => {
  return async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    callback();
  };
};

Deno.test('Events', async (t) => {
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
      let timer1: ReturnType<typeof setTimeout>;
      const cb = async (_name: string) => {
        // Delay
        await new Promise((resolve) => timer1 = setTimeout(resolve, 250));
        cnt++;
      };
      let timer2: ReturnType<typeof setTimeout>;
      const cb2 = async (_name: string) => {
        // Delay
        await new Promise((resolve) => timer2 = setTimeout(resolve, 250));
        cnt++;
      };
      events.on('hello', [cb, cb2]);
      await events.emitSync('hello', 'world');
      asserts.assertEquals(cnt, 5);
      clearTimeout(timer1!);
      clearTimeout(timer2!);
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

  await t.step('should not throw when emitting an unregistered event', () => {
    const events = new Events();
    events.emitSync('hello');
  });
});
