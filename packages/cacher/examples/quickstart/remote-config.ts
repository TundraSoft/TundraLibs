/**
 * Cacher quickstart — REDIS / MEMCACHED configuration shapes, no connection.
 *
 * `RedisCacher` and `MemCacher` both connect lazily: per
 * ../../engines/Cacher-Engines.md#init, the underlying socket is only
 * opened on the first cache operation (or an explicit `init()`), never in
 * the constructor. That means every construction below is safe to run with
 * no Redis or Memcached server reachable — this file never calls `init()`,
 * `set()`, `get()`, `has()`, `delete()`, or `clear()` on any of them, so it
 * never attempts network I/O.
 *
 * What it demonstrates instead is the *options* shape documented in
 * ../../engines/redis/Cacher-Redis.md and
 * ../../engines/memcached/Cacher-Memcached.md — including two behaviours a
 * docs pass over this package specifically corrected:
 *
 *   - `EngineSSLOptions.ca` is an ARRAY of PEM strings (`string[]`), not a
 *     single PEM string.
 *   - Inline TLS material (`ca`/`cert`/`key`) and file-path TLS material
 *     (`caFile`/`certFile`/`keyFile`) are mutually exclusive PER `ssl`
 *     object — mixing them is rejected both at the type level (section 6
 *     below) and again at runtime once `init()` actually connects.
 *
 * Run on any runtime:
 *
 * ```bash
 * deno run packages/cacher/examples/quickstart/remote-config.ts
 * bun run packages/cacher/examples/quickstart/remote-config.ts
 * node --import tsx packages/cacher/examples/quickstart/remote-config.ts
 * ```
 * @module
 */
import { CacherEngineError } from '@tundralibs/cacher';
import { MemCacher, RedisCacher } from '@tundralibs/cacher/engines';
import type {
  MemCacherOptions,
  RedisCacherOptions,
} from '@tundralibs/cacher/engines';

const say = (title: string, value: unknown) =>
  console.log(`\n▶ ${title}`, JSON.stringify(value));

// ---------------------------------------------------------------------------
// 1. Redis — minimal config (only `host` is required; `port` defaults 6379)
// ---------------------------------------------------------------------------
const redisMinimal: RedisCacherOptions = { host: 'redis.example.com' };
new RedisCacher('redis-minimal', redisMinimal);
say('1. Redis minimal config constructs without connecting', redisMinimal);

// ---------------------------------------------------------------------------
// 2. Redis — with authentication (username + password + db select)
// ---------------------------------------------------------------------------
const redisAuth: RedisCacherOptions = {
  host: 'redis.example.com',
  port: 6379,
  username: 'app',
  password: 'strongpassword',
  db: 1,
  defaultExpiry: 600,
};
new RedisCacher('redis-auth', redisAuth);
say('2. Redis with auth constructs without connecting', {
  ...redisAuth,
  password: '[REDACTED]', // Cacher itself redacts this in error contexts; we do the same here
});

// ---------------------------------------------------------------------------
// 3. Redis — username/password pairing is a RUNTIME guard, not a type one
// ---------------------------------------------------------------------------
// RedisCacherOptions declares `username`/`password` as two independent
// optional fields — TypeScript happily accepts one without the other.
// Cacher-Redis.md documents that supplying only one throws CONFIG_MISSING;
// unlike the TLS mutual-exclusivity below, that check has no type-level
// equivalent, so this is a real thrown error, not a `@ts-expect-error`.
try {
  new RedisCacher('redis-half-auth', {
    host: 'redis.example.com',
    username: 'app',
  });
  say('3. username without password', 'did not throw (unexpected)');
} catch (err) {
  say('3. username without password throws CONFIG_MISSING', {
    isCacherEngineError: err instanceof CacherEngineError,
    code: err instanceof CacherEngineError ? err.code : undefined,
  });
}

// ---------------------------------------------------------------------------
// 4. Redis — TLS, default (system CA, no client cert)
// ---------------------------------------------------------------------------
const redisTlsDefault: RedisCacherOptions = {
  host: 'redis.example.com',
  ssl: true,
};
new RedisCacher('redis-tls-default', redisTlsDefault);
say('4. Redis TLS default constructs without connecting', redisTlsDefault);

// ---------------------------------------------------------------------------
// 5. Redis — TLS, custom material (pick ONE presentation style)
// ---------------------------------------------------------------------------
// File paths:
const redisTlsFiles: RedisCacherOptions = {
  host: 'redis.example.com',
  ssl: {
    caFile: '/etc/ssl/redis-ca.pem',
    certFile: '/etc/ssl/client.crt',
    keyFile: '/etc/ssl/client.key',
    rejectUnauthorized: true,
  },
};
new RedisCacher('redis-tls-files', redisTlsFiles);

// ...or inline PEM strings — note `ca` is an ARRAY, even for one CA cert:
const redisTlsInline: RedisCacherOptions = {
  host: 'redis.example.com',
  ssl: {
    ca: ['-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'],
    cert: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
    key: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
  },
};
new RedisCacher('redis-tls-inline', redisTlsInline);
say('5. Redis TLS (files or inline) both construct without connecting', {
  filesStyle: Object.keys(redisTlsFiles.ssl as object),
  inlineStyle: Object.keys(redisTlsInline.ssl as object),
});

// ---------------------------------------------------------------------------
// 6. Redis — mixing inline and file-path TLS fields is a TYPE error
// ---------------------------------------------------------------------------
// `ca` (inline PEM array) and `certFile` (file path) come from opposite
// arms of EngineSSLOptions' inline-XOR-file union (packages/compat/common.ts's
// `TLSOptions`); mixing them is rejected here at compile time, and RedisCacher
// would reject it again at runtime once `init()` actually connects and
// constructs the underlying `RedisEngine`.
const redisTlsMixed: RedisCacherOptions['ssl'] = {
  ca: ['-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'],
  // @ts-expect-error - `certFile` (file path) may not be combined with the
  // inline `ca` field set above; EngineSSLOptions is inline-XOR-file.
  certFile: '/etc/ssl/redis-ca.pem',
};
say(
  '6. mixed inline+file TLS only compiles via the @ts-expect-error above',
  typeof redisTlsMixed,
);

// ---------------------------------------------------------------------------
// 7. Memcached — minimal config + a custom buffer size
// ---------------------------------------------------------------------------
const memcachedMinimal: MemCacherOptions = { host: 'memcached.example.com' };
new MemCacher('memcached-minimal', memcachedMinimal);

const memcachedBuffer: MemCacherOptions = {
  host: 'memcached.example.com',
  maxBufferSize: 50, // MB; default is 10
};
new MemCacher('memcached-large-objects', memcachedBuffer);
say('7. Memcached minimal + custom buffer size construct without connecting', {
  minimal: memcachedMinimal,
  buffer: memcachedBuffer,
});

// ---------------------------------------------------------------------------
// 8. Memcached — TLS (managed offerings only; stock memcached has no TLS)
// ---------------------------------------------------------------------------
// Same `EngineSSLOptions` shape as Redis above, including the inline-vs-file
// exclusivity — Cacher-Memcached.md documents it as identical to Redis, so
// it isn't repeated here as a second @ts-expect-error.
const memcachedTls: MemCacherOptions = {
  host: 'my-cluster.abc123.cfg.euw1.cache.amazonaws.com',
  ssl: { caFile: '/etc/ssl/memcached-ca.pem', rejectUnauthorized: true },
};
new MemCacher('memcached-tls', memcachedTls);
say('8. Memcached TLS constructs without connecting', memcachedTls);
