import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { type EventOptionKeys, Options } from './Options.ts';
import type { EventCallback } from './Events.ts';

describe('utils.Options', () => {
  type Opt = { a?: string; b?: number; c: boolean };
  type Evnt = { change: () => void };
  class TypedOptions extends Options<Opt, Evnt> {
    public getOption<K extends string>(key: K) {
      // deno-lint-ignore no-explicit-any
      return this._getOption(key as any);
    }
    public getOptions() {
      return this._getOptions();
    }
    // deno-lint-ignore no-explicit-any
    public emit(event: any, ...args: unknown[]) {
      // deno-lint-ignore no-explicit-any
      return this._emitRaw(event, ...args as any);
    }
    constructor(opt: EventOptionKeys<Opt, Evnt>) {
      super();
      super._setOptions(opt, { b: 10 });
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
    public getOption<K extends string>(key: K) {
      // deno-lint-ignore no-explicit-any
      return this._getOption(key as any);
    }
    public getOptions() {
      return this._getOptions();
    }
    // deno-lint-ignore no-explicit-any
    public emit(event: any, ...args: unknown[]) {
      // deno-lint-ignore no-explicit-any
      return this._emitRaw(event, ...args as any);
    }
    constructor(
      opt: EventOptionKeys<
        Record<string, unknown>,
        Record<string, EventCallback>
      >,
    ) {
      super();
      super._setOptions(opt, { b: 10 });
    }

    update() { // NOSONAR - test file
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

  it('should set and fetch options', () => {
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

  it('should register events', () => {
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

  it('should check if options exist', () => {
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

  it('should set null or undefined values properly', () => {
    const options = new TypedOptions({ c: true });

    // Setting undefined shouldn't throw but should process the value
    options.setOption('a', undefined as unknown as string);
    asserts.assertEquals(options.getOption('a'), undefined);

    // Setting null shouldn't throw but should process the value
    options.setOption('a', null as unknown as string);
    asserts.assertEquals(options.getOption('a'), null);
  });

  it('should not throw error if option key is missing', () => {
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

  it('should throw error if option value is invalid', () => {
    const options = new TypedOptions({ c: true });
    asserts.assertThrows(() => options.updateInvalid(), Error);

    const options2 = new UnTypedOptions({ c: true });
    asserts.assertThrows(() => options2.updateInvalid(), Error);
  });

  it('should return all options via getOptions()', () => {
    const options = new TypedOptions({ c: true });
    const all = options.getOptions();
    asserts.assert(typeof all === 'object');
    asserts.assertStrictEquals(all.c, true);
    asserts.assertStrictEquals(all.b, 10); // default
  });

  it('should reflect updated options in getOptions()', () => {
    const options = new TypedOptions({ c: false });
    options.update();
    const all = options.getOptions();
    asserts.assertStrictEquals(all.a, 'hello');
    asserts.assertStrictEquals(all.b, 20);
    asserts.assertStrictEquals(all.c, true);
  });

  it('getOptions() returns a copy — mutating it cannot bypass validation', () => {
    const options = new TypedOptions({ c: true });
    const snapshot = options.getOptions();
    // Mutating the returned object must NOT write into the internal store
    // (previously it returned the live record by reference).
    snapshot.c = false;
    asserts.assertStrictEquals(options.getOption('c'), true);
    asserts.assertStrictEquals(options.getOptions().c, true);
  });
});

describe('utils.Options hardening (group merge + safe copies)', () => {
  type GroupOpts = {
    name: string;
    server: { port: number; host: string; secure: boolean };
    tags: string[];
  };
  class Grouped extends Options<GroupOpts> {
    constructor(cfg: Partial<GroupOpts>) {
      super();
      this._setOptions(cfg, {
        server: { port: 8080, host: 'localhost', secure: false },
        tags: ['default'],
      });
    }
    public read<K extends keyof GroupOpts>(key: K): GroupOpts[K] {
      return this._getOption(key);
    }
    public readAll(): GroupOpts {
      return this._getOptions();
    }
  }

  it('a partial group merges UNDER the group defaults', () => {
    const o = new Grouped({
      name: 'x',
      server: { port: 9999 } as GroupOpts['server'],
    });
    asserts.assertEquals(o.read('server').port, 9999); // caller wins
    asserts.assertEquals(o.read('server').host, 'localhost'); // default kept
    asserts.assertEquals(o.read('server').secure, false); // default kept
  });

  it('arrays replace wholesale (no merging)', () => {
    const o = new Grouped({ name: 'x', tags: ['a'] });
    asserts.assertEquals(o.read('tags'), ['a']);
  });

  it('explicit undefined leaves the default in place', () => {
    const o = new Grouped({ name: 'x', server: undefined });
    asserts.assertEquals(o.read('server').port, 8080);
  });

  it('_getOptions() nested group copies cannot corrupt the store', () => {
    const o = new Grouped({ name: 'x' });
    const bag = o.readAll();
    bag.server.port = -1;
    asserts.assertEquals(o.read('server').port, 8080); // store untouched
  });
});
