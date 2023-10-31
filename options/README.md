# Options

A core concept in tundralibs is to build reusable modules or libraris which can be easily extended and customized but also provide some consistant functionality such as managing secure options, events and logging. The options class provides an easy and simple way of storing options for the module and also allow creation of events.

The options are stored using privateObjects.

## Usage

```ts
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

// Untyped
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
```

## Methods

### constructor

Process the options provided. If the key contains a _on prefix, and is a function, it is assumed to be an event. Defaults can be used to set the default value and will be gracefully overridden by the options.

```ts
constructor(options: OptionKeys<O, E>, defaults?: Partial<O>)
```

Types:

`O` - The options type

Params:

`E` - The events type

`options: OptionKeys<O, E>` - This merges the keys in Option Types and keys in events (prefixing them with _on) allowing to initialize a class with both options and events

`defaults?: Partial<O>` - Contains default overrides

### _hasOption

Checks if the given option name exists and has value in the options object

```ts
protected _hasOption<K extends keyof O>(name: K): boolean;
```

Types:

`K` - Key in options (if typed, else defaults to string)

Params:

`name: K` - The option key to check

### _getOption

Retrieves the value of the specified option from the options object.

```ts
protected _getOption<K extends keyof O>(name: K): O[K];
```

Types:

`K` - Key of options. Defaults to string in untyped

Params:

`name: K` - The name of the option key for which the value is to be fetched

_NOTE_ Return type in untyped will alwasys be unknown

### _setOption

Sets an option with a specific name and value.

```ts
protected _setOption<K extends keyof O>(name: K, value: O[K]): this;
```

Type:

`K` - Key of options. Defaults to string in untyped

Params:

`name: K` - The name of the option key for which the value is to be set

`value: O[K]` - The value, defaults to unknown in untype

## TODO

- [ ] Better more detailed test case
- [ ] Validation of option value
- [ ] Default events?
