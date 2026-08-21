/**
 * The SQL translator family a {@link SQLEngine} emits.
 *
 * @module
 */

/**
 * The SQL translator family a {@link SQLEngine} emits. Consumers key
 * dialect-specific behaviour (migration plan artifacts, DDL emission) on
 * this — an alias engine that reuses a base translator reports its base
 * family here regardless of its own {@link EngineCapabilities} identity.
 */
export type SQLDialect = 'postgres' | 'maria' | 'sqlite';
