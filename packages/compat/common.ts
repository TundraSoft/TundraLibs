/**
 * @fileoverview TLS / PEM / path-traversal helpers shared by `fetch`,
 * the webserver, and the websocket modules. Also defines the public
 * {@link TLSOptions} shape and the error hierarchy thrown when
 * validation fails.
 *
 * @module
 */

import { pathExists, pathExistsSync, readTextFileSync } from './file.ts';
import { resolve as resolvePath } from './path.ts';
import { CompatError } from './Error.ts';

//#region TLSOptions
/** Invalid TLS configuration. `source` names the offending field (`'cert'`, `'key'`, `'ca[0]'`). */
export class FetchTLSError extends CompatError {
  /** Offending field, e.g. `'cert'`, `'keyFile'`, `'ca[0]'`, or `'tls'`. */
  public readonly source: string;

  /**
   * Records which field was rejected alongside the message.
   *
   * @param source - Field path the caller should correct.
   */
  constructor(message: string, source: string, cause?: Error) {
    super(message, cause);
    this.source = source;
  }

  /** Adds `source` to the base payload. */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      source: this.source,
    };
  }
}

/** A file referenced by `tls` options or a UNIX socket path doesn't exist. */
export class FetchFileNotFoundError extends CompatError {
  /** Path as supplied by the caller, before resolution. */
  public readonly path: string;

  /** Builds the message from `path`. */
  constructor(path: string, cause?: Error) {
    super(`File not found: ${path}`, cause);
    this.path = path;
  }

  /** Adds `path` to the base payload. */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      path: this.path,
    };
  }
}

/** PEM didn't parse: missing/wrong markers, mismatched type, or oversize. */
export class FetchInvalidPEMError extends FetchTLSError {}

/** Path-traversal guard tripped — `../` or null byte in a user-supplied path. */
export class FetchPathTraversalError extends CompatError {
  /** Path as supplied by the caller, before resolution. */
  public readonly path: string;
  /** Fixed discriminator, so handlers can branch without `instanceof`. */
  public readonly reason = 'path_traversal';

  /** Builds the message from `path`. */
  constructor(path: string, cause?: Error) {
    super(`Path traversal detected: ${path}`, cause);
    this.path = path;
  }

  /** Adds `path` and `reason` to the base payload. */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      path: this.path,
      reason: this.reason,
    };
  }
}

/**
 * Inline PEM material. Exported so the published `.d.ts` for the exported
 * {@link validateTLS} keeps a usable parameter type — a non-exported type in
 * an exported signature degrades to `never` for consumers on the tarball.
 */
export type InlineTLS = {
  /** PEM-encoded certificate string. */
  cert?: string;
  /** PEM-encoded private key string. */
  key?: string;
  /** Array of PEM-encoded CA certificate strings. */
  ca?: string[];
};

/** Filesystem paths to PEM material. Exported for the same reason as {@link InlineTLS}. */
export type FileTLS = {
  /** Path to PEM-encoded certificate file. */
  certFile?: string;
  /** Path to PEM-encoded private key file. */
  keyFile?: string;
  /** Path to PEM-encoded CA certificates file. */
  caFile?: string;
};

/**
 * TLS configuration. Every field is optional: `tls: true` alone gets
 * server-only TLS against the system trust roots, `ca`/`caFile` adds a
 * private CA, and `cert`+`key` (or `certFile`+`keyFile`) turns on mutual
 * TLS — supplying only one half of that pair is rejected.
 *
 * Pick one presentation style: inline PEM strings or filesystem paths.
 * Mixing them is rejected at the type level and again by
 * {@link validateTLS} at runtime.
 *
 * Deno has no in-process way to skip certificate verification, so
 * `rejectUnauthorized: false` throws there — pass
 * `--unsafely-ignore-certificate-errors=<host>` or supply the server's CA
 * instead. Bun and Node honour it.
 */
export type TLSOptions =
  & {
    /**
     * Reject the connection if the server's certificate doesn't
     * validate against the trust roots (system or `ca`). Defaults to
     * `true`. Set `false` to accept self-signed / expired certs in
     * development — never in production.
     */
    rejectUnauthorized?: boolean;
  }
  // Mutually exclusive: supply inline material OR file paths, not both.
  // The `never`-stamping makes a mixed object assignable to neither arm.
  & (
    | (InlineTLS & { [K in keyof FileTLS]?: never })
    | (FileTLS & { [K in keyof InlineTLS]?: never })
  );

