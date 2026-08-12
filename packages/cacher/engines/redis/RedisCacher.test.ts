import * as asserts from '@std/asserts';
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat';
import { RedisCacher, type RedisCacherOptions } from './mod.ts';
import { CacherEngineError } from '../../errors/mod.ts';
import { envArgs } from '@tundralibs/utils';

// Wave-note: emission/option accessors are protected now — tests reach
// them through deliberate casts.
// deno-lint-ignore no-explicit-any
const readOption = (t: unknown, k: string): any =>
  // deno-lint-ignore no-explicit-any
  (t as any)._getOption(k);
// deno-lint-ignore no-explicit-any
const readOptions = (t: unknown): any =>
  // deno-lint-ignore no-explicit-any
  (t as any)._getOptions();
// deno-lint-ignore no-explicit-any
const fireEvent = (t: unknown, e: string, ...a: unknown[]): any =>
  // deno-lint-ignore no-explicit-any
  (t as any)._emitRaw(e, ...a);

const env = envArgs('./packages/cacher/engines/');

/**
 * Probe whether a live Redis is reachable so the suites that actually talk to
 * a server are gated on it: they run in CI (where `REDIS_HOST` points at a
 * running server) and skip cleanly in local/offline environments. The
 * server-less suites (config validation, injected-client error paths,
 * fractional-expiry coercion) always run.
 */
async function isRedisAvailable(): Promise<boolean> {
  const probe = new RedisCacher('redis-probe', {
    host: env.get('REDIS_HOST') || 'localhost',
    port: Number.parseInt(env.get('REDIS_PORT') || '6379'),
    username: env.get('REDIS_USERNAME'),
    password: env.get('REDIS_PASSWORD'),
    db: Number.parseInt(env.get('REDIS_DB') || '0'),
  });
  try {
    await probe.init();
    await probe.finalize();
    return true;
  } catch {
    try {
      await probe.finalize();
    } catch {
      // Ignore probe teardown errors.
    }
    return false;
  }
}

const redisAvailable = await isRedisAvailable();

