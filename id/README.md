# ID

Collection of ID or key generator functions.

## cryptoKey

Generates a key or ID basis provided length. This uses crypto.getRandomValues. Typical usage can be for passwords, encryption key or secrets.

It has the ability to "Prefix" the key with a standard text (length will increase) and also hyphenate the key in fixed intervals.

### Usage

```ts
cryptoKey = (length = 32, prefix = '', hyphenInterval = 0): string
```

`length: number` - Length of the key to be generated. defaults to 32

`prefix: string` - Prefix the key with said string. *NOTE* this will increase the length of the key. Defaults to empty string

`hyphenInterval: number` - Add hyphens after x characters. Defaults to 0 (no hyphen)

This will return a string as specified

Example:

```ts
console.log(cryptoKey(32)); // 3bd8753444559aa1f67c3664b7722ad4
console.log(cryptoKey(32, 'TLIB-')); // TLIB-3bd8753444559aa1f67c3664b7722ad4
console.log(cryptoKey(32, 'TLIB-', 4)); // TLIB-9374-2723-001b-4013-6ee3-0ea8-cad0-5434
```

## nanoId

Generates a random id of predefined x length using input data set. This utility is meant to be a fast and easy way to generate ID keeping performance in mind and not collision resistance. 

### Predefined Data sets:

- alphabets -- English alphabets (lower case)
- numbers -- 0-9
- alphaNumeric -- English alphabets (lower case) and numbers
- alphaNumericCase -- English alphabets (lower AND upper case) and numbers
- webSafe -- alphaNumeric and -_ characters
- password -- websafe and !@$%^&* characters

### Usage

```ts
nanoId(size = 21, base: string = webSafe): string
```

`size: number` - The length of the generated ID

`base: string` - Base dataset to use. Defaults to webSafe. See [Data Sets](#predefined-data-sets)

#### Password generator alias

```ts
passwordGenerator(size = 21): string
```

`size: number` - Length of the password. Calls nanoId internally using password as the data set


## sequenceId

Generates a unique ID based on server information and a counter. This is based out of https://mariadb.com/kb/en/uuid_short/
Uses PID of deno and current epoch (not the smartest, but for now this is all we have)


### Usage

```ts
sequenceId(counter?: number): Bigint
```

`counter?: number` - Override the counter. By default everytime the "application" starts, the counter is set to 0. Use this to override that. Once it is overridden, all subsequent ID's will be generated from that value

