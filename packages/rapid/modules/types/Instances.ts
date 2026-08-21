/**
 * @fileoverview {@link RapidModuleInstances} — the TYPED result of
 * `initModules`: every namespace's concrete modules under their EXPORT
 * names, plus the caller-keyed instances (which take precedence on a
 * key clash — the runtime rejects clashes anyway).
 *
 * @module
 */

import type { RapidModule } from '../RapidModule.ts';
import type { RapidModuleEventMap } from './EventMap.ts';
import type { RapidModuleInstancesOf } from './InstancesOf.ts';

type UnionToIntersection<U> =
  (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I
    : never;

/** Merged instances across all namespaces, plus the caller-keyed instances. */
export type RapidModuleInstances<
  M extends readonly object[],
  I extends Record<string, RapidModule<RapidModuleEventMap>>,
> =
  & Omit<UnionToIntersection<RapidModuleInstancesOf<M[number]>>, keyof I>
  & I;