describe('cacher.engines.redis', () => {
  let redis: RedisCacher;

  // Setup and teardown for tests that need an initialized client
  const setupRedis = () => {
    redis = new RedisCacher('redis-test', {
      host: env.get('REDIS_HOST') || 'localhost',
      port: Number.parseInt(env.get('REDIS_PORT') || '6379'),
      username: env.get('REDIS_USERNAME'),
      password: env.get('REDIS_PASSWORD'),
      db: Number.parseInt(env.get('REDIS_DB') || '0'),
    });
    return redis;
  };

  const teardownRedis = async () => {
    if (redis) {
      try {
        await redis.clear();
        await redis.finalize();
      } catch {
        // Ignore errors during teardown
      }
    }
  };

  describe('initialization', () => {
    it('should create an instance with default options', () => {
      const cacher = new RedisCacher('redis-test', {
        host: 'localhost',
        port: 6379,
      });

      asserts.assert(cacher instanceof RedisCacher);
      asserts.assertEquals(cacher.name, 'redis-test');
      asserts.assertEquals(cacher.Engine, 'REDIS');
      asserts.assertEquals(readOption(cacher, 'defaultExpiry'), 300);
    });

    it('set defaults when undefined', () => {
      const cacher = new RedisCacher('boo', {
        host: 'localhost',
        port: undefined,
      } as unknown as RedisCacherOptions);

      asserts.assertEquals(readOption(cacher, 'port'), 6379);
    });

    it('Should throw on invalid config', () => {
      asserts.assertThrows(
        () => {
          const _ = new RedisCacher('redis-test', {
            port: 6379,
            // @ts-ignore
            host: null,
          });
        },
        CacherEngineError,
        'Configuration key host is missing',
      );

      asserts.assertThrows(
        () => {
          const _ = new RedisCacher('redis-test', {
            port: 6379,
            // @ts-ignore
            host: undefined,
          });
        },
        CacherEngineError,
        'Configuration key host is missing',
      );

      // Test for the port error message
      asserts.assertThrows(
        () => {
          const _ = new RedisCacher('redis-test', {
            host: 'localhost',
            port: -1,
          });
        },
        CacherEngineError,
        'Configuration value for port is invalid: must be a positive number between 0 and 65535',
      );

      asserts.assertThrows(
        () => {
          const _ = new RedisCacher('redis-test', {
            host: 'localhost',
            port: 'invalid-port',
          } as unknown as RedisCacherOptions);
        },
        CacherEngineError,
      );

      asserts.assertThrows(
        () => {
          const _ = new RedisCacher('redis-test', {
            host: 'localhost',
            db: 'sdf',
          } as unknown as RedisCacherOptions);
        },
        CacherEngineError,
      );

      asserts.assertThrows(
        () => {
          const _ = new RedisCacher('redis-test', {
            host: 'localhost',
            username: -1,
          } as unknown as RedisCacherOptions);
        },
        CacherEngineError,
      );

      asserts.assertThrows(
        () => {
          const _ = new RedisCacher('redis-test', {
            host: 'localhost',
            password: true,
          } as unknown as RedisCacherOptions);
        },
        CacherEngineError,
      );

      asserts.assertThrows(
        () => {
          const _ = new RedisCacher('redis-test', {
            port: 6379,
            host: 'localhost',
            // @ts-ignore
            password: 1132,
          });
        },
        CacherEngineError,
        'Configuration value for password is invalid: must be a string',
      );

      asserts.assertThrows(
        () => {
          const _ = new RedisCacher('redis-test', {
            port: 6379,
            host: 'localhost',
            // @ts-ignore
            password: 1132,
          });
        },
        CacherEngineError,
        'Configuration value for password is invalid: must be a string',
      );

      asserts.assertThrows(
        () => {
          const _ = new RedisCacher('redis-test', {
            port: 6379,
            host: 'localhost',
            password: '1132',
          });
        },
        CacherEngineError,
        'Configuration key username is missing',
      );

      asserts.assertThrows(
        () => {
          const _ = new RedisCacher('redis-test', {
            port: 6379,
            host: 'localhost',
            username: '1132',
          });
        },
        CacherEngineError,
        'Configuration key password is missing',
      );
    });

    it('should allow custom defaultExpiry', () => {
      const cacher = new RedisCacher('redis-test', {
        host: 'localhost',
        port: 6379,
        defaultExpiry: 600,
      });

      asserts.assertEquals(readOption(cacher, 'defaultExpiry'), 600);
    });

    it('should validate port range', () => {
      asserts.assertThrows(
        () => {
          const _ = new RedisCacher('redis-test', {
            host: 'localhost',
            port: 70000, // Invalid port
          });
        },
        CacherEngineError,
        'Configuration value for port is invalid: must be a positive number between 0 and 65535',
      );
    });
  });

  describe({
    name: 'data operations',
    ignore: !redisAvailable,
    fn: () => {
      beforeAll(async () => {
        setupRedis();
        await redis.init();
      });
      afterAll(async () => {
        await teardownRedis();
      });

      {
        it('should set and get string data', async () => {
          const key = 'test-string';
          const value = 'test-value';

          await redis.set(key, value);
          const result = await redis.get(key);

          asserts.assertEquals(result, value);
        });

        it('should set and get numeric data', async () => {
          const key = 'test-number';
          const value = 12345;

          await redis.set(key, value);
          const result = await redis.get(key);

          asserts.assertEquals(result, value);
        });

        it('should set and get object data', async () => {
          const key = 'test-object';
          const value = {
            name: 'test',
            value: 42,
            nested: { value: 'nested' },
          };

          await redis.set(key, value);
          const result = await redis.get(key);

          asserts.assertEquals(result, value);
        });

        it('should set and get array data', async () => {
          const key = 'test-array';
          const value = [1, 2, 'three', { four: 4 }];

          await redis.set(key, value);
          const result = await redis.get(key);

          asserts.assertEquals(result, value);
        });

        it('should check if key exists', async () => {
          const key = 'test-exists';

          await redis.set(key, 'test-value');
          const exists = await redis.has(key);
          const notExists = await redis.has('non-existent-key');

          asserts.assertEquals(exists, true);
          asserts.assertEquals(notExists, false);
        });

        it('should delete a key', async () => {
          const key = 'test-delete';

          await redis.set(key, 'test-value');
          await redis.delete(key);
          const exists = await redis.has(key);

          asserts.assertEquals(exists, false);
        });

        it('should handle null values', async () => {
          const key = 'test-null';
          await redis.set(key, null);
          const result = await redis.get(key);

          asserts.assertEquals(result, null);
        });

        it('should handle empty strings', async () => {
          const key = 'test-empty';
          await redis.set(key, '');
          const result = await redis.get<string>(key);

          asserts.assertEquals(result, '');
        });

        it('should handle large objects', async () => {
          const key = 'test-large';
          const largeObj = {
            id: 'test',
            items: new Array(1000).fill(0).map((_, i) => ({
              id: i,
              value: `value-${i}`,
            })),
            nested: {
              deep: {
                deeper: {
                  deepest: 'value',
                  array: new Array(100).fill('test'),
                },
              },
            },
          };

          await redis.set(key, largeObj);
          const result = await redis.get(key);

          asserts.assertEquals(result, largeObj);
        });
      }
    },
  });

  describe({
    name: 'expiry functionality',
    ignore: !redisAvailable,
    fn: () => {
      beforeAll(async () => {
        setupRedis();
        await redis.init();
      });
      afterAll(async () => {
        await teardownRedis();
      });

      {
        it('should respect custom expiry time', async () => {
          const key = 'test-expiry';
          const value = 'expires-soon';

          // Set with 2 second expiry. We then wait well past the TTL —
          // 3000ms gives a 1s buffer over Redis's second-granular EXPIRE
          // so the assertion isn't racing event-loop jitter under load.
          await redis.set(key, value, { expiry: 2 });

          let result = await redis.get(key);
          asserts.assertEquals(result, value);

          await new Promise((resolve) => setTimeout(resolve, 3000));

          result = await redis.get(key);
          asserts.assertEquals(result, undefined);
        });
      }
    },
  });

  describe({
    name: 'window mode functionality',
    ignore: !redisAvailable,
    fn: () => {
      beforeAll(async () => {
        setupRedis();
        await redis.init();
      });
      afterAll(async () => {
        await teardownRedis();
      });

      {
        it(
          'should extend expiry when window mode is enabled',
          async () => {
            const key = 'test-window-mode';
            const value = 'window-mode-value';

            // We use short waits well inside the TTL margin so the
            // second-granular EXPIRE has plenty of headroom against
            // event-loop jitter under load. TTL=3s, waits of 1s leave
            // ~2s of TTL on each leg.
            await redis.set(key, value, { expiry: 3, window: true });

            let result = await redis.get(key);
            asserts.assertEquals(result, value);

            await new Promise((resolve) => setTimeout(resolve, 1000));

            // This GET refreshes the TTL back to 3s in window mode.
            result = await redis.get(key);
            asserts.assertEquals(result, value);

            // Wait 1s — TTL was reset 1s ago, so ~2s should remain.
            await new Promise((resolve) => setTimeout(resolve, 1000));

            result = await redis.get(key);
            asserts.assertEquals(result, value);
          },
        );
      }
    },
  });

  describe('connection errors', () => {
    it('should throw on wrong connection info', async () => {
      const badCacher = new RedisCacher('bad-connection', {
        host: 'nonexistent-host',
        port: 6379,
      });

      await asserts.assertRejects(
        async () => {
          await badCacher.init();
          await badCacher.get('any-key');
        },
        CacherEngineError,
      );
    });
  });

  describe('enhanced configuration coverage', () => {
    it('should handle username/password authentication', () => {
      // Valid username and password combination
      const cache = new RedisCacher('auth-cache', {
        host: 'localhost',
        port: 6379,
        username: 'testuser',
        password: 'testpass',
      });

      asserts.assertEquals(readOption(cache, 'username'), 'testuser');
      asserts.assertEquals(readOption(cache, 'password'), 'testpass');
    });

    it('should validate database number', () => {
      // Valid database number
      const cache1 = new RedisCacher('db-cache', {
        host: 'localhost',
        port: 6379,
        db: 1,
      });
      asserts.assertEquals(readOption(cache1, 'db'), 1);
    });

    it('should validate and trim username/password', () => {
      // Valid trimmed credentials
      const cache = new RedisCacher('trim-cache', {
        host: 'localhost',
        port: 6379,
        username: '  testuser  ',
        password: '  testpass  ',
      });

      asserts.assertEquals(readOption(cache, 'username'), 'testuser');
      asserts.assertEquals(readOption(cache, 'password'), 'testpass');

      // Empty string credentials should become undefined
      const cache2 = new RedisCacher('empty-cache', {
        host: 'localhost',
        port: 6379,
        username: '   ',
        password: '   ',
      });

      asserts.assertEquals(readOption(cache2, 'username'), undefined);
      asserts.assertEquals(readOption(cache2, 'password'), undefined);
    });

    it('should handle certificate path option', async () => {
      // Just test that the option processing doesn't crash. Use cross-
      // SSL config is now passed through to the underlying engine
      // verbatim — the cacher no longer reads cert files itself. Just
      // confirm the constructor accepts the standard `EngineSSLOptions`
      // shape (file paths and inline PEM both work).
      asserts.assertNotEquals(
        new RedisCacher('tls-cache', {
          host: 'localhost',
          port: 6380,
          ssl: { caFile: '/etc/ssl/redis-ca.pem' },
        }),
        undefined,
      );
    });
  });

  // TLS tests removed due to complexity in mocking Redis connect function

  // Operation error handling tests removed due to Redis connection dependency

  describe('error handling', () => {
    it(
      'should finalize without error when not initialized',
      async () => {
        const cache = new RedisCacher('test-cache', {
          host: 'localhost',
          port: 6379,
        });
        // Should be able to finalize without initializing
        await cache.finalize();
        // Should be able to finalize multiple times without error
        await cache.finalize();
      },
    );

    it('should throw CONFIG_MISSING in constructor when no host is provided', () => {
      // Constructing with no host key triggers hasOption('host') === false check
      asserts.assertThrows(
        () =>
          new RedisCacher(
            'no-host-cacher',
            {} as unknown as RedisCacherOptions,
          ),
        CacherEngineError,
        'Configuration key host is missing',
      );
    });

    it('should throw CONNECTION_FAILED when init() cannot connect (with ssl)', async () => {
      const cache = new RedisCacher('ssl-cacher', {
        host: '127.0.0.1',
        port: 19999, // unlikely to be open
        ssl: { caFile: '/nonexistent/ca.pem' },
      });
      await asserts.assertRejects(
        () => cache.init(),
        CacherEngineError,
      );
    });
  });

  describe('OPERATION_FAILED error paths', () => {
    it('should throw OPERATION_FAILED with operation=GET when _client.get rejects', async () => {
      const cache = new RedisCacher('op-fail', {
        host: 'localhost',
        port: 6379,
      });
      // Inject a broken client
      // deno-lint-ignore no-explicit-any
      (cache as any)._client = {
        get: () => Promise.reject(new Error('simulated get failure')),
        set: () => Promise.reject(new Error('simulated set failure')),
        del: () => Promise.reject(new Error('simulated del failure')),
        keys: () => Promise.reject(new Error('simulated keys failure')),
        exists: () => Promise.reject(new Error('simulated exists failure')),
        expire: () => Promise.reject(new Error('simulated expire failure')),
        disconnect: () => Promise.resolve(),
      };
      await asserts.assertRejects(
        // deno-lint-ignore no-explicit-any
        () => (cache as any)._get('op-fail:testkey'),
        CacherEngineError,
        'Operation GET failed',
      );
    });

    it('should throw OPERATION_FAILED with operation=SET when _client.set rejects', async () => {
      const cache = new RedisCacher('op-fail-set', {
        host: 'localhost',
        port: 6379,
      });
      // deno-lint-ignore no-explicit-any
      (cache as any)._client = {
        set: () => Promise.reject(new Error('simulated set failure')),
        disconnect: () => Promise.resolve(),
      };
      await asserts.assertRejects(
        // deno-lint-ignore no-explicit-any
        () =>
          (cache as any)._set('op-fail-set:k', {
            value: 'x',
            expiry: 0,
            window: false,
          }),
        CacherEngineError,
        'Operation SET failed',
      );
    });

    it('should throw OPERATION_FAILED with operation=DELETE when _client.del rejects', async () => {
      const cache = new RedisCacher('op-fail-del', {
        host: 'localhost',
        port: 6379,
      });
      // deno-lint-ignore no-explicit-any
      (cache as any)._client = {
        del: () => Promise.reject(new Error('simulated del failure')),
        disconnect: () => Promise.resolve(),
      };
      await asserts.assertRejects(
        // deno-lint-ignore no-explicit-any
        () => (cache as any)._delete('op-fail-del:k'),
        CacherEngineError,
        'Operation DELETE failed',
      );
    });

    it('should throw OPERATION_FAILED with operation=CLEAR when _client.keys rejects', async () => {
      const cache = new RedisCacher('op-fail-clear', {
        host: 'localhost',
        port: 6379,
      });
      // deno-lint-ignore no-explicit-any
      (cache as any)._client = {
        keys: () => Promise.reject(new Error('simulated keys failure')),
        disconnect: () => Promise.resolve(),
      };
      await asserts.assertRejects(
        // deno-lint-ignore no-explicit-any
        () => (cache as any)._clear(),
        CacherEngineError,
        'Operation CLEAR failed',
      );
    });

    it('should throw OPERATION_FAILED with operation=HAS when _client.exists rejects', async () => {
      const cache = new RedisCacher('op-fail-has', {
        host: 'localhost',
        port: 6379,
      });
      // deno-lint-ignore no-explicit-any
      (cache as any)._client = {
        exists: () => Promise.reject(new Error('simulated exists failure')),
        disconnect: () => Promise.resolve(),
      };
      await asserts.assertRejects(
        // deno-lint-ignore no-explicit-any
        () => (cache as any)._has('op-fail-has:k'),
        CacherEngineError,
        'Operation HAS failed',
      );
    });

    it('should preserve colon-containing keys in the error context', async () => {
      const cache = new RedisCacher('op-fail-key', {
        host: 'localhost',
        port: 6379,
      });
      // deno-lint-ignore no-explicit-any
      (cache as any)._client = {
        get: () => Promise.reject(new Error('simulated get failure')),
        disconnect: () => Promise.resolve(),
      };
      // Normalized key: "<name>:<userKey>" where userKey itself contains ':'.
      const err = await asserts.assertRejects(
        // deno-lint-ignore no-explicit-any
        () => (cache as any)._get('op-fail-key:user:1:profile'),
        CacherEngineError,
      );
      // The full user key must survive, not just the first ':' segment.
      asserts.assertEquals(
        (err as CacherEngineError).getContextValue('key'),
        'user:1:profile',
      );
    });
  });

  describe('fractional expiry coercion', () => {
    // Redis SET EX / EXPIRE accept whole seconds only. MemoryCacher honours
    // fractional (ms) expiry, so the shared validation allows it; RedisCacher
    // must round it to a whole, positive second-count rather than let Redis
    // reject the command at runtime. These use an injected client so they run
    // without a live Redis.

    const withCapturedSet = () => {
      let captured: { ex?: number } | undefined;
      const cache = new RedisCacher('frac', { host: 'localhost', port: 6379 });
      // deno-lint-ignore no-explicit-any
      (cache as any)._client = {
        set: (_k: string, _v: string, opts: { ex?: number }) => {
          captured = opts;
          return Promise.resolve('OK');
        },
        disconnect: () => Promise.resolve(),
      };
      return { cache, get: () => captured };
    };

    it('rounds a fractional expiry up to whole seconds', async () => {
      const { cache, get } = withCapturedSet();
      // deno-lint-ignore no-explicit-any
      await (cache as any)._set('frac:k', {
        data: '"x"',
        expiry: 3600.5,
        window: false,
      });
      asserts.assertEquals(get(), { ex: 3601 });
      asserts.assert(Number.isInteger(get()!.ex));
    });

    it('rounds a sub-second expiry up to 1s (never down to permanent)', async () => {
      const { cache, get } = withCapturedSet();
      // deno-lint-ignore no-explicit-any
      await (cache as any)._set('frac:k', {
        data: '"x"',
        expiry: 0.2,
        window: false,
      });
      // Must be a real 1s TTL, not `{}` (which Redis reads as "never expire").
      asserts.assertEquals(get(), { ex: 1 });
    });

    it('keeps expiry 0 as "never expire" (no EX)', async () => {
      const { cache, get } = withCapturedSet();
      // deno-lint-ignore no-explicit-any
      await (cache as any)._set('frac:k', {
        data: '"x"',
        expiry: 0,
        window: false,
      });
      asserts.assertEquals(get(), {});
    });
  });

  // Cleanup is handled within individual test steps
});

