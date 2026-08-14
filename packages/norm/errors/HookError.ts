/**
 * @module
 *
 * `NormHookError` — thrown by the accessor pipeline when a model's
 * lifecycle hook (`beforeInsert` / `beforeUpdate` /
 * `afterRead`) throws. The user's original error rides on `cause`;
 * the meta carries which hook fired and on which model so callers
 * can branch.
 *
 * @since 1.0.0
 */

/** Metadata carried by {@link NormHookError}. */
export type HookErrorMeta = {
  /** Registered model name the hook was attached to. */
  model: string;
  /** Which hook fired. */
  hook: 'beforeInsert' | 'beforeUpdate' | 'beforeDelete' | 'afterRead';
};
import { NormError } from './Base.ts';

/**
 * One of a model's hooks threw. The underlying error is attached as
 * `cause` (matching the standard `ErrorOptions.cause` convention);
 * `error.context.model` and `error.context.hook` identify where it
 * happened.
 *
 * @example
 * ```ts ignore
 * try {
 *   await db.repo('Users').insert({ email: 'x@y.com' });
 * } catch (e) {
 *   if (e instanceof NormHookError) {
 *     console.error(`${e.context.model}.${e.context.hook} threw:`, e.cause);
 *   }
 * }
 * ```
 */
export class NormHookError extends NormError<HookErrorMeta> {
  /**
   * Wraps whatever a user hook threw, labelled with the model and hook
   * name.
   *
   * @param cause - Required: what the hook actually threw. Its message
   *   is folded into this error's message.
   */
  constructor(meta: HookErrorMeta, cause: Error) {
    super(
      `${meta.model}.${meta.hook} threw: ${cause.message}`,
      meta,
      cause,
    );
  }
}
