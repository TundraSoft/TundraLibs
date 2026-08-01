/**
 * @module
 *
 * `BaseEngine` is the historical name for the driver engine that *has* a
 * connection pool. The engine hierarchy was split into a pool-free
 * {@link ConnectionEngine} root and a pooled {@link PooledConnectionEngine}
 * layer (see `ConnectionEngine.ts`); `BaseEngine` is retained as an alias for
 * the pooled layer so existing `extends BaseEngine` subclasses (and the
 * `@tundralibs/drivers` public export) keep working unchanged.
 *
 * New pooled engines may extend either name; new engines that manage their own
 * connections (e.g. a driver whose client pools internally, or an
 * edge/serverless HTTP driver) should extend {@link ConnectionEngine} instead.
 */

export { PooledConnectionEngine as BaseEngine } from './ConnectionEngine.ts';