/** PEM size cap (1 MB). Anything larger is rejected before regex parsing to avoid ReDoS. */
const MAX_PEM_SIZE = 1_048_576;

/**
 * Validate PEM structure and (optionally) match an expected type
 * (e.g. `'CERTIFICATE'`, `'PRIVATE KEY'`). Internal — see
 * {@link validateTLSContent}.
 */
const isValidPEM = (pem: string, type?: string): boolean => {
  if (!pem || typeof pem !== 'string') {
    return false;
  }

  const trimmed = pem.trim();

  // Size limit to prevent ReDoS attacks
  if (trimmed.length > MAX_PEM_SIZE) {
    return false;
  }

  // Check for basic PEM structure
  const pemPattern =
    /^-----BEGIN [A-Z0-9 ]+-----[\s\S]+-----END [A-Z0-9 ]+-----$/;
  if (!pemPattern.test(trimmed)) {
    return false;
  }

  // If a specific type is provided, validate it
  if (type) {
    const beginPattern = new RegExp(`^-----BEGIN ${type}-----`);
    const endPattern = new RegExp(`-----END ${type}-----$`);
    return beginPattern.test(trimmed) && endPattern.test(trimmed);
  }

  return true;
};

/** TLS config after validation — every field optional. @internal */
export type ValidatedTLS = {
  cert?: string;
  key?: string;
  ca?: string[];
  rejectUnauthorized?: boolean;
};

/**
 * Validate inline PEM content. Cert (`CERTIFICATE`), key (any
 * `* PRIVATE KEY` flavour), and CA certs (`CERTIFICATE`) are all
 * optional, but supplying one of `cert`/`key` without the other is
 * rejected (a half-mTLS config would fail at the runtime layer).
 *
 * @throws {@link FetchInvalidPEMError} On mistyped or malformed PEM.
 * @internal
 */
export const validateTLSContent = (
  cert?: string,
  key?: string,
  ca?: string[],
): ValidatedTLS => {
  // cert + key must come as a pair — half a client cert is never useful.
  if ((cert && !key) || (!cert && key)) {
    throw new FetchInvalidPEMError(
      'Both cert and key are required for client-certificate (mTLS) auth; supplied only one.',
      cert ? 'key' : 'cert',
    );
  }

  if (cert) {
    if (!isValidPEM(cert, 'CERTIFICATE')) {
      throw new FetchInvalidPEMError(
        'Invalid PEM format for certificate. Expected type: CERTIFICATE.',
        'cert',
      );
    }
  }

  if (key) {
    if (!isValidPEM(key)) {
      throw new FetchInvalidPEMError(
        'Invalid PEM format for private key.',
        'key',
      );
    }
  }

  // Validate CA certificates if provided
  if (ca && ca.length > 0) {
    for (const [i, caCert] of ca.entries()) {
      if (!isValidPEM(caCert, 'CERTIFICATE')) {
        throw new FetchInvalidPEMError(
          `Invalid PEM format for CA certificate at index ${i}. Expected type: CERTIFICATE.`,
          `ca[${i}]`,
        );
      }
    }
  } else {
    ca = undefined;
  }

  return { cert, key, ca };
};

/**
 * File-based variant of {@link validateTLSContent}: traversal-checks
 * each path, reads the PEM contents, then runs the same content
 * validation. Same throws as the file-existence checks plus
 * {@link FetchPathTraversalError}.
 * @internal
 */
export const validateTLSFiles = (
  certFile?: string,
  keyFile?: string,
  caFile?: string,
): ValidatedTLS => {
  // cert + key must come as a pair — half a client cert is never useful.
  if ((certFile && !keyFile) || (!certFile && keyFile)) {
    throw new FetchInvalidPEMError(
      'Both certFile and keyFile are required for client-certificate (mTLS) auth; supplied only one.',
      certFile ? 'keyFile' : 'certFile',
    );
  }

  // Validate all paths for traversal attacks BEFORE any file I/O, so a
  // traversal in keyFile or caFile is caught even when certFile exists.
  if (certFile) validateFilePath(certFile);
  if (keyFile) validateFilePath(keyFile);
  if (caFile) validateFilePath(caFile);

  const cert = certFile ? _readPemFile(certFile) : undefined;
  const key = keyFile ? _readPemFile(keyFile) : undefined;
  const ca = caFile ? [_readPemFile(caFile)] : undefined;

  return validateTLSContent(cert, key, ca);
};

