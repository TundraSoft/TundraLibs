/**
 * Cacher quickstart — the MEMORY engine, end to end.
 *
 * `MEMORY` is the only built-in engine that needs no external service, so
 * it is the one engine a standalone example can actually run. Every
 * operation below (`set`/`get`/`has`/`delete`/`clear`) is common to all
 * three engines — see ../../engines/Cacher-Engines.md#common-api — but a
 * few behaviours are engine-specific. Each such section is called out in a
 * comment naming exactly how REDIS/MEMCACHED would differ, sourced from
 * ../../README.md and the per-engine docs (../../engines/*\/Cacher-*.md).
 * `remote-config.ts` in this same directory shows the REDIS/MEMCACHED
 * *configuration* shape without connecting to either.
 *
 * Run on any runtime:
 *
 * ```bash
 * deno run packages/cacher/examples/quickstart/memory.ts
 * bun run packages/cacher/examples/quickstart/memory.ts
 * node --import tsx packages/cacher/examples/quickstart/memory.ts
 * ```
 * @module
 */
import { Cacher } from '@tundralibs/cacher';
import { MemoryCacher } from '@tundralibs/cacher/engines';

const say = (title: string, value: unknown) =>
  console.log(`\n▶ ${title}`, JSON.stringify(value));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// 1. Basics — Cacher.create() + set/get/has/delete
// ---------------------------------------------------------------------------
// The Cacher manager is the recommended entry point: it registers MEMORY,
// REDIS and MEMCACHED on import and hands back a shared, named instance.
const cache = Cacher.create('MEMORY', 'quickstart', { defaultExpiry: 300 });

await cache.set('user:1', { name: 'Alice', role: 'admin' });
const user = await cache.get<{ name: string; role: string }>('user:1');
say('1. set + get', user);

say('1. has (present)', await cache.has('user:1'));
await cache.delete('user:1');
say('1. has (after delete)', await cache.has('user:1'));

// ---------------------------------------------------------------------------
// 2. Per-entry TTL — options.expiry overrides the instance's defaultExpiry
// ---------------------------------------------------------------------------
const ttlCache = Cacher.create('MEMORY', 'ttl-demo', { defaultExpiry: 60 });

await ttlCache.set('rate:user:42', 1, { expiry: 10 }); // short-lived counter
await ttlCache.set('config:features', { beta: true }, { expiry: 0 }); // 0 = never expire
say('2. per-entry TTL both present', {
  counter: await ttlCache.has('rate:user:42'),
  neverExpires: await ttlCache.has('config:features'),
});

// ---------------------------------------------------------------------------
// 3. Fractional TTL — MEMORY-only sub-second precision
// ---------------------------------------------------------------------------
// README.md's `set<T>()` section: `expiry` accepts fractional seconds, but
// only MEMORY honours sub-second precision (it uses millisecond timers).
// REDIS rounds a fractional TTL UP to the next whole second (1.2 -> 2s).
// MEMCACHED truncates toward zero (1.9 -> 1s), except a positive sub-second
// value is clamped up to 1s (0.2 -> 1s) so it is never mistaken for the
// "never expire" sentinel 0. An `expiry` of exactly 0 always means "never
// expire" on every engine, including MEMORY.
const subSecondCache = Cacher.create('MEMORY', 'sub-second-demo', {});

await subSecondCache.set('flash', 'gone-soon', { expiry: 0.05 }); // 50ms
say('3. sub-second TTL, immediately', await subSecondCache.has('flash'));
await sleep(120);
say('3. sub-second TTL, after 120ms', await subSecondCache.has('flash'));

// ---------------------------------------------------------------------------
// 4. Window mode — sliding expiry, reset on every get()
// ---------------------------------------------------------------------------
const windowCache = Cacher.create('MEMORY', 'window-demo', {
  defaultExpiry: 0.1, // 100ms, so the demo doesn't need a long sleep
});

await windowCache.set('active-session', { userId: 42 }, { window: true });
await sleep(60); // well under the 100ms TTL
await windowCache.get('active-session'); // <- resets the TTL to another 100ms
await sleep(60); // would have expired by 120ms total if the TTL had NOT reset
say(
  '4. window mode survives past the original TTL',
  await windowCache.has('active-session'),
);

