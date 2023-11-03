import { Options } from '../Options.ts';
import type { OptionKeys } from '../types/mod.ts';
import {
  assertEquals,
  beforeEach,
  describe,
  it,
} from '../../dev.dependencies.ts';

describe(`[library='Options' mode='typed']`, () => {
  type TestOptions = { foo: string; bar?: number };
  type TestEvents = { baz: (value: string) => void };
  class TestClass extends Options<TestOptions, TestEvents> {
    constructor(opt: OptionKeys<TestOptions, TestEvents>) {
      super(opt);
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
  }
  let test: TestClass;

  beforeEach(() => {
    test = new TestClass({
      foo: 'bar',
      _onbaz: () => {
        console.log('df');
      },
    });
  });

  it('Check if option value exists', () => {
    assertEquals(test.checkExistence('foo'), true);
    assertEquals(test.checkExistence('bar'), false);
  });

  it('Get option value', () => {
    assertEquals(test.getValue('foo'), 'bar');
    // Return undefined if no value
    assertEquals(test.getValue('bar'), undefined);
  });

  it('Update option value', () => {
    test.updateValue('bar', 123);
    assertEquals(test.getValue('bar'), 123);
  });

  it('Check if event exists', () => {
    assertEquals(test.hasEvent('baz'), true);
  });
});

describe(`[library='Options' mode='untyped']`, () => {
  // type TestOptions = { foo: string, bar?: number };
  // type TestEvents = { baz: (value: string) => void }
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
  }
  let test: TestClass;

  beforeEach(() => {
    test = new TestClass({
      foo: 'bar',
      _onbaz: () => {
        console.log('df');
      },
    });
  });

  it('Check if option value exists', () => {
    assertEquals(test.checkExistence('foo'), true);
    assertEquals(test.checkExistence('bar'), false);
  });

  it('Get option value', () => {
    assertEquals(test.getValue('foo'), 'bar');
    // Return undefined if no value
    assertEquals(test.getValue('bar'), undefined);
  });

  it('Update option value', () => {
    test.updateValue('bar', 123);
    assertEquals(test.getValue('bar'), 123);
  });

  it('Check if event exists', () => {
    assertEquals(test.hasEvent('baz'), true);
  });
});
