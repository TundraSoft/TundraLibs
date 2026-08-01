import { GuardianError } from '../errors/Base.ts';

/**
 * `true` when `Promise.resolve(value)` / `await value` would ADOPT
 * `value` — i.e. it is a thenable (an object or function with a
 * callable `then`). Deliberately narrower than {@link isPromiseLike},
 * which also reports `true` for an async FUNCTION value; a function
 * without a `then` method is never adopted by the promise resolution
 * procedure and survives `parseAsync` unchanged.
 *
 * @internal
 */
export function isAdoptableThenable(
  value: unknown,
): value is { then: (...args: unknown[]) => unknown } {
  if (value === null) return false;
  const t = typeof value;
  if (t !== 'object' && t !== 'function') return false;
  return typeof (value as { then?: unknown }).then === 'function';
}

/**
 * The error `parseAsync` / `safeParseAsync` raise when a validated
 * value is thenable-shaped. Not recoverable by any change to the parse
 * methods: a `Promise<T>` cannot deliver a thenable `T` — the
 * ECMAScript promise resolution procedure adopts it and replaces it
 * with its resolution. Use `parse()` / `safeParse()` for such data.
 *
 * @internal
 */
export function thenableResultError(result: unknown): GuardianError {
  return new GuardianError(
    'Cannot use parseAsync() when the validated value is thenable ' +
      '(it carries a callable `then`) — promise resolution would ' +
      'replace it with its resolution. Use parse() / safeParse() for ' +
      'thenable-shaped data; if this is a hand-rolled promise from a ' +
      'sync callback, declare the callback `async` instead.',
    {
      expected: 'non-thenable validated value',
      got: typeof result,
      comparison: 'thenable',
      type: 'usage',
    },
  );
}

/**
 * Gate a value that is about to be returned into a native `.then()`
 * callback inside an async guardian chain.
 *
 * This is the single choke point that keeps `parseAsync`'s thenable
 * refusal uniform across EVERY async result-adoption point (the
 * `process()` async composition wrapper, `refine()`'s async predicate
 * path, the `test()` helper's async path, and `optional()`'s async
 * default path). Each of those returns a validated value out of a
 * native `.then` callback; run that value through here first.
 *
 * - A genuine async step is a real `Promise` — hand it straight back
 *   so the surrounding `.then` awaits it (a native `Promise` VALUE is
 *   indistinguishable from a leaked async step, so it is adopted; this
 *   is the documented limitation shared with the sync fast path).
 * - A non-`Promise` thenable is a VALUE: returning it would let the
 *   ECMAScript promise resolution procedure ADOPT (and silently
 *   destroy) it, so refuse loudly with {@link thenableResultError}.
 * - Everything else passes through untouched.
 *
 * @internal
 */
export function gateAsyncStepResult<V>(result: V): V {
  if (result instanceof Promise) return result;
  if (isAdoptableThenable(result)) throw thenableResultError(result);
  return result;
}
