# Options

An abstract class to help manage typed & UnTyped "Options" when defining a
library or a class. "Options" are paramaters passed onto the constructor of a
class during initialization.

## Usage

Typed usage:

```ts
import { Options } from './mod.ts';
//#region Typed Options
type iTypedOptions = {
  value1: string;
  value2: number;
  value3: {
    value31: boolean;
  };
  value44?: Array<string>;
};
class TypedOption extends Options<iTypedOptions> {
  constructor(
    options: NonNullable<iTypedOptions> | Partial<iTypedOptions>,
    defaults?: Partial<iTypedOptions>,
  ) {
    super(options, defaults);
  }

  // deno-lint-ignore no-explicit-any
  public setOptions(name: keyof iTypedOptions, value: any) {
    this._setOption(name, value);
  }

  public getOption(name: keyof iTypedOptions): unknown {
    return this._getOption(name);
  }

  public getOptions() {
    return this._options;
  }

  public hasOption(name: string): boolean {
    return this._hasOption(name as keyof iTypedOptions);
  }
}
```

Untyped Usage:

```ts
class UnTypedOption extends Options {
  constructor(options: OptionsType, defaults?: OptionsType) {
    super(options, defaults);
  }

  public setOptions(name: OptionsKey, value: unknown) {
    this._setOption(name, value);
  }

  public getOption(name: OptionsKey): unknown {
    return this._getOption(name);
  }

  public getOptions() {
    return this._options;
  }

  public hasOption(name: OptionsKey): boolean {
    return this._hasOption(name);
  }
}
```

### Methods

#### constructor

```ts
constructor(
    options: Record<OptionsKey, unknown>,
    defaults?: Record<OptionsKey, unknown>,
  )
```

`options: Record<OptionsKey, unknown>`: The options list which needs to be
loaded when initializing the class. If it is a typed implementation then this
will be a typed entry.

`defaults?: Record<OptionsKey, unknown>`: Default value for the options in case
not passed in the options variable

The options and defaults value will be deep cloned and not referenced.

#### _hasOption

```ts
protected _hasOption(name: OptionsKey): boolean
```

Checks if a particular option exists. Returns True if it exists false if it does
not

_NOTE_: Search is case sensitive. So option name TesT is not same as test

`name: OptionsKey` The option name for which to check

#### _getOption

```ts
protected _getOption(name: OptionsKey): unknown
```

Gets a particular option value

`name: OptionsKey`: The option key for which value is required

_NOTE_: Does not support nested keys yet.

#### _setOption

```ts
protected _setOption(name: OptionsKey, value: unknown): this
```

Sets a particular option key's value.

`name: OptionsKey`: The option key for which value has to be set.

`value: any`: The value

`returns: Options class instance` Returns the class instance to enable chaining

## TODO

- [ ] Protect/disallow editablity of options (Make all methods protected) - Is
      this needed?
- [ ] Multi level Option manipulation
