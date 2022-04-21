# Options

An abstract class to help manage typed & UnTyped "Options" when defining a
library or a class. "Options" are paramaters passed onto the constructor of a
class during initialization.

## Usage

Typed usage:

```ts
import { Options } from "./mod.ts";
interface iOptionTest {
  value1: string;
  value2: number;
  value3: {
    value31: boolean;
  };
}

class Test extends Options<iOptionTest> {
  constructor(options: iOptionTest) {
    super(options, true);
  }

  public someOtherFunc() {
    console.log(this._getOption("value1")); // returns value1's value
    console.log(this._getOption("value3").value31); // returns value3 -> value31's boolean output
    console.log(this._options.value3.value31);
  }
}

let a: Test = new Test({
  value1: "dff",
  value2: 23,
  value3: { value31: true },
});
a.someOtherFunc();
```

Untyped Usage:

```ts
import { Options } from "./mod.ts";
class Test extends Options {
  constructor(options: iOptionTest) {
    super(options, true);
  }

  public someOtherFunc() {
    console.log(this._getOption("value1")); // returns value1's value
    console.log(this._getOption("value3").value31); // returns value3 -> value31's boolean output
    console.log(this._options.value3.value31);
  }
}

let a: Test = new Test({
  value1: "dff",
  value2: 23,
  value3: { value31: true },
});
a.someOtherFunc();
```

### Methods

#### constructor

```ts
super(options: any, editable: boolean = true)
```

`options: any`: The options list which needs to be loaded when initializing the
class. If it is a typed implementation then this will be a typed entry.

`editable: boolean = true`: Can the options (post constructor initialization) be
edited post initialization?

_Note_: The methods will not allow the values to be edited, however one can
directly edit the values

#### _hasOption

```ts
_hasOption(name: string): boolean;
```

Checks if a particular option exists. Returns True if it exists false if it does
not

_NOTE_: Search is case sensitive. So option name TesT is not same as test

`name: string` The option name for which to check

#### _getOption

```ts
_getOption(name: string | number): any
```

Gets a particular option value

`name: string | number`: The option key for which value is required

_NOTE_: Does not support nested keys yet.

#### _setOption

```ts
_setOption(name: string | number, value: any): this
```

Sets a particular option key's value. Unless it is being called during
initialization, it will check if the editable value is true.

`name: string | number`: The option key for which value has to be set.

`value: any`: The value

`returns: Options class instance` Returns the class instance to enable chaining

## TODO

- [x] Protect/disallow editablity of options (Make all methods protected)
- [ ] More elegant/simpler untyped definition
- [ ] Editable option must ensure that direct edits (example
      `this._options['A'] = 'asd'`) are not possible
- [ ] Multi level Option manipulation
