/**
 * Formatter type definitions
 * @module
 */

import { SlogObject } from './SlogObject.ts';

/** */
export type SloggerFormatter = (log: Readonly<SlogObject>) => string;
