/**
 * @fileoverview The suite's Witness convention — a non-interfering wrap hook.
 *
 * @module
 */
import type { WitnessInfo } from './WitnessInfo.ts';

/**
 * The suite's **Witness** convention (shared shape with `@tundralibs/norm`):
 * a wrap hook that observes an operation without interfering. A witness
 * MUST call `fn` exactly once, return its result unchanged, and re-throw
 * its errors — `tracer.wrapClient` satisfies the contract by construction
 * and opens a `CLIENT` span per request.
 */
export type Witness = <T>(
  info: WitnessInfo,
  fn: () => Promise<T>,
) => Promise<T>;
