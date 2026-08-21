/**
 * @fileoverview {@link RapidModuleInstances} — the TYPED result of
 * `initModules`: for every namespace export that is a concrete zero-arg
 * module class, the instance type under the EXPORT name; abstract bases,
 * classes needing constructor args, and non-classes are filtered out at
 * the type level (mirroring what the runtime mounts).
 *
 * @module
 */

import type { RapidModule } from '../RapidModule.ts';
import type { RapidModuleEventMap } from './EventMap.ts';

/** Concrete zero-arg module classes of a namespace → their instances. */
export type RapidModuleInstancesOf<NS> = {
  [
    K in keyof NS as NS[K] extends new () => RapidModule<RapidModuleEventMap>
      ? K
      : never
  ]: NS[K] extends new () => infer I ? I : never;
};

type UnionToIntersection<U> =
  (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I
    : never;

/** Merged instances across all namespaces, plus the caller-keyed instances. */
export type RapidModuleInstances<
  M extends readonly object[],
  I extends Record<string, RapidModule<RapidModuleEventMap>>,
> = UnionToIntersection<RapidModuleInstancesOf<M[number]>> & I;
