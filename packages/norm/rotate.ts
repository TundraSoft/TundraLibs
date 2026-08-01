/**
 * @module
 *
 * `rotateKey()` — re-encrypt every at-rest `.encrypt()` cell from one
 * secret to another, IN PLACE, without a schema migration.
 *
 * Key rotation is an ADMIN activity, not a migration: no snapshot, no
 * plan file, no DDL. Run it during a downtime window (the app stopped,
 * or at least not writing encrypted columns), then restart the app with
 * the new `secret`. It walks each encrypted table by primary-key order
 * in chunks, decrypts each cell with `oldKey`, and re-encrypts it with
 * `newKey` — streaming, so a multi-million-row table never lands in
 * memory at once.
 *
 * ## Resumable + idempotent
 * Every ciphertext carries a fingerprint of the key that produced it
 * (see {@link stampKeyId}). Rotation reads that fingerprint to classify
 * each cell:
 * - stamped with `newKey`  → already rotated, skipped;
 * - stamped with `oldKey`, or LEGACY (un-stamped, written before key-id
 *   support — those pre-date rotation and are under the old key) → rotated;
 * - stamped with some THIRD key → left untouched and counted under
 *   `unknownCells` (a wrong `oldKey` shows up as "0 rotated, everything
 *   unknown", never as silent corruption).
 *
 * So a crashed run resumes safely: re-running skips what already moved.
 *
 * ## Searchable hashes are rotation-invariant
 * `.hash()` sibling digests are derived from PLAINTEXT, not ciphertext —
 * rotation never touches them, and hashed-equality filters keep working
 * across a rotation with no reindex.
 *
 * @example
 * ```ts
 * import { rotateKey } from '@tundralibs/norm';
 *
 * const report = await rotateKey(db, {
 *   oldKey: Deno.env.get('OLD_SECRET')!,
 *   newKey: Deno.env.get('NEW_SECRET')!,
 *   onProgress: (p) => console.log(`${p.entity}: ${p.rotated} cells`),
 * });
 * console.log(`rotated ${report.rotatedCells} cells across ${report.entities.length} tables`);
 * // then restart the app configured with newKey.
 * ```
 *
 * @since 1.0.0
 */

import type { Query } from '@tundralibs/oql/types';
import { runtimeOf } from './Norm.ts';
import { keyFingerprint, readKeyId } from './crypto.ts';
import { NormCryptoError, NormError } from './errors/mod.ts';

/** Options for {@linkcode rotateKey}. */
export type RotateKeyOptions = {
  /** The secret encrypted cells are CURRENTLY under. */
  readonly oldKey: string;
  /** The secret to re-encrypt cells with. */
  readonly newKey: string;
  /** Rows fetched (and rewritten) per batch. Default `500`. Larger =
   * fewer round-trips, more memory per batch. */
  readonly chunkSize?: number;
  /** Preview only: classify + count what WOULD rotate, decrypt nothing,
   * write nothing. A fast estimate of the job size (it does NOT verify
   * `oldKey` can actually decrypt — the real run does that cell by cell,
   * failing loudly and having written nothing on a bad key). Default
   * `false`. */
  readonly dryRun?: boolean;
  /** Called after each chunk and once when an entity finishes, for
   * progress reporting. May be async — it is awaited. */
  readonly onProgress?: (p: RotateKeyProgress) => void | Promise<void>;
};

/** A progress tick from {@linkcode rotateKey}. */
export type RotateKeyProgress = {
  /** Registry key of the entity being rotated. */
  readonly entity: string;
  /** Rows scanned in this entity so far. */
  readonly scanned: number;
  /** Cells re-encrypted in this entity so far. */
  readonly rotated: number;
  /** `true` on the final tick for this entity. */
  readonly done: boolean;
};

/** Per-entity tally in a {@linkcode RotateKeyReport}. */
export type RotateKeyEntityReport = {
  /** Registry key of the entity. */
  readonly entity: string;
  /** Physical table name. */
  readonly table: string;
  /** Rows scanned. */
  readonly rows: number;
  /** Rows that received (or, in a dry run, WOULD receive) an UPDATE. */
  readonly rotatedRows: number;
  /** Cells re-encrypted under `newKey`. */
  readonly rotatedCells: number;
  /** Cells already under `newKey` (skipped). */
  readonly skippedCells: number;
  /** Cells under neither key — left untouched. `> 0` means data under an
   * unexpected key: investigate (often a mistyped `oldKey`). */
  readonly unknownCells: number;
};

/** What {@linkcode rotateKey} did (or, for `dryRun`, would do). */
export type RotateKeyReport = {
  /** Whether this was a preview (`dryRun`). */
  readonly dryRun: boolean;
  /** Per-entity tallies, in rotation order. */
  readonly entities: readonly RotateKeyEntityReport[];
  /** Total cells re-encrypted across all entities. */
  readonly rotatedCells: number;
  /** Total cells already under `newKey`. */
  readonly skippedCells: number;
  /** Total cells under an unexpected key. */
  readonly unknownCells: number;
};

/**
 * Re-encrypt every at-rest encrypted cell from `oldKey` to `newKey`,
 * in place. Downtime-first, resumable, idempotent. See the module doc.
 *
 * @param db The handle from `norm.use(...)`.
 * @param opts Old/new keys plus chunking, dry-run, and progress.
 * @returns A tally of what was rotated, skipped, and left untouched.
 * @throws {NormError} `oldKey`/`newKey` missing or identical, or an
 *   encrypted entity has no primary key to address rows by.
 * @throws {NormCryptoError} A cell would not decrypt with `oldKey`
 *   (wrong key on legacy data, corruption, or tampering) — names the
 *   entity, column, and pk. Nothing was left half-written for that row.
 */
