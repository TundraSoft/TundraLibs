/**
 * @fileoverview {@link RpcConfigError} — raised at construction
 * time when Server / Client options are invalid.
 *
 * @module
 */

import { RpcError } from './Base.ts';

/**
 * Thrown by `Server`/`Client` constructors when configuration is
 * invalid (missing required field, wrong type, …). Distinct from
 * runtime / state errors so consumers can fail fast on bad config
 * without conflating with operational issues.
 */
export class RpcConfigError extends RpcError {}