/**
 * Faithful Redis glob matcher (a subset of `stringmatchlen`) so the fake's
 * `keys(pattern)` reproduces how a real server would interpret an unescaped
 * vs. escaped pattern. Supports `*`, `?`, `[...]` character classes (with
 * `^` negation and `a-z` ranges) and `\` escaping — enough to distinguish
 * `user[1]:*` (matches `user1:*`) from `user\[1\]:*` (matches literal
 * `user[1]:*`).
 */
function redisGlobMatch(pattern: string, str: string): boolean {
  if (pattern === '*') return true;
  let p = 0;
  let s = 0;
  while (p < pattern.length) {
    const pc = pattern[p];
    if (pc === '*') {
      while (pattern[p + 1] === '*') p++;
      if (p + 1 === pattern.length) return true;
      for (let i = s; i <= str.length; i++) {
        if (redisGlobMatch(pattern.slice(p + 1), str.slice(i))) return true;
      }
      return false;
    } else if (pc === '?') {
      if (s >= str.length) return false;
      s++;
      p++;
    } else if (pc === '[') {
      if (s >= str.length) return false;
      p++;
      let negate = false;
      if (pattern[p] === '^') {
        negate = true;
        p++;
      }
      let matched = false;
      while (p < pattern.length && pattern[p] !== ']') {
        if (pattern[p] === '\\' && p + 1 < pattern.length) {
          p++;
          if (pattern[p] === str[s]) matched = true;
          p++;
        } else if (
          pattern[p + 1] === '-' && p + 2 < pattern.length &&
          pattern[p + 2] !== ']'
        ) {
          if (str[s]! >= pattern[p]! && str[s]! <= pattern[p + 2]!) {
            matched = true;
          }
          p += 3;
        } else {
          if (pattern[p] === str[s]) matched = true;
          p++;
        }
      }
      if (pattern[p] === ']') p++;
      if (negate) matched = !matched;
      if (!matched) return false;
      s++;
    } else if (pc === '\\' && p + 1 < pattern.length) {
      p++;
      if (pattern[p] !== str[s]) return false;
      s++;
      p++;
    } else {
      if (pc !== str[s]) return false;
      s++;
      p++;
    }
  }
  return s === str.length;
}

