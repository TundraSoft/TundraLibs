/**
 * @module
 *
 * `NormCryptoError` — a single encrypted cell could not be turned back
 * into plaintext on the read path: the ciphertext failed its
 * authentication tag (corruption or tampering), was written under a key
 * this instance no longer holds, or decoded to malformed canonical text.
 * Thrown only under `onDecryptFailure: 'throw'`; the default policy
 * degrades the cell to `null` and emits a `decryptError` event instead.
 *
 * @since 1.0.0
 */

import { NormError } from './Base.ts';
import type { NormErrorCode } from './NormErrorCodes.ts';

/** Metadata for {@link NormCryptoError} — identifiers only, never the
 * ciphertext or the failed value. */
export type CryptoErrorMeta = {
  /** Registry key of the entity being read — omitted for an
   * instance-level `missing-secret` failure with no entity context. */
  entity?: string;
  /** The (possibly relation-qualified) column whose cell failed —
   * read-path failures only. */
  column?: string;
  /** Primary key of the row, when it is present in the read (best-effort
   * — a projection may omit it). The pk is never encrypted. */
  pk?: unknown;
  /** Which step failed: `decrypt` = the ciphertext failed its auth tag /
   * wrong key; `decode` = decrypted but the canonical plaintext was
   * malformed; `missing-secret` = no `secret` configured. */
  reason: 'decrypt' | 'decode' | 'missing-secret';
  /** For `missing-secret`: the operation that needed the key. */
  operation?: 'encrypt' | 'decrypt';
  /** Stable machine-readable code — read it as `error.code`. */
  code?: NormErrorCode;
} & Record<string, unknown>;

/** Build the human message for each failure mode. */
function cryptoMessage(meta: CryptoErrorMeta): string {
  if (meta.reason === 'missing-secret') {
    const op = meta.operation ?? 'decrypt';
    const on = meta.entity !== undefined ? ` on entity '${meta.entity}'` : '';
    return `Cannot ${op}${on}: no 'secret' was supplied to ` +
      `new Norm({ secret }).`;
  }
  const where = meta.pk !== undefined ? ` (pk ${JSON.stringify(meta.pk)})` : '';
  return `${meta.entity}.${meta.column}${where}: failed to ${
    meta.reason === 'decrypt' ? 'decrypt' : 'decode'
  } an encrypted value — it may be corrupt, tampered with, or ` +
    `written under a different key`;
}

/**
 * A crypto operation failed: an encrypted cell could not be recovered
 * on read (`reason: 'decrypt' | 'decode'` — the underlying error rides
 * on `cause`), or encryption/decryption was requested without a
 * configured secret (`reason: 'missing-secret'`, `code: 'MISSING_SECRET'`).
 * `error.context` names the entity, column, pk, and which step failed.
 *
 * @example
 * ```ts ignore
 * try {
 *   await db.repo('Users').find();
 * } catch (e) {
 *   if (e instanceof NormCryptoError) {
 *     console.error(
 *       `${e.context.entity}.${e.context.column} (pk ${e.context.pk}) ` +
 *         `failed to ${e.context.reason}`,
 *     );
 *   }
 * }
 * ```
 */
export class NormCryptoError extends NormError<CryptoErrorMeta> {
  /**
   * The message is derived from `meta.reason`; identifiers only, so it
   * is safe to log.
   *
   * @param cause - The underlying decrypt/decode failure, when there
   *   was one — absent for `missing-secret`.
   */
  constructor(meta: CryptoErrorMeta, cause?: Error) {
    super(cryptoMessage(meta), meta, cause);
  }
}
