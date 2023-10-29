# Util

Few simple utility functions which are used in Tundralibs.

## Index

- [Decorators](#decorators)
- [BaseError](#baseerror)
- [envArgs](#envargs)
- [privateObject](#privateObject)

## Decorators

- [Sealed](#sealed)
- [Singleton](#singleton)

### Sealed

Sealed decorator function is used to seal the constructor and its prototype,
preventing further modifications to them. Sealing an object makes it
read-only and ensures that no new properties can be added or existing ones
deleted.

This decorator might be used to enforce immutability or prevent accidental
modifications to a class or its instances.

### Singleton

Simple decorator which helps in cration of singleton class.

```ts
@singleton
class Test {
  private val: string;

  constructor(val: string) {
    this.val = val;
  }
  public setVal(val: string) {
    this.val = val;
  }
  public getVal(): string {
    return this.val;
  }
}

const a = new Test('Boo');
const b = new Test('Ya');
console.log(a.getVal()); // Will display Boo
console.log(b.getVal()); // Will display Boo
```

## BaseError

Provides a standard error class which is used on all libraries. The goal is to
make the errors as detailed as possible and easy to classify.

```ts
new BaseError(message: string, library: string, metaTags?: ErrorMetaTags)
```

`message: string` - The message to display

`library: string` - The module or library which threw the error

`metaTags?: ErrorMetaTags` - Extra information with regards to the error.
This can be anything which can be used to help debug.

## envArgs

An easy and simple way to access Environment variables, including secrets from
docker. This does not use the docker API, but uses the /run/secrets files
created during docker runtime.

It also supports loading environment variables from file. The hierarchy of
data loaded is:

- environment variable
- env file
- Secrets (docker)

If the same variable is present in multiple sources, the last source per
hierarchy overrides the previous.

_NOTE_ - This will require the below permissions to run successfully:

- env - To fetch environment variables
- read
  - .env file path, typically root folder
  - /run/secrets - This would be a directory where docker secrets are found

```ts
const env = envArgs(envFilePath = './', loadDockerSecrets = true);
```

`envFilePath: string` - Incase the .env file is found in a folder other that
the root folder.

`loadDockerSecrets: boolean` - Should the docker secrets be loaded


## privateObject

Provides a simple way to create "private" objects which can be used to store
data somewhat safely. This was created to store sensitive information in class
and preventing them from being displayed when console.log is used on the class.

```ts
const obj = privateObject<T extends Record<string, unknown> = Record<string, unknown>>(data?: T, enableMutations = true);
console.log(obj); // prints { has: [Function] } etc
```

`T extends Record<string, unknown>` - The type definition for the object.
Although not required, its nice to have it.

`data?: T` - The data to be used as initialize the object

`enableMutations = true` - Enable editing or deleting entries. Defaults to
true, but when set to false, it will prevent editing

When `enableMutations` is set to false, ensure `data` has been passed, if not
the object becomes uneditable!
