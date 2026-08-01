/**
 * @module
 *
 * Column-spec assertion — the OQL-asserts counterpart for norm
 * definitions. ONE implementation of every per-column rule:
 * `Entity()` and `compileRuntime()` both delegate here, and hand-built
 * specs (no builders) can be validated with the same function users
 * get from `@tundralibs/norm/asserts`.
 *
 * Issue collectors return `DefinitionIssue[]` so callers can
 * aggregate across a whole definition/registry before throwing;
 * the `assert*` wrappers throw {@linkcode NormMigrationError}-style
 * aggregated {@linkcode NormDefinitionError}s directly.
 *
 * @since 1.0.0
 */

import {
  type ColumnSpec,
  DIGEST_LENGTHS,
  isExpressionValue,
} from '../definition/Column.ts';
import { type DefinitionIssue, NormDefinitionError } from '../errors/mod.ts';

/** Every per-column rule, as aggregatable issues. `model` is the
 * entity name (or registry key) used in issue provenance. */
export function columnSpecIssues(
  model: string,
  colName: string,
  spec: ColumnSpec,
): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const at = (path: string, message: string) =>
    issues.push({ model, path, message });

  if (typeof spec.type !== 'string' || spec.type.trim() === '') {
    at(`columns.${colName}.type`, `column type must be a non-empty string`);
    return issues; // nothing else is meaningful without a type
  }

  // One-way digest columns (Column.hash(algo)).
  if (spec.hashed !== undefined) {
    const length = DIGEST_LENGTHS[spec.hashed as keyof typeof DIGEST_LENGTHS];
    if (length === undefined) {
      at(
        `columns.${colName}.hashed`,
        `unknown digest algorithm ${JSON.stringify(spec.hashed)}`,
      );
    } else if (spec.length !== length) {
      at(
        `columns.${colName}.length`,
        `digest column length must be ${length} for ${spec.hashed}`,
      );
    }
    if (spec.encrypt === true || spec.hash === true) {
      at(
        `columns.${colName}.hashed`,
        `digest columns are one-way already — they cannot also ` +
          `declare encrypt/hash.`,
      );
    }
    if (
      isExpressionValue(spec.default?.insert) ||
      isExpressionValue(spec.default?.update)
    ) {
      at(
        `columns.${colName}.default`,
        `expression defaults are evaluated by the database and would ` +
          `bypass digesting, storing plaintext. Use a local generator ` +
          `function instead.`,
      );
    }
  }

  // Encrypted columns.
  if (spec.encrypt === true) {
    if (
      spec.type === 'BLOB' || spec.type === 'BINARY' ||
      spec.type === 'VARBINARY'
    ) {
      at(
        `columns.${colName}.encrypt`,
        `binary columns cannot encrypt() — the crypto codec is ` +
          `text-canonical. Encode to text first if you need this.`,
      );
    }
    for (
      const [slot, v] of [
        ['insert', spec.default?.insert],
        ['update', spec.default?.update],
      ] as const
    ) {
      if (!isExpressionValue(v)) continue;
      at(
        `columns.${colName}.default.${slot}`,
        `expression defaults are evaluated by the database and would ` +
          `bypass encryption, storing plaintext. Use a local generator ` +
          `function instead.`,
      );
    }
  }

  // Virtual masks.
  if (spec.masked !== undefined) {
    if (
      typeof spec.masked.source !== 'string' ||
      spec.masked.source.trim() === ''
    ) {
      at(
        `columns.${colName}.masked.source`,
        `mask source must be a non-empty column name`,
      );
    }
    if (typeof spec.masked.fn !== 'function') {
      at(`columns.${colName}.masked.fn`, `mask fn must be a function`);
    }
    if (
      spec.encrypt === true || spec.hash === true || spec.hashed !== undefined
    ) {
      at(
        `columns.${colName}.masked`,
        `mask columns are virtual — they cannot declare ` +
          `encrypt/hash/digest.`,
      );
    }
    if (spec.default !== undefined || spec.transforms?.beforeWrite) {
      at(
        `columns.${colName}.masked`,
        `mask columns are computed — defaults/beforeWrite are ` +
          `meaningless.`,
      );
    }
  }

  if (spec.renamedFrom !== undefined && spec.renamedFrom === colName) {
    at(
      `columns.${colName}.renamedFrom`,
      `Entity('${model}').columns.${colName}: renamedFrom must name ` +
        `the PREVIOUS column name, not the current one.`,
    );
  }

  return issues;
}

/** Throwing wrapper over {@linkcode columnSpecIssues}. */
export function assertColumnSpec(
  model: string,
  colName: string,
  spec: ColumnSpec,
): void {
  const issues = columnSpecIssues(model, colName, spec);
  if (issues.length > 0) throw new NormDefinitionError({ issues });
}