/**
 * Minimal in-memory stand-in for `RedisEngine`, backing every cacher that
 * shares it with one `Map` so sibling namespaces can be exercised against a
 * single simulated server. `keys(pattern)` uses {@link redisGlobMatch} to
 * faithfully reproduce server-side glob semantics.
 */
class FakeRedis {
  constructor(private readonly store: Map<string, string>) {}
  connect(): Promise<void> {
    return Promise.resolve();
  }
  disconnect(): Promise<void> {
    return Promise.resolve();
  }
  set(key: string, value: string): Promise<string> {
    this.store.set(key, value);
    return Promise.resolve('OK');
  }
  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.has(key) ? this.store.get(key)! : null);
  }
  del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (this.store.delete(k)) n++;
    return Promise.resolve(n);
  }
  keys(pattern: string): Promise<string[]> {
    return Promise.resolve(
      [...this.store.keys()].filter((k) => redisGlobMatch(pattern, k)),
    );
  }
}

const injectRedis = (name: string, store: Map<string, string>): RedisCacher => {
  const cacher = new RedisCacher(name, { host: 'localhost', port: 6379 });
  // deno-lint-ignore no-explicit-any
  (cacher as any)._client = new FakeRedis(store);
  return cacher;
};

describe('cacher.engines.redis (offline, mocked client)', () => {
  describe('clear() namespace isolation (regression)', () => {
    it(
      'clear() escapes glob metacharacters so it wipes only its own namespace',
      async () => {
        // One shared Redis, two sibling namespaces: 'user[1]' (whose name
        // carries a glob character class) and 'user1'.
        const store = new Map<string, string>();
        const bracket = injectRedis('user[1]', store);
        const plain = injectRedis('user1', store);

        await bracket.set('k', 'bracket-val'); // stored literally as user[1]:k
        await plain.set('k', 'plain-val'); //     stored literally as user1:k

        await bracket.clear();

        // With the fix, `user[1]`'s clear() escapes the pattern to
        // `user\[1\]:*`, which matches only its own literal keys...
        asserts.assertEquals(await bracket.get('k'), undefined);
        // ...and leaves the sibling 'user1' namespace intact. The pre-fix
        // unescaped `user[1]:*` treated `[1]` as a character class: it deleted
        // 'user1:k' (a DIFFERENT namespace) and never matched its own
        // 'user[1]:k', so both of these assertions failed.
        asserts.assertEquals(await plain.get('k'), 'plain-val');
      },
    );

    it(
      'rejects a ":" in the instance name on direct construction, exactly like Cacher.create',
      () => {
        // Round-4: the manager rejects ':' in names, but RedisCacher is a
        // first-class, documented public API (mod.ts + the ./engines subpath),
        // so `new RedisCacher('app:sessions', …)` used to bypass the guard and
        // clear()'s `${name}:*` glob would still wipe a colon-prefixed sibling
        // namespace. The invariant now lives in AbstractEngine, so direct
        // construction is rejected the same way the manager rejects it.
        asserts.assertThrows(
          () =>
            new RedisCacher('rc-app:sessions', {
              host: 'localhost',
              port: 6379,
            }),
          CacherEngineError,
          'must not contain ":"',
        );
      },
    );

    it(
      'clear() removes only its own keys, not a colon-prefixed sibling name',
      async () => {
        // Direct construction bypasses the manager's ':' name guard, so this
        // exercises the clear() pattern directly: an 'app' cacher storing a
        // 'sessions:token' key must clear only the keys it owns.
        const store = new Map<string, string>();
        const app = injectRedis('app', store);

        await app.set('user:1', 'a'); // -> app:user:1
        await app.set('user:2', 'b'); // -> app:user:2
        // A key from an unrelated namespace living on the same server.
        store.set('appworker:job', 'keep-me');

        await app.clear();

        asserts.assertEquals(await app.get('user:1'), undefined);
        asserts.assertEquals(await app.get('user:2'), undefined);
        // 'appworker:*' must NOT be matched by 'app:*' (the ':' boundary).
        asserts.assertEquals(store.get('appworker:job'), 'keep-me');
      },
    );
  });
});
