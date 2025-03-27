import * as asserts from '$asserts';
import { type EventOptionsKeys, Options } from './Options.ts';
import type { EventCallback } from './Events.ts';

Deno.test('utils.Options', async (t) => {
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
      this._setOption('a', 1233 as unknown as string);
    }

    setOption(key: keyof Opt, value: Opt[keyof Opt]) {
      this._setOption(key, value);
    }

    override _processOption<K extends keyof Opt>(
      key: K,
      value: Opt[K],
    ): Opt[K] {
      if (
        key === 'a' && typeof value !== 'string' && value !== undefined &&
        value !== null
      ) {
        throw new Error('Invalid value');
      }
      return value;
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

    override _processOption(
      key: string,
      value: unknown,
    ): unknown {
      if (key === 'a' && typeof value !== 'string') {
        throw new Error('Invalid value');
      }
      return value;
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

  await t.step('should set null or undefined values properly', () => {
    const options = new TypedOptions({ c: true });

    // Setting undefined shouldn't throw but should process the value
    options.setOption('a', undefined as unknown as string);
    asserts.assertEquals(options.getOption('a'), undefined);

    // Setting null shouldn't throw but should process the value
    options.setOption('a', null as unknown as string);
    asserts.assertEquals(options.getOption('a'), null);
  });

  await t.step('should not throw error if option key is missing', () => {
    // Test for both typed and untyped options
    const options = new TypedOptions({ c: true });
    // Using a non-existent key as any to test behavior
    asserts.assertEquals(
      options.getOption('some_key' as unknown as keyof Opt),
      undefined,
    );

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
