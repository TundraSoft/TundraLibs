/**
 * @fileoverview `pinHidden` — the one way rapid attaches a value to the
 * ambient bag (or any object) NON-ENUMERABLY: the logger's context spread
 * and `ambient.child` copy only enumerable keys, so a pinned slot is
 * never logged and never inherited by a nested scope, which is exactly
 * what the per-scope container and invoke-context pins rely on.
 * @module
 */

/** Define `key` on `target` as a hidden, replaceable slot holding `value`. */
export function pinHidden(target: object, key: symbol, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}
