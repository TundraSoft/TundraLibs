/**
 * @fileoverview {@link RapidModuleMethodDecorator} — the TC39 method
 * decorator shape `@On` / `@Use` return.
 *
 * @module
 */

/** A metadata-only TC39 method decorator. */
export type RapidModuleMethodDecorator = (
  target: object,
  context: ClassMethodDecoratorContext,
) => void;
