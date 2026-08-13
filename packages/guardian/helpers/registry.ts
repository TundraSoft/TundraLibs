/**
 * @fileoverview Late-binding registry for the guard constructors that
 * type-transition methods hand to `BaseGuardian.process()`.
 *
 * A transition like `NumberGuardian.toString()` has to produce a
 * {@link StringGuardian}, and `StringGuardian.toNumber()` has to produce
 * a {@link NumberGuardian}. Having each guard import its sibling as a
 * VALUE for that makes the guard modules mutually dependent — a legal
 * ESM cycle that native module evaluation handles fine, but that
 * DEADLOCKS once a bundler lowers module initialisers to async functions
 * (which esbuild / Rollup do for the whole graph as soon as anything in
 * it uses top-level await).
 *
 * The fix is to keep every reference to a guard type-only — `import type`
 * is erased at compile time and cannot create a runtime edge — and to
 * look the CONSTRUCTOR up here instead. Each guard module registers
 * itself immediately after its class declaration; transition methods
 * resolve the target lazily, inside the method body, long after every
 * module in the barrel has finished evaluating.
 *
 * Living under `helpers/` is what keeps that true: nothing here imports a
 * guard at runtime, so this module is a sink in the value-import graph
 * and `guards/` stays acyclic. The only runtime dependency is the
 * package error class.
 *
 * @module
 */

import { GuardianError } from '../errors/Base.ts';
import type { BigIntGuardian } from '../guards/BigIntGuardian.ts';
import type { DateGuardian } from '../guards/DateGuardian.ts';
import type { NumberGuardian } from '../guards/NumberGuardian.ts';
import type { StringGuardian } from '../guards/StringGuardian.ts';

/**
 * The guard classes reachable through the registry, keyed by the name
 * transition methods use. Only classes that are the TARGET of a
 * cross-guard transition appear here — a guard that merely transitions
 * away (e.g. `BooleanGuardian`) never needs to be resolved.
 *
 * The values are `typeof` the class, i.e. the constructor side, so a
 * resolved entry is assignable to `process()`'s `constructor` parameter
 * with the exact same type it had when the class was imported directly.
 * Every reference here is type-only and erases at compile time.
 *
 * @internal
 */
type GuardianConstructors = {
  bigint: typeof BigIntGuardian;
  date: typeof DateGuardian;
  number: typeof NumberGuardian;
  string: typeof StringGuardian;
};

/**
 * Populated by each guard module at load time via
 * {@link registerGuardian}. Values are stored as `unknown` and cast on
 * the way out — a heterogeneous map cannot be typed precisely without a
 * per-key store.
 *
 * @internal
 */
const REGISTRY = new Map<keyof GuardianConstructors, unknown>();

/**
 * Publish a guard constructor under `key`. Called once per guard
 * module, immediately after the class declaration, so the entry lands
 * as part of that module's evaluation.
 *
 * @param key - Registry key naming the guard.
 * @param ctor - The guard class itself.
 */
export function registerGuardian<K extends keyof GuardianConstructors>(
  key: K,
  ctor: GuardianConstructors[K],
): void {
  REGISTRY.set(key, ctor);
}

/**
 * Look up a guard constructor registered by {@link registerGuardian}.
 * Called from transition method BODIES only — never at module scope —
 * so the target module has always finished evaluating by the time this
 * runs.
 *
 * @param key - Registry key naming the guard.
 * @returns The guard class registered under `key`.
 * @throws {GuardianError} When no guard is registered under `key`.
 *   Only reachable if a guard module was loaded in isolation, bypassing
 *   the `guards/mod.ts` barrel — which the package's `exports` map makes
 *   impossible for consumers, since individual guard files are not
 *   exposed as sub-paths.
 */
export function resolveGuardian<K extends keyof GuardianConstructors>(
  key: K,
): GuardianConstructors[K] {
  const ctor = REGISTRY.get(key);
  if (ctor === undefined) {
    throw new GuardianError(
      `No guardian registered for '${key}'. The guard module was loaded ` +
        `in isolation — import Guardian from '@tundralibs/guardian' (or ` +
        `'@tundralibs/guardian/guards') so every guard module evaluates.`,
      {
        expected: `registered guardian '${key}'`,
        got: 'unregistered',
        comparison: 'registry',
        type: 'usage',
      },
    );
  }
  return ctor as GuardianConstructors[K];
}
