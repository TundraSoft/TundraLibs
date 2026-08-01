/**
 * @module
 *
 * `NormValidationError` — thrown by the accessor write path when an
 * insert / update / upsert payload fails the column-derived Guardian.
 *
 * The flattened summary lives on `error.message`; full structured
 * detail is on `error.context.issues`. The underlying `GuardianError`
 * is attached as `cause` for callers that want the raw Guardian
 * surface.
 *
 * @since 1.0.0
 */

/**
 * One validation finding from the write path.
 *
 * - `path` — dotted identifier into the payload; batched writes
 *   include the row index (`'[2].email'`), single-row writes omit it.
 */
export type ValidationIssue = {
  model: string;
  op: 'insert' | 'update' | 'upsert';
  path: string;
  message: string;
};

/** Metadata carried by {@link NormValidationError}. */
export type ValidationErrorMeta = {
  issues: ReadonlyArray<ValidationIssue>;
};
import { NormError } from './Base.ts';

/**
 * Insert / update / upsert payload failed runtime validation. Concrete
 * findings live on `error.context.issues`.
 *
 * @example
 * ```ts
 * try {
 *   await db.repo('Users').insert({ email: 'not-an-email', status: 'banned' });
 * } catch (e) {
 *   if (e instanceof NormValidationError) {
 *     for (const i of e.context.issues) {
 *       console.error(`${i.model}.${i.path}: ${i.message}`);
 *     }
 *   }
 * }
 * ```
 */
export class NormValidationError extends NormError<ValidationErrorMeta> {
  constructor(meta: ValidationErrorMeta, cause?: Error) {
    const n = meta.issues.length;
    const model = meta.issues[0]?.model ?? '<unknown>';
    const op = meta.issues[0]?.op ?? '<unknown>';
    const summary = meta.issues
      .map((i) => `  - ${i.path}: ${i.message}`)
      .join('\n');
    super(
      `${model}.${op}: ${n} validation issue${n > 1 ? 's' : ''}:\n${summary}`,
      meta,
      cause,
    );
  }
}
