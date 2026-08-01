/**
 * @fileoverview Error thrown when the runtime lacks `reflect-metadata`.
 *
 * @module
 */

import { DoctorError } from './Base.ts';

/**
 * Thrown by `@Dose` at decoration time when `Reflect.getMetadata`
 * is unavailable — meaning the consumer hasn't imported the
 * `reflect-metadata` polyfill (or has an environment that strips
 * it).
 *
 * Fix: `import 'reflect-metadata'` once, at the top of the
 * application entry point, before any `@Vial` / `@Dose` /
 * `@Inoculate` decorator runs.
 */
export class MissingMetadataError extends DoctorError {}
