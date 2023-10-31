# Utils

Collection of helpers primarily used inside tundralibs but can also be used externally.

## Contents

- [Decorators](#decorators)
  - [singleton](#singleton)
- [Base Error](#base-error)
- [envArgs](#envargs)
- [privateObject](#privateobject)
- [TundraLibError](#tundraliberror)

## Decorators

Decorators FTW!

### singleton

Convert a class to a singleton ensuring same instance of the class is retrieved everytime the class is initialized.

```ts
import { singleton } from '';
@singleton
class TestClass {
  counter: number;

  constructor() {
    this.counter = 0;
  }

  incrementCounter() {
    this.counter++;
  }
}

const t = new TestClass();
t.incrimentCounter();
console.log(t.counter); // 1
const t2 = new TestClass();
t2.incrimentCounter();
console.log(t2.counter); //2
console.log(t.counter); //2
```

## Base Error

A standardized error class.

## envArgs

A utility function to fetch the environment variables. It supports fetching variables from environment, env files and also docker secrets.
It internally leverages privateObject.

`envArgs(envFilePath: string, loadDockerSecrets: boolean)`

`envFilePath` - The path where env file is stored. Defaults to ./ which would default current working directory

`loadDockerSecrets` - Load secrets from /run/secrets. This is useful when passing secrets in docker. Defaults to true

```ts
import { envArgs } from '';
const a = envArgs();
```

## privateObject

A typesafe object to store variables meant to be private. It has few helpful features as not allowing variables to be edited once initialized, not display in console log etc.

`privateObject = <T extends Record<string, unknown> = Record<string,  unknown>>(data?: T,enableMutations = true): PrivateObject<T>`

`T` - Type casting of the object. By default it will set as `Record<string, unknown>`

`data: T` - Initializing data. Send {} for blank

`enableMutations` - Boolean value indicating if values can be edited. If set to false, then values cannot be edited once initialized

#### privateObject.get

Returns the value with the associated key. NOTE - If trying to request a key which does not exists, you will always get undefined

```ts
const pv = privateObject<{ a: number; b: string }>({ a: 1, b: 'Hello' });
console.log(pv.get('a')); // 1
// This will cause below error to be displayed, but will run
//Argument of type '"fd"' is not assignable to parameter of type '"a" | "b"'.deno-ts(2345)
console.log(pv.get('fd')); // undefined
```

#### privateObject.has

Checks if the specified key exists.

```ts
const pv = privateObject<{ a: number; b: string; c?: string; d?: number }>({
  a: 1,
  b: 'Hello',
  d: undefined,
});
console.log(pv.has('a')); // true
console.log(pv.has('c')); // false
// If key is set to undefined, it will show
console.log(pv.has('d')); // true
```

#### privateObject.set

Set the value for a key. However, if enableMutation is defined as false, it will not update.

```ts
const pv = privateObject<{ a: number; b: string; c?: string; d?: number }>({
  a: 1,
  b: 'Hello',
  d: undefined,
});
console.log(pv.get('a')); // 1
pv.set('a', 12);
console.log(pv.get('a')); // 12

const pv2 = privateObject<{ a: number; b: string; c?: string; d?: number }>({
  a: 1,
  b: 'Hello',
  d: undefined,
}, false);
console.log(pv2.get('a')); // 1
pv2.set('a', 12);
console.log(pv2.get('a')); // 1
```

#### privateObject.delete

Deletes or removes a key from the object (only if enableMutations is enabled)

```ts
const pv = privateObject<{ a: number; b: string; c?: string; d?: number }>({
  a: 1,
  b: 'Hello',
  d: undefined,
});
console.log(pv.has('a')); // true
pv.delete('a');
console.log(pv.has('a')); // false

const pv2 = privateObject<{ a: number; b: string; c?: string; d?: number }>({
  a: 1,
  b: 'Hello',
  d: undefined,
}, false);
console.log(pv2.has('a')); // true
pv2.delete('a');
console.log(pv2.has('a')); // true
```

#### privateObject.forEach

Helper function to loop through all keys and values.

```ts
const pv = privateObject<{ a: number; b: string; c?: string; d?: number }>({
  a: 1,
  b: 'Hello',
  d: undefined,
});
pv.forEach((key, value) => console.log(key, value));
// Output:
// a 1
// b Hello
// d undefined
```

#### privateObject.keys

Helper function to get the keys as an array

```ts
const pv = privateObject<{ a: number; b: string; c?: string; d?: number }>({
  a: 1,
  b: 'Hello',
  d: undefined,
});
console.log(pv.keys());
// Output:
// [ "a", "b", "c" ]
```

## TundraLibError

A mutation of BaseError which is used as the base for all errors thrown by TundraLib modules. Only change done is to demand library as a meta tag to identify the error.
