# Cacher

## Table of Contents

- [Overview](#overview)
- [AbstractCache Class](#abstractcache-class)
  - [Types](#types)
    - [AbstractCacherOptions Type](#abstractcacheroptions-type)
    - [CacheSettings Type](#cachesettings-type)
  - [Constructor](#constructor)
  - [Instance Properties and Methods](#instance-properties-and-methods)
  - [Extending the AbstractCache Class](#extending-the-abstractcache-class)
- [MemoryCacher Class](#memorycacher-class)
  - [Constructor](#constructor-1)
  - [Instance Properties and Methods](#instance-properties-and-methods-1)
  - [Usage](#usage)
- [RedisCacher Class](#rediscacher-class)
  - [Types](#types-1)
    - [RedisCacherOptions Type](#rediscacheroptions-type)
  - [Constructor](#constructor-2)
  - [Instance Property and Methods](#instance-property-and-methods)
  - [Usage](#usage-1)

## Overview

This caching system provides two different caching solutions: in-memory and Redis.

The base class for these solutions is the `AbstractCache` class, which defines common methods and properties that all types of caches should have. More specific types of caching solutions (like in-memory and Redis) are created as separate classes that extend from this `AbstractCache` class.

## AbstractCache Class

The `AbstractCache` class is an abstract base class providing the fundamental methods for a caching system. It extends the `Options` class, and provides methods to get, set, delete keys in the cache, and clear the entire cache.

### Types

#### AbstractCacherOptions Type

`AbstractCacherOptions` is a TypeScript type used for setting options when initializing a cache through either the `MEMORY` or `REDIS` engine.

The `AbstractCacherOptions` type includes:

- **engine**: Specifies the caching engine to use. The value can be either `'MEMORY'` or `'REDIS'`. This option is required.
- **defaultExpiry**: An optional parameter representing the default expiry time (in seconds) for all cache keys. If a specific expiry is not set when using the `set` method, this default value will be used. By default the time is set to 10 minutes.

##### Usage

You can use `AbstractCacherOptions` while creating instances of classes that extend the abstract cache class.

Here's an example of how you might use it:

```typescript
let options: AbstractCacherOptions = {
  engine: 'MEMORY',
  defaultExpiry: 3600,
};

let memoryCache = new MemoryCacher('myCache', options);
```

In this example, a new cache instance is created with the `MEMORY` engine and a default key expiry of 1 hour (3600 seconds).

#### CacheSettings Type

The `CacheSettings` is a TypeScript type that defines specific settings for cache operations.

- **expiry**: An optional parameter that sets the expiry time (in seconds) for a specific cache entry. If not provided, the default expiry value specified in `AbstractCacherOptions` will be used.

- **window**: An optional boolean parameter that indicates whether to use sliding window expiration policy for the cache entry or not. If set to `true`, every time a cache item is accessed, the expiry timer will reset.

##### Usage

You can apply this type when setting or getting cache entries.

Here's an example of how you might use it:

```typescript
let cacheSettings: CacheSettings = {
  expiry: 7200,
  window: true,
};

myCache.set('cacheKey', 'cacheValue', cacheSettings);
```

In this example, we're setting a cache entry with key `'cacheKey'` and value `'cacheValue'`. The settings dictate that this particular cache entry will expire after 2 hours (7200 seconds), and the timer will reset each time the cache item is accessed due to the `window` option being set to `true`.

### Constructor

The `constructor` takes two parameters:

- **name** (type: string): The name of the cache. This is used as a prefix for all keys in this cache instance.
- **options** (type: OptionKeys<O>): Contains the cache configuration options.

Upon instantiation, the new cache instance is also automatically registered with the `Cacher` module.

### Instance Properties

- **name**: A getter method that returns the name of the cache.
- **engine**: A getter method that returns the engine used by the cache.

### Instance Methods

- **has(key: string)**: Checks for the existence of a key in the cache. Returns a Promise resolving to `true` if the key exists, `false` otherwise.
- **set<T>(key: string, value: T, cacheOptions?: CacheSettings)**: Sets a key-value pair in the cache. Optionally takes a `cacheOptions` object allowing you to specify an expiry time and whether to use a sliding expiration window.
- **get<T>(key: string)**: Retrieves a key's value from the cache. Returns a Promise resolving to the retrieved value, or `undefined` if the key does not exist.
- **delete(key: string)**: Deletes a key-value pair from the cache.
- **clear()**: Clears everything from the cache.

### Abstract Methods

These are to be implemented in derived classes according to the specifics of the caching mechanism used:

- **_has(key: string)**: Actual implementation of the `has` method.
- **_set(key: string, value: CacheValue)**: Actual implementation of the `set` method.
- **_get<T>(key: string)**: Actual implementation of the `get` method.
- **_delete(key: string)**: Actual implementation of the `delete` method.
- **_clear()**: Actual implementation of the `clear` method.

### Protected Methods

- **_cleanKey(key: string)**: Concatenates the cache name to the key using colon as separator.

### Extending the AbstractCache Class

When creating a new Cache class based on `AbstractCache`, make sure to implement all abstract methods (`_has`, `_set`, `_get`, `_delete`, `_clear`). These methods provide the core functionality of the cache and are required for the cache instance to function correctly.

## Memory Cacher

The `MemoryCacher` class offers a caching solution that operates in-memory. This class extends from the `AbstractCache` base class and provides the fundamental methods for manipulating data in the cache.

### Constructor

The `constructor` takes two parameters:

- **name** (type: string): The name of the cache. This is used as a prefix for all keys in this cache instance.
- **options** (type: OptionKeys<MemoryCacherOptions>): Contains the cache configuration options.

It throws an error if the engine type in `options` is not `'MEMORY'`.

### Instance Properties

- **_cache**: This is a private property where key-value pairs are stored. It uses `Map<string, CacheValue>`.
- **_expiryTimers**: A protected property that keeps track of expiry timers for keys in cache possessing an expiration time. It utilizes `Map<string, number>`.

### Instance Methods

- **_has(key: string)**: Checks for the existence of a key in the cache. Returns `true` if the key exists, `false` otherwise.
- **_set(key: string, value: CacheValue)**: Sets a key-value pair in the cache. If the `value` object includes the `expiry` property, it will initiate an expiry timer accordingly.
- **_get<T>(key: string)**: Retrieves a key's value from the cache. Returns the retrieved value or `undefined` if the key does not exist.
- **_delete(key: string)**: Deletes a key-value pair from the cache and clears any associated timer.
- **_clear()**: Clears everything from the cache including all expiry timers.

### Protected Methods

- **_setExpiry(key: string, expiry: number)**: Sets up an expiry timer for a given key-value pair in the cache. If a timer for given key already exists, it will be cancelled before setting new one.

### Usage

When creating an instance of the `MemoryCacher` class, ensure that the engine type in `options` object is `'MEMORY'`. The `name` and `options` are provided to the `super()` constructor, initializing the base cache with these values.

Once instantiated, you can utilize all the methods inherited from `AbstractCache` (`has`, `set`, `get`, `delete`, and `clear`) which have been specifically implemented in this class for an in-memory caching strategy.

## RedisCacher Class

The `RedisCacher` class provides a caching solution utilizing the Redis data store. The class extends from `AbstractCache` base class.

### Types

#### RedisCacherOptions Type

The `RedisCacherOptions` is a TypeScript type that defines configuration options for the Redis caching mechanism. This type extends from the `AbstractCacherOptions` type.

- **host**: A string denoting the hostname of the Redis server.

- **port**: A number specifying the port on which the Redis server is running.

- **password** (optional): A string representing the password to use when connecting to the Redis server. If not specified, no password will be used for authentication.

- **db** (optional): A number designating the specific Redis database to use. If not provided, the default database (0) will be used.

- **tls** (optional): A boolean indicating whether to use Transport Layer Security (TLS) when connecting to the Redis server. If set to `true`, TLS will be used; otherwise, it will not be used.

##### Usage

This type can be used when configuring a `RedisCacher`.

Here's an example of how to apply it:

```typescript
let redisCacherOptions: RedisCacherOptions = {
  host: 'localhost',
  port: 6379,
  password: 'mysecretpassword',
  db: 1,
  tls: true,
};

let myRedisCacher = new RedisCacher(redisCacherOptions);
```

In this example, we're creating a new `RedisCacher` with specific configuration options. The Redis server is located at `localhost` on port `6379`. We're providing a password for authentication, specifying to use the first Redis database (`db: 1`), and opting to use TLS for secure connections.

### Constructor

The `constructor` takes two parameters:

- **name** (type: string): The name of the cache used for namespacing.
- **options** (type: OptionKeys<RedisCacherOptions>): Cache configuration options.

An error is thrown if the engine type in `options` isn't `'MEMORY'`.

### Instance Property

- **_client**: A private property, it is an optional Redis client that handles interactions with your Redis server.

### Instance Methods

- **async _has(key: string)**: Asynchronous method checks for the existence of a key in the cache. Returns a Promise that resolves to `true` if the key exists, and `false` otherwise.
- **async _set(key: string, value: CacheValue)**: This async method sets a key-value pair in cache. If the `value` object includes the `expiry` property, it will set an expiration time on that key in Redis.
- **async _get<T>(key: string)**: Asynchronously retrieves a key's value from the cache. Returns a Promise that resolves to the retrieved value or `undefined` if the key does not exist.
- **async _delete(key: string)**: Asynchronously deletes a key-value pair from the cache.
- **async _clear()**: Asynchronously clears all keys from the Redis data store specific to this caching instance.

### Protected Methods

- **async _init()**: Establishes connection with Redis server, initializing the `_client` based on cache options specified during `RedisCacher` instantiation.

### Public Method

- **async close()**: Helper function to close active redis connection.

### Usage

When creating a new `RedisCacher` instance, make sure that the engine type in `options` is `'MEMORY'`. The name and options are provided to the `super()` call, initializing the base cache with these values.

After instantiation, you can leverage all the methods inherited from `AbstractCache` (`has`, `set`, `get`, `delete`, and `clear`). They have been specifically implemented within this class for a Redis-based caching strategy.

Remember to close the Redis connection once all operations are done, using the `.close()` method.
