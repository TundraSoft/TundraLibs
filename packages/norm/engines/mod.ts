/**
 * @module
 *
 * Barrel for the engine registry. Importing this module registers
 * NOTHING — the per-dialect side-effect modules
 * (`@tundralibs/norm/engines/postgres`, `.../d1`, …) do that.
 *
 * @since 1.2.0
 */

export {
  type NormDialect,
  type NormEngineFactory,
  registerEngine,
  resolveEngineFactory,
} from './registry.ts';