/**
 * Resolve a {@link TLSOptions} value to validated PEM content. Routes
 * between inline material and file paths, and rejects a config that
 * supplies both styles — the single runtime guard behind the
 * mutually-exclusive {@link TLSOptions} type. `rejectUnauthorized` is
 * read by callers directly off the options object, not here.
 *
 * @throws {@link FetchTLSError} When inline material (`cert`/`key`/`ca`)
 *   and file paths (`certFile`/`keyFile`/`caFile`) are both supplied.
 * @throws {@link FetchInvalidPEMError} On malformed PEM (via the
 *   underlying content/file validators).
 * @throws {@link FetchFileNotFoundError} / {@link FetchPathTraversalError}
 *   On a missing or unsafe file path.
 */
export const validateTLS = (tls: InlineTLS & FileTLS): ValidatedTLS => {
  const hasInline = tls.cert !== undefined || tls.key !== undefined ||
    (tls.ca !== undefined && tls.ca.length > 0);
  const hasFile = tls.certFile !== undefined || tls.keyFile !== undefined ||
    tls.caFile !== undefined;

  if (hasInline && hasFile) {
    throw new FetchTLSError(
      'TLS config cannot mix inline PEM content (cert/key/ca) with file ' +
        'paths (certFile/keyFile/caFile); supply just one style.',
      'tls',
    );
  }

  return hasFile
    ? validateTLSFiles(tls.certFile, tls.keyFile, tls.caFile)
    : validateTLSContent(tls.cert, tls.key, tls.ca);
};

/** Read one PEM file with path-traversal protection + existence check. */
const _readPemFile = (filePath: string): string => {
  const safe = validateFilePath(filePath);
  if (!pathExistsSync(safe)) throw new FetchFileNotFoundError(filePath);
  return readTextFileSync(safe);
};

/**
 * Reject null bytes and `../` / `..\` segments, then return the
 * absolute path. @internal
 *
 * @throws {@link FetchPathTraversalError}
 */
const validateFilePath = (filePath: string): string => {
  // Check for null bytes (path injection)
  if (filePath.includes('\0')) {
    throw new FetchPathTraversalError(filePath);
  }

  // Resolve to absolute path
  const resolved = resolvePath(filePath);

  // Check the original path for suspicious patterns that could indicate traversal intent
  // Even if resolved path is safe, we reject paths with explicit traversal attempts
  const normalizedInput = filePath.replaceAll('\\', '/');
  if (normalizedInput.includes('../') || normalizedInput.includes('..\\')) {
    throw new FetchPathTraversalError(filePath);
  }

  return resolved;
};

//#region AbortSignal utilities

/**
 * Merge a `timeout` (ms) and a caller `signal` into one AbortSignal.
 * Uses `AbortSignal.any()` when available (Node 20+, Deno 1.41+,
 * Bun 1.1+), otherwise composes manually. Returns `undefined` if
 * neither argument is set.
 */
export function combineSignals(
  timeout?: number,
  signal?: AbortSignal,
): AbortSignal | undefined {
  // No timeout or signal
  if (!timeout && !signal) return undefined;

  // Only signal provided
  if (!timeout) return signal;

  // Only timeout provided
  if (!signal) return AbortSignal.timeout(timeout);

  // Both provided - need to combine
  // Check if AbortSignal.any() is available (Node 20+, Deno 1.41+, Bun 1.1+)
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([AbortSignal.timeout(timeout), signal]);
  }

  // Fallback: Manual combination for older runtimes
  const controller = new AbortController();

  // Listen to timeout
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Listen to custom signal
  const onAbort = () => {
    clearTimeout(timeoutId);
    controller.abort();
  };

  if (signal.aborted) {
    clearTimeout(timeoutId);
    controller.abort();
  } else {
    signal.addEventListener('abort', onAbort, { once: true });
  }

  // Clean up if controller aborts first (from timeout)
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timeoutId);
    signal.removeEventListener('abort', onAbort);
  }, { once: true });

  return controller.signal;
}

//#endregion

/**
 * Path-traversal check + existence check on a UNIX socket path.
 * Doesn't verify the file is actually a socket (vs. a regular file).
 * @internal
 */
export const validateUnixSocket = async (socketPath: string): Promise<void> => {
  const safePath = validateFilePath(socketPath);
  if (!await pathExists(safePath)) {
    throw new FetchFileNotFoundError(socketPath);
  }
};
//#endregion TLSOptions
