# nanoid

Based on the popular npm package nanoid, generates a (almost) unique id of fixed
length using preset dictionaries. Custom dictionaries can also be added.

## Available Dictionaries

- alphabets - Alphabets (abcdefghijklmnopqrstuvwxyz)
- numbers - All numbers (0123456789)
- alphaNumericCase - (abcdefghijklmnopqrstuvwxyz0123456789)
- alphaNumeric -
  (abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ)
- webSafe - (abcdefghijklmnopqrstuvwxyz_0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ)
- password -
  (!@$%^&*abcdefghijklmnopqrstuvwxyz_0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ)

## Usage

```ts
import {
  alphabets,
  alphaNumeric,
  alphaNumericCase,
  nanoid,
  numbers,
  password,
  webSafe,
} from "./mod.ts";
let key = nanoid(6); // By default it will use websafe dictionaty
let pass = nanoid(6, password); // Use password dictionary
```

### Methods

#### nanoid

```ts
nanoid(size: number = 21, base: string = webSafe)
```

`length: number` The length of the generated id. Default value is 21

`base: string` The base dictionary to use to generate the id. Besides the 6
available, you can set your own custom dictionaries. The algorithm will try to
distribute equal selection from the dictionary.

## TODO

- [ ] Improve collission ressistance when generating new id
