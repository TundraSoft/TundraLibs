/**
 * @fileoverview Error thrown when TypeScript hasn't emitted runtime
 * type metadata for a `@Dose`d property.
 *
 * @module
 */

import { DoctorError } from './Base.ts';

/**
 * Structured context for {@link MissingDesignTypeError}.
 */
export type MissingDesignTypeContext = {
  property: string;
};

/**
 * Thrown by `@Dose` when `Reflect.getMetadata('design:type', …)`
 * returns `undefined` — almost always because
 * `emitDecoratorMetadata: true` is missing from the consumer's
 * TypeScript config.
 */
export class MissingDesignTypeError
  extends DoctorError<MissingDesignTypeContext> {}
