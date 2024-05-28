import { type OptionKeys, Options } from '../mod.ts';
import { assertEquals } from '../../dev.dependencies.ts';

Deno.test('Options:Typed', async (t) => {
  type TestOptions = { foo: string; bar?: number };
  type TestEvents = { baz: (value: string) => void };
  class TestClass extends Options<TestOptions, TestEvents> {
    constructor(opt: OptionKeys<TestOptions, TestEvents>) {
      super(opt, { foo: 'aaa' });
    }

    checkExistence(name: string): boolean {
      return this._hasOption(name as keyof TestOptions);
    }

    getValue<K extends keyof TestOptions>(name: K): TestOptions[K] {
      return this._getOption(name);
    }

    updateValue<K extends keyof TestOptions>(
      name: K,
      value: TestOptions[K],
    ): void {
      this._setOption(name, value);
    }

    hasEvent(name: string): boolean {
      return this._events.has(name as keyof TestEvents);
    }

    getAll(): TestOptions {
      return this._getAllOptions();
    }
  }
  let test: TestClass;
  await t.step('Check if option value exists', () => {
    test = new TestClass({
      foo: 'bar',
      _onbaz: () => {
        console.log('df');
      },
    });
    assertEquals(test.checkExistence('foo'), true);
    assertEquals(test.checkExistence('bar'), false);
  });

  await t.step('Get option value', () => {
    test = new TestClass({
      foo: 'bar',
      _onbaz: () => {
        console.log('df');
      },
    });
    assertEquals(test.getValue('foo'), 'bar');
    // Return undefined if no value
    assertEquals(test.getValue('bar'), undefined);
  });

  await t.step('Update option value', () => {
    test = new TestClass({
      foo: 'bar',
      _onbaz: () => {
        console.log('df');
      },
    });
    test.updateValue('bar', 123);
    assertEquals(test.getValue('bar'), 123);
  });

  await t.step('Check if event exists', () => {
    test = new TestClass({
      foo: 'bar',
      _onbaz: () => {
        console.log('df');
      },
    });
    assertEquals(test.hasEvent('baz'), true);
  });

  await t.step('Get all options', () => {
    assertEquals(test.getAll(), { foo: 'bar' });
  });
});

Deno.test('Options:Untyped', async (t) => {
  class TestClass extends Options {
    constructor(opt: OptionKeys) {
      super(opt);
    }

    checkExistence(name: string): boolean {
      return this._hasOption(name);
    }

    getValue(name: string): unknown {
      return this._getOption(name);
    }

    updateValue(name: string, value: unknown): void {
      this._setOption(name, value);
    }

    hasEvent(name: string): boolean {
      return this._events.has(name);
    }

    getAll(): Record<string, unknown> {
      return this._getAllOptions();
    }
  }
  let test: TestClass;

  await t.step('Check if option value exists', () => {
    test = new TestClass({
      foo: 'bar',
      _onbaz: () => {
        console.log('df');
      },
    });
    assertEquals(test.checkExistence('foo'), true);
    assertEquals(test.checkExistence('bar'), false);
  });

  await t.step('Get option value', () => {
    test = new TestClass({
      foo: 'bar',
      _onbaz: () => {
        console.log('df');
      },
    });
    assertEquals(test.getValue('foo'), 'bar');
    // Return undefined if no value
    assertEquals(test.getValue('bar'), undefined);
  });

  await t.step('Update option value', () => {
    test = new TestClass({
      foo: 'bar',
      _onbaz: () => {
        console.log('df');
      },
    });
    test.updateValue('bar', 123);
    assertEquals(test.getValue('bar'), 123);
  });

  await t.step('Check if event exists', () => {
    test = new TestClass({
      foo: 'bar',
      _onbaz: () => {
        console.log('df');
      },
    });
    assertEquals(test.hasEvent('baz'), true);
  });

  await t.step('Get all options', () => {
    test = new TestClass({
      foo: 'bar',
      _onbaz: () => {
        console.log('df');
      },
    });
    assertEquals(test.getAll(), { foo: 'bar' });
  });
});