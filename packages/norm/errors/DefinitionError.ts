/**
 * @module
 *
 * `NormDefinitionError` — thrown by {@link Entity} / `Schema()` /
 * `use()` (and the runtime compile pass) when one or more model
 * definitions, or their cross-entity references, are structurally
 * invalid.
 *
 * Aggregates every issue found during the validation pass into a single
 * error so authors get the full picture in one round, rather than
 * fixing one issue, re-running, and discovering the next.
 *
 * @since 1.0.0
 */

/**
 * One structured definition finding.
 *
 * - `model` — the model name (`'<anonymous>'` if missing).
 * - `path` — dotted identifier pointing at the offending shape,
 *   e.g. `'columns.email.type'`, `'foreignKeys.fk_author.on.authorId'`.
 * - `message` — human-readable; safe to surface to the developer.
 */
export type DefinitionIssue = {
  model: string;
  path: string;
  message: string;
};

/** Metadata carried by {@link NormDefinitionError}. */
export type DefinitionErrorMeta = {
  issues: ReadonlyArray<DefinitionIssue>;
  /** Stable machine-readable code — read it as `error.code`. */
  code?: NormErrorCode;
};
import { NormError } from './Base.ts';
import type { NormErrorCode } from './NormErrorCodes.ts';

/**
 * One or more model definitions are invalid. The flattened summary
 * lives on `error.message`; full structured detail is on
 * `error.context.issues`.
 *
 * @example
 * ```ts ignore
 * try {
 *   Entity('users', { id: Column.integer() }, { pk: [] });
 * } catch (e) {
 *   if (e instanceof NormDefinitionError) {
 *     for (const i of e.context.issues) {
 *       console.error(`${i.model}.${i.path}: ${i.message}`);
 *     }
 *   }
 * }
 * ```
 */
export class NormDefinitionError extends NormError<DefinitionErrorMeta> {
  constructor(meta: DefinitionErrorMeta, cause?: Error) {
    const summary = meta.issues
      .map((i) => `  - ${i.model}.${i.path}: ${i.message}`)
      .join('\n');
    super(
      `Invalid model definition${
        meta.issues.length > 1 ? 's' : ''
      } (${meta.issues.length} issue${
        meta.issues.length > 1 ? 's' : ''
      }):\n${summary}`,
      meta,
      cause,
    );
  }
}
