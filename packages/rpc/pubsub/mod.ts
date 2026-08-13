/**
 * @fileoverview Pub/Sub adapter exports.
 *
 * Runtime-safe: nothing reachable from this barrel imports a test
 * framework. The conformance harness deliberately lives behind its
 * own `@tundralibs/rpc/conformance` sub-path — it imports
 * `@tundralibs/compat/test`, which resolves `bun:test` / `node:test`
 * at runtime and hard-fails bundlers that target browsers or edge
 * workers. Never re-export it from here or from the root barrel.
 *
 * @module
 */

export {
  type AdapterCapabilities,
  PubSubAdapter,
  type Subscription,
} from './Adapter.ts';

export { MemoryPubSubAdapter } from './MemoryPubSubAdapter.ts';