// ---------------------------------------------------------------------------
// 5. has() — cheap here, not on every engine
// ---------------------------------------------------------------------------
// On MEMORY, has() is a local map lookup (plus the same lazy-deadline check
// get() does) — effectively free. That is NOT universal: Cacher-Redis.md
// documents REDIS's has() as a single O(1) `EXISTS`, no value transfer,
// while Cacher-Memcached.md documents MEMCACHED's has() as fetching and
// discarding the *full* value — the protocol has no lightweight existence
// check, so calling has() before get() on Memcached doubles the transfer
// for no benefit. Prefer calling get() directly there and checking the
// result.
say(
  '5. has() after the entry above expired',
  await subSecondCache.has('flash'),
);

// ---------------------------------------------------------------------------
// 6. Namespace isolation — same key, two instance names, no collision
// ---------------------------------------------------------------------------
// Every engine stores keys as `${name}:${key}` (AbstractEngine._normalizeKey),
// so two named instances never see each other's entries even for an
// identical key string.
const teamA = Cacher.create('MEMORY', 'ns-team-a', {});
const teamB = Cacher.create('MEMORY', 'ns-team-b', {});
await teamA.set('config', { owner: 'team-a' });
await teamB.set('config', { owner: 'team-b' });
say('6. namespace isolation', {
  a: await teamA.get('config'),
  b: await teamB.get('config'),
});

// ---------------------------------------------------------------------------
// 7. Cacher.create() on an existing name ignores `options`
// ---------------------------------------------------------------------------
// README.md's callout under `Cacher.create()`: calling create() again for a
// name that already has an instance returns that instance VERBATIM — the
// new `options` object is not read at all (only the `engine` type is
// checked). Proven here: the second create() asks for a 300s default, but
// the entry set afterwards still expires on the FIRST call's 50ms default.
const ignoreDemo1 = Cacher.create('MEMORY', 'ignore-demo', {
  defaultExpiry: 0.05,
});
Cacher.create('MEMORY', 'ignore-demo', { defaultExpiry: 300 }); // silently ignored
await ignoreDemo1.set('probe', 'still-uses-50ms-default');
await sleep(120);
say(
  '7. re-create() options ignored (still expired)',
  await ignoreDemo1.has('probe'),
);

// The only way to change an existing name's engine/options: removeInstance()
// first, then create() again — this time the options really do apply.
await Cacher.removeInstance('ignore-demo');
const ignoreDemo2 = Cacher.create('MEMORY', 'ignore-demo', {
  defaultExpiry: 300,
});
say(
  '7. after removeInstance() + re-create(), fresh instance has no data',
  await ignoreDemo2.has('probe'),
);

// ---------------------------------------------------------------------------
// 8. cache.clear() (instance) vs Cacher.clear() (manager)
// ---------------------------------------------------------------------------
// These are NOT the same operation, despite the shared name:
//   - cache.clear()  empties ONE instance's entries; the instance stays
//                     connected and registered (Cacher.hasInstance() still
//                     true afterwards).
//   - Cacher.clear() finalizes and unregisters EVERY active instance
//                     process-wide; Cacher.getInstance(name) returns
//                     undefined for every name afterwards.
const clearDemo = Cacher.create('MEMORY', 'clear-instance-demo', {});
await clearDemo.set('a', 1);
await clearDemo.clear(); // instance-level: data gone, instance still registered
say('8. cache.clear() empties data but keeps the instance registered', {
  hasData: await clearDemo.has('a'),
  stillRegistered: Cacher.hasInstance('clear-instance-demo'),
});

const activeBefore = Cacher.getActiveInstances();
await Cacher.clear(); // manager-level: every instance torn down and forgotten
say('8. Cacher.clear() unregisters every instance', {
  before: activeBefore.length,
  after: Cacher.getActiveInstances().length,
});

// ---------------------------------------------------------------------------
// 9. Direct engine instantiation — bypassing the manager
// ---------------------------------------------------------------------------
// `Cacher.create()` is the recommended path (shared, named instances), but
// every engine can be constructed directly from `@tundralibs/cacher/engines`
// when a standalone, unshared cache is all that's needed.
const direct = new MemoryCacher('direct-demo', { defaultExpiry: 300 });
await direct.set('key', 'value');
say('9. direct MemoryCacher instantiation', await direct.get('key'));
direct.finalize(); // MemoryCacher.finalize() is synchronous: clears + releases timers
