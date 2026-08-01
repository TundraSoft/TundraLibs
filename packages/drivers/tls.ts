/**
 * @fileoverview Shared helpers for TLS handling across engines that
 * speak the wire protocol from scratch (Postgres, Redis). Engines that
 * delegate to npm packages (Mongo, Maria) don't need this — their
 * underlying drivers handle TLS internally.
 *
 * @module
 */

/**
 * Heuristic — does this error look like a TLS-layer failure rather
 * than a protocol-layer failure? Used by `_createResource` paths to
 * decide whether `ssl.enforce: false` should kick in and retry over
 * plaintext.
 *
 * Deno's TLS errors come up as `Deno.errors.InvalidData` (cert
 * structure / chain issues) or `Deno.errors.BadResource` (handshake
 * aborted). Node / Bun produce `Error` instances with messages like
 * "self signed certificate" or codes like `ERR_TLS_*`.
 *
 * Server-protocol errors (e.g. `PgServerError`, RESP `error` replies)
 * should always return `false` here — they're definitively not TLS
 * problems and shouldn't trigger a downgrade.
 */
export function looksLikeTlsRuntimeError(e: unknown): boolean {
  // Deno-specific Error subclasses.
  const denoErrors = (globalThis as {
    Deno?: {
      errors?: {
        InvalidData?: new (...args: never[]) => Error;
        BadResource?: new (...args: never[]) => Error;
      };
    };
  }).Deno?.errors;
  if (denoErrors) {
    if (denoErrors.InvalidData && e instanceof denoErrors.InvalidData) {
      return true;
    }
    if (denoErrors.BadResource && e instanceof denoErrors.BadResource) {
      return true;
    }
  }
  // Cross-runtime fallback — string-match on message / code.
  if (e instanceof Error) {
    const msg = e.message;
    if (
      /\bcertificate\b/i.test(msg) ||
      /\bTLS\b/i.test(msg) ||
      /\bSSL\b/i.test(msg) ||
      /\bhandshake\b/i.test(msg)
    ) {
      return true;
    }
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && code.startsWith('ERR_TLS_')) return true;
  }
  return false;
}
