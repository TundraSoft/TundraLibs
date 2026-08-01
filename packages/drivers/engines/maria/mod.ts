export { MariaEngine } from './Engine.ts';
// Alias engine for PlanetScale/Vitess (FK enforcement + advisory locks
// off); MySQL/Aurora/TiDB/SingleStore use MariaEngine as-is.
export { PlanetScaleEngine } from './aliases.ts';
export type { MariaEngineOptions } from './types/mod.ts';
