/**
 * Checks if a given value is a promise
 *
 * @param value The value to check if it is a promise
 * @returns True if the value is a promise, false otherwise
 */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return !!value && typeof (value as PromiseLike<unknown>).then === 'function';
}
