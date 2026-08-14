/**
 * @module
 *
 * `NormUnsupportedError` — thrown when an operation is requested that
 * the underlying engine does not support (e.g. `db.transaction()` on a
 * MongoDB-backed Norm). Raised **eagerly**, before any engine call, so
 * the failure is a clear typed error instead of a crash or a silent
 * downgrade.
 *
 * @since 1.0.0
 */

import { NormError } from './Base.ts';

/** Metadata for {@link NormUnsupportedError}. */
export type UnsupportedErrorMeta = {
  /** The unsupported capability, e.g. `'transactions'`. */
  feature: string;
  /** Engine/dialect that lacks it, when known. */
  dialect?: string;
} & Record<string, unknown>;

/**
 * The requested operation is not supported by the configured engine.
 *
 * @example
 * ```ts ignore
 * try {
 *   await db.transaction(async (tx) => { ... });
 * } catch (e) {
 *   if (e instanceof NormUnsupportedError) {
 *     console.error(`Unsupported: ${e.context.feature}`);
 *   }
 * }
 * ```
 */
export class NormUnsupportedError extends NormError<UnsupportedErrorMeta> {
  /**
   * Names the feature the configured engine cannot serve.
   *
   * @param meta - `dialect` is optional and merely sharpens the
   *   message; `feature` names what was asked for.
   */
  constructor(meta: UnsupportedErrorMeta, cause?: Error) {
    super(
      `The configured engine${
        meta.dialect ? ` (${meta.dialect})` : ''
      } does not support ${meta.feature}`,
      meta,
      cause,
    );
  }
}