export async function rotateKey(
  db: object,
  opts: RotateKeyOptions,
): Promise<RotateKeyReport> {
  const { oldKey, newKey, chunkSize = 500, dryRun = false, onProgress } = opts;
  if (
    typeof oldKey !== 'string' || oldKey.length === 0 ||
    typeof newKey !== 'string' || newKey.length === 0
  ) {
    throw new NormError(
      'rotateKey(): both oldKey and newKey are required.',
      {},
    );
  }
  if (oldKey === newKey) {
    throw new NormError(
      'rotateKey(): oldKey and newKey are identical — nothing to rotate.',
      {},
    );
  }
  // A non-positive or non-integer chunkSize would silently no-op (LIMIT 0
  // rotates nothing yet reports success) or loop pathologically — validate
  // it up front like the keys above, so a caller typo fails loudly.
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new NormError(
      `rotateKey(): chunkSize must be a positive integer (got ` +
        `${JSON.stringify(chunkSize)}).`,
      { chunkSize },
    );
  }

  const runtime = runtimeOf(db);
  const ex = runtime.executor;
  const crypto = runtime.crypto;
  const fpOld = await keyFingerprint(oldKey);
  const fpNew = await keyFingerprint(newKey);

  const entities: RotateKeyEntityReport[] = [];
  let rotatedCells = 0;
  let skippedCells = 0;
  let unknownCells = 0;

  for (const [key, ce] of runtime.compiled) {
    const def = ce.def as {
      type: string;
      name: string;
      dbSchema?: string;
      primaryKeys?: readonly string[];
    };
    // Only base tables carry encrypted cells and can be UPDATE-d;
    // views/queries are derived and skipped.
    if (def.type !== 'TABLE') continue;
    const encCols = [...ce.localEncrypted];
    if (encCols.length === 0) continue;

    const pkCols = def.primaryKeys ?? [];
    if (pkCols.length === 0) {
      throw new NormError(
        `rotateKey(): entity '${key}' has encrypted columns but no ` +
          `primary key — rows cannot be addressed for rewrite.`,
        { subject: key },
      );
    }

    const schema = def.dbSchema !== undefined ? { schema: def.dbSchema } : {};
    const selCols = [...pkCols, ...encCols];
    // `@col` projection + stable pk ordering (LIMIT/OFFSET without an
    // ORDER BY is engine-dependent; pk is stable and the table is static
    // during downtime).
    const projection: Record<string, true> = {};
    for (const c of selCols) projection[`@${c}`] = true;
    const orderBy: Record<string, 'ASC'> = {};
    for (const c of pkCols) orderBy[`@${c}`] = 'ASC';

    let rows = 0;
    let rotatedRows = 0;
    let entRotated = 0;
    let entSkipped = 0;
    let entUnknown = 0;

    for (let offset = 0;; offset += chunkSize) {
      const res = await ex.execute<Record<string, unknown>>({
        type: 'SELECT',
        table: def.name,
        ...schema,
        columns: selCols,
        projection,
        orderBy,
        limit: chunkSize,
        offset,
      });
      const batch = res.data as Record<string, unknown>[];
      if (batch.length === 0) break;

      for (const row of batch) {
        rows++;
        const changed: Record<string, unknown> = {};
        let rowRotations = 0;
        for (const col of encCols) {
          const v = row[col];
          if (v === null || v === undefined || typeof v !== 'string') continue;
          const id = readKeyId(v);
          if (id === fpNew) {
            entSkipped++;
            continue; // already under newKey
          }
          if (id !== null && id !== fpOld) {
            entUnknown++;
            continue; // under a third key — leave it
          }
          // Stamped with oldKey, or legacy (un-stamped → old key).
          rowRotations++;
          entRotated++;
          if (!dryRun) {
            let canonical: string;
            try {
              canonical = await crypto.decrypt(v, oldKey, crypto.algorithm);
            } catch (cause) {
              throw new NormCryptoError(
                {
                  entity: key,
                  column: col,
                  pk: pkOf(row, pkCols),
                  reason: 'decrypt',
                },
                cause as Error,
              );
            }
            changed[col] = await crypto.encrypt(
              canonical,
              newKey,
              crypto.algorithm,
            );
          }
        }
        if (rowRotations > 0) {
          rotatedRows++;
          if (!dryRun) {
            const where: Record<string, unknown> = {};
            for (const c of pkCols) where[`@${c}`] = row[c];
            await ex.execute({
              type: 'UPDATE',
              table: def.name,
              ...schema,
              columns: [...pkCols, ...Object.keys(changed)],
              data: changed,
              where,
            } as Query<'UPDATE'>);
          }
        }
      }

      if (onProgress) {
        await onProgress({
          entity: key,
          scanned: rows,
          rotated: entRotated,
          done: false,
        });
      }
      if (batch.length < chunkSize) break;
    }

    rotatedCells += entRotated;
    skippedCells += entSkipped;
    unknownCells += entUnknown;
    entities.push({
      entity: key,
      table: def.name,
      rows,
      rotatedRows,
      rotatedCells: entRotated,
      skippedCells: entSkipped,
      unknownCells: entUnknown,
    });
    if (onProgress) {
      await onProgress({
        entity: key,
        scanned: rows,
        rotated: entRotated,
        done: true,
      });
    }
  }

  return { dryRun, entities, rotatedCells, skippedCells, unknownCells };
}

/** Extract a row's primary key for error context (scalar for a single
 * column, object for a composite). Never encrypted — safe to surface. */
function pkOf(
  row: Record<string, unknown>,
  pkCols: readonly string[],
): unknown {
  if (pkCols.length === 1) return row[pkCols[0]!];
  const out: Record<string, unknown> = {};
  for (const c of pkCols) out[c] = row[c];
  return out;
}
