import * as asserts from '$asserts';
import { type EventOptionsKeys, Options } from './mod.ts';
import type { EventCallback } from '@tundralibs/events';

Deno.test('Options', async (t) => {
  type Opt = { a?: string; b?: number; c: boolean };
  type Evnt = { change: () => void };
  class TypedOptions extends Options<Opt, Evnt> {
    constructor(opt: EventOptionsKeys<Opt, Evnt>) {
      super(opt, { b: 10 });
    }

    update() {
      this._setOption('a', 'hello');
      this._setOption('b', 20);
      this._setOption('c', true);
    }

    updateInvalid() {
      this._setOption('a', undefined);
    }

    override _validateOption<K extends keyof Opt>(
      key: K,
      value: Opt[K],
    ): boolean {
      if (key === 'a' && typeof value !== 'string') {
        throw new Error('Invalid value');
      }
      return true;
    }
  }

  class UnTypedOptions extends Options {
    constructor(
      opt: EventOptionsKeys<
        Record<string, unknown>,
        Record<string, EventCallback>
      >,
    ) {
      super(opt, { b: 10 });
    }

    update() {
      this._setOption('a', 'hello');
      this._setOption('b', 20);
      this._setOption('c', true);
    }

    updateInvalid() {
      this._setOption('a', 234);
    }

    override _validateOption(
      key: string,
      value: unknown,
    ): boolean {
      if (key === 'a' && typeof value !== 'string') {
        throw new Error('Invalid value');
      }
      return true;
    }
  }

  await t.step('should set and fetch options', () => {
    let cnt = 0;
    const options = new TypedOptions({ c: true, _onchange: () => cnt++ });
    asserts.assertEquals(options.getOption('a'), undefined);
    asserts.assertEquals(options.getOption('b'), 10);
    asserts.assertEquals(options.getOption('c'), true);
    options.update();
    asserts.assertEquals(options.getOption('a'), 'hello');
    asserts.assertEquals(options.getOption('b'), 20);
    asserts.assertEquals(options.getOption('c'), true);

    cnt = 0;
    const options2 = new UnTypedOptions({ c: true, _onchange: () => cnt++ });
    asserts.assertEquals(options2.getOption('a'), undefined);
    asserts.assertEquals(options2.getOption('b'), 10);
    asserts.assertEquals(options2.getOption('c'), true);
    options2.update();
    asserts.assertEquals(options2.getOption('a'), 'hello');
    asserts.assertEquals(options2.getOption('b'), 20);
    asserts.assertEquals(options2.getOption('c'), true);
  });

  await t.step('should register events', () => {
    let cnt = 0;
    const options = new TypedOptions({ c: true, _onchange: () => cnt++ });
    asserts.assertEquals(cnt, 0);
    options.emit('change');
    asserts.assertEquals(cnt, 1);

    cnt = 0;
    const options2 = new UnTypedOptions({ c: true, _onchange: () => cnt++ });
    asserts.assertEquals(cnt, 0);
    options2.emit('change');
    asserts.assertEquals(cnt, 1);
  });

  await t.step('should check if options exist', () => {
    const options = new TypedOptions({ c: true });
    asserts.assertEquals(options.hasOption('a'), false);
    asserts.assertEquals(options.hasOption('b'), true);
    asserts.assertEquals(options.hasOption('c'), true);
    options.update();
    asserts.assertEquals(options.hasOption('a'), true);
    asserts.assertEquals(options.hasOption('b'), true);
    asserts.assertEquals(options.hasOption('c'), true);

    const options2 = new UnTypedOptions({ c: true });
    asserts.assertEquals(options2.hasOption('a'), false);
    asserts.assertEquals(options2.hasOption('b'), true);
    asserts.assertEquals(options2.hasOption('c'), true);
    options2.update();
    asserts.assertEquals(options2.hasOption('a'), true);
    asserts.assertEquals(options2.hasOption('b'), true);
    asserts.assertEquals(options2.hasOption('c'), true);
  });

  await t.step('should not throw error if option key is missing', () => {
    // Ideally this should never be run, maybe we throw error for typed???
    // const options = new TypedOptions({ c: true });
    // asserts.assertEquals(options.getOption('some_key'), undefined);

    const options2 = new UnTypedOptions({ c: true });
    asserts.assertEquals(options2.getOption('some_key'), undefined);
  });

  await t.step('should throw error if option value is invalid', () => {
    const options = new TypedOptions({ c: true });
    asserts.assertThrows(() => options.updateInvalid(), Error);

    const options2 = new UnTypedOptions({ c: true });
    asserts.assertThrows(() => options2.updateInvalid(), Error);
  });
});
