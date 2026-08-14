/**
 * Formatter type definitions
 * @module
 */

import { SlogObject } from './SlogObject.ts';

/**
 * Renders one record into the line a handler writes.
 *
 * Must return a string and must not throw: both `AbstractHandler` and
 * `LogManager.addFormatter` smoke-test a candidate formatter against a
 * synthetic record at registration time and reject one that does either.
 */
export type SloggerFormatter = (log: Readonly<SlogObject>) => string;
