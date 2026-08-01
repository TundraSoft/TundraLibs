import type { SQLEngineOptions } from '../../../types/mod.ts';

/**
 * Configuration options for `MariaEngine`.
 *
 * Network fields (`host`, `port`, `username`, `password`, `database`)
 * are inherited from {@link SQLEngineOptions}. The constructor enforces
 * that `host`, `database`, and `username` are present.
 *
 * @extends SQLEngineOptions
 */
export type MariaEngineOptions = SQLEngineOptions;
