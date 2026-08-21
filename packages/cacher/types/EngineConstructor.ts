import type { AbstractEngine } from '../AbstractEngine.ts';
import type { CacherOptions } from './CacherOptions.ts';

/**
 * Constructor of a cache engine, as seen by a REGISTERING caller.
 *
 * Generic in the engine's own options type so a concrete engine is
 * assignable: construct-signature parameters are contravariant, so a
 * fixed `options: unknown` here would make every concrete engine
 * (whose constructor takes its OWN options type) unassignable — the
 * registry could then only be fed through a cast.
 *
 * @typeParam O - The engine's options type.
 */
export type EngineConstructor<O extends CacherOptions = CacherOptions> = new (
  name: string,
  options: O,
) => AbstractEngine<O>;
