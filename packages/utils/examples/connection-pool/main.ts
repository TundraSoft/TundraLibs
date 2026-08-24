/**
 * Connection pool — every `utils` core idea in one small app. Run on
 * any runtime:
 *
 * ```bash
 * deno run packages/utils/examples/connection-pool/main.ts
 * bun run packages/utils/examples/connection-pool/main.ts
 * node --import tsx packages/utils/examples/connection-pool/main.ts
 * ```
 *
 * See `packages/utils/examples/connection-pool/README.md` for what
 * each file demonstrates and where the deep-dive docs live.
 */
import type { BaseError } from '@tundralibs/utils';
import { ConnectionPool } from './ConnectionPool.ts';
import type { PoolErrorContext } from './PoolErrors.ts';

console.log('1. construct + subscribe to events');
const pool = new ConnectionPool({
  host: 'db.internal',
  maxConnections: 2,
  _onconnect: (n) => console.log(`   connect  → active=${n}`),
  _onexhausted: () => console.log('   exhausted → pool is full'),
});

console.log('\n2. @Singleton: a second construction is ignored');
const samePool = new ConnectionPool({ host: 'ignored', maxConnections: 99 });
console.log('   pool === samePool:', pool === samePool);
console.log(
  '   maxConnections (first construction wins):',
  pool.maxConnections,
);

console.log('\n3. use the pool up to its limit');
pool.connect();
pool.connect();

console.log('\n4. one more connect() throws a PoolConfigError (BaseError)');
try {
  pool.connect();
} catch (err) {
  const poolError = err as BaseError<PoolErrorContext>;
  console.log('   message:', poolError.message);
  console.log('   context:', poolError.context);
}

console.log('\n5. release() frees a slot, connect() succeeds again');
pool.release();
pool.connect();
console.log('   activeConnections:', pool.activeConnections);

console.log('\n6. resize() is validated the same way the constructor is');
try {
  pool.resize(0);
} catch (err) {
  console.log('   resize(0) rejected:', (err as BaseError).message);
}
pool.resize(5);
console.log('   resize(5) accepted, maxConnections:', pool.maxConnections);
