/**
 * @fileoverview Authentication configuration as a discriminated union.
 *
 * @module
 */
import type { RESTlerAuthBasic } from './RESTlerAuthBasic.ts';
import type { RESTlerAuthBearer } from './RESTlerAuthBearer.ts';

/**
 * Authentication configuration as a discriminated union keyed by `type`
 *
 * - `BASIC` adds {@link RESTlerAuthBasic} (`username` / `password`)
 * - `BEARER` adds {@link RESTlerAuthBearer} (`token`, optional `prefix`)
 * - `CUSTOM` allows arbitrary fields for a subclass to interpret
 *
 * @example
 * ```typescript
 * const auth: RESTlerAuth = { type: 'BEARER', token: 'abc' };
 * ```
 */
export type RESTlerAuth =
  | ({ type: 'BASIC' } & RESTlerAuthBasic)
  | ({ type: 'BEARER' } & RESTlerAuthBearer)
  | ({ type: 'CUSTOM' } & Record<string, unknown>);
