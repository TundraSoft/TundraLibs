/**
 * @fileoverview Framework-neutral middleware pieces: the carrier
 * configuration (which header, which prefix, per scheme), credential
 * extraction, and the PactError → HTTP status mapping. The core and the
 * per-framework adapters are glue over these.
 *
 * @module
 */
import type {
  PactMiddlewareOptions,
  PactMiddlewareRequest,
} from './types/mod.ts';
import type {
  PactCredential,
  PactHmacAlgorithm,
  PactJweEncryption,
} from '../types/mod.ts';
import { PACT_AUTH_FAILURE_CODES, PactError } from '../errors/mod.ts';
import {
  compileTemplate,
  contentDigest,
  REQUEST_TEMPLATE,
  RESPONSE_TEMPLATE,
  type SignatureTemplate,
} from './template.ts';

/** Schemes accepted when `options.schemes` is not given (HMAC joins
 * them only when `options.hmac` is configured). */
export const DEFAULT_SCHEMES: readonly PactCredential['scheme'][] = [
  'BEARER',
  'BASIC',
  'APIKEY',
];

/** One options bag, resolved: every default filled, templates compiled. */
export type PactMiddlewareConfig = {
  readonly schemes: ReadonlySet<PactCredential['scheme']>;
  readonly bearer: { header: string; prefix: string };
  readonly basic: {
    header: string;
    prefix: string;
    credential: 'user' | 'apiKey';
  };
  readonly apiKey:
    | { header: string; prefix: string }
    | { keyHeader: string; secretHeader: string };
  readonly hmac: {
    keyHeader: string;
    signatureHeader: string;
    timestampHeader: string;
    nonceHeader: string;
    template: SignatureTemplate;
    response: SignatureTemplate | null;
    algorithm: PactHmacAlgorithm;
    maxSkew: number;
  };
  readonly encryption: { enc: PactJweEncryption; required: boolean } | null;
};

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9a-z-]+$/i;

/**
 * Resolve the options once: defaults in, header names lowercased and
 * validated, HMAC templates compiled.
 *
 * @throws {PactError} INVALID_OPTION on a malformed header name, a
 *   non-positive `maxSkew`, or a template that fails to compile.
 */
export function resolveOptions(
  options: PactMiddlewareOptions = {},
): PactMiddlewareConfig {
  const header = (option: string, value: string): string => {
    if (!HEADER_NAME.test(value)) {
      throw new PactError('INVALID_OPTION', {
        option,
        reason: `'${value}' is not a valid header name`,
      });
    }
    return value.toLowerCase();
  };
  const hmac = options.hmac ?? {};
  const maxSkew = hmac.maxSkew ?? 300;
  if (!Number.isFinite(maxSkew) || maxSkew <= 0) {
    throw new PactError('INVALID_OPTION', {
      option: 'hmac.maxSkew',
      reason: 'must be a positive number of seconds',
    });
  }
  const apiKey = options.apiKey ?? {};
  return {
    schemes: new Set(
      options.schemes ??
        (options.hmac === undefined
          ? DEFAULT_SCHEMES
          : [...DEFAULT_SCHEMES, 'HMAC']),
    ),
    bearer: {
      header: header(
        'bearer.header',
        options.bearer?.header ?? 'authorization',
      ),
      prefix: options.bearer?.prefix ?? 'Bearer',
    },
    basic: {
      header: header('basic.header', options.basic?.header ?? 'authorization'),
      prefix: options.basic?.prefix ?? 'Basic',
      credential: options.basic?.credential ?? 'user',
    },
    apiKey: 'keyHeader' in apiKey
      ? {
        keyHeader: header('apiKey.keyHeader', apiKey.keyHeader),
        secretHeader: header('apiKey.secretHeader', apiKey.secretHeader),
      }
      : {
        header: header('apiKey.header', apiKey.header ?? 'authorization'),
        prefix: apiKey.prefix ?? 'ApiKey',
      },
    hmac: {
      keyHeader: header('hmac.keyHeader', hmac.keyHeader ?? 'x-key-id'),
      signatureHeader: header(
        'hmac.signatureHeader',
        hmac.signatureHeader ?? 'x-signature',
      ),
      timestampHeader: header(
        'hmac.timestampHeader',
        hmac.timestampHeader ?? 'x-timestamp',
      ),
      nonceHeader: header('hmac.nonceHeader', hmac.nonceHeader ?? 'x-nonce'),
      template: compileTemplate(hmac.template ?? REQUEST_TEMPLATE, 'request'),
      response: hmac.response === false
        ? null
        : compileTemplate(hmac.response ?? RESPONSE_TEMPLATE, 'response'),
      algorithm: hmac.algorithm ?? 'SHA-256',
      maxSkew,
    },
    encryption: options.encryption === undefined ? null : {
      enc: options.encryption.enc ?? 'A256GCM',
      required: options.encryption.required ?? false,
    },
  };
}

/** The query string with its leading `?`, or `''` — the RFC 9421 `@query`. */
export function queryOf(req: PactMiddlewareRequest): string {
  if (req.query === undefined || req.query === '') return '';
  return req.query.startsWith('?') ? req.query : `?${req.query}`;
}

/** The token after a case-insensitive `<prefix> `; the whole value when
 * the prefix is `''`; null when the prefix does not match. */
function afterPrefix(value: string, prefix: string): string | null {
  if (prefix === '') return value;
  if (
    value.length > prefix.length &&
    value.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase() &&
    value[prefix.length] === ' '
  ) {
    return value.slice(prefix.length + 1).trim();
  }
  return null;
}

/** `id:secret` split on the FIRST colon (secrets may contain colons). */
function splitPair(value: string): [string, string] | null {
  const separator = value.indexOf(':');
  if (separator === -1) return null;
  return [value.slice(0, separator), value.slice(separator + 1)];
}

/** The HMAC headers of a request, or null when it is not HMAC-shaped. */
function hmacHeaders(
  req: PactMiddlewareRequest,
  config: PactMiddlewareConfig,
): { keyId: string; signature: string; timestamp: string | null } | null {
  if (!config.schemes.has('HMAC')) return null;
  const keyId = req.header(config.hmac.keyHeader);
  const signature = req.header(config.hmac.signatureHeader);
  if (keyId === null || signature === null) return null;
  return {
    keyId,
    signature,
    timestamp: req.header(config.hmac.timestampHeader),
  };
}

/**
 * Render the request signing template — the string the client signed.
 * Derived components come from the request view, `${x-…}` keys from the
 * CONFIGURED headers, `${content-digest}` from the raw body, any other
 * key from the header of that name (empty when absent).
 */
export async function requestPayload(
  req: PactMiddlewareRequest,
  config: PactMiddlewareConfig,
): Promise<string> {
  const query = queryOf(req);
  const authority = (req.authority ?? '').toLowerCase();
  const scheme = (req.scheme ?? '').toLowerCase();
  const digest = config.hmac.template.keys.includes('content-digest')
    ? await contentDigest(await req.body?.() ?? null)
    : '';
  return config.hmac.template.render((key) => {
    switch (key) {
      case '@method':
        return req.method.toUpperCase();
      case '@path':
        return req.path;
      case '@query':
        return query;
      case '@request-target':
        return `${req.path}${query}`;
      case '@authority':
        return authority;
      case '@scheme':
        return scheme;
      case '@target-uri':
        return `${scheme}://${authority}${req.path}${query}`;
      case 'x-timestamp':
        return req.header(config.hmac.timestampHeader) ?? '';
      case 'x-nonce':
        return req.header(config.hmac.nonceHeader) ?? '';
      case 'x-key-id':
        return req.header(config.hmac.keyHeader) ?? '';
      case 'content-digest':
        return digest;
      default:
        return req.header(key) ?? '';
    }
  });
}

/** The value the carrier presents on its header, past the prefix. */
function carried(
  req: PactMiddlewareRequest,
  carrier: { header: string; prefix: string },
): string | null {
  const value = req.header(carrier.header);
  return value === null ? null : afterPrefix(value, carrier.prefix);
}

/** Bearer: `undefined` = not presented, null = presented but empty. */
function readBearer(
  req: PactMiddlewareRequest,
  config: PactMiddlewareConfig,
): PactCredential | null | undefined {
  const token = carried(req, config.bearer);
  if (token === null) return undefined;
  return token === '' ? null : { scheme: 'BEARER', token };
}

/** Basic: a user pair, or an API key pair when so configured. */
function readBasic(
  req: PactMiddlewareRequest,
  config: PactMiddlewareConfig,
): PactCredential | null | undefined {
  const encoded = carried(req, config.basic);
  if (encoded === null) return undefined;
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return null;
  }
  const pair = splitPair(decoded);
  if (pair === null) return null;
  return config.basic.credential === 'apiKey'
    ? { scheme: 'APIKEY', keyId: pair[0], secret: pair[1] }
    : { scheme: 'BASIC', identifier: pair[0], password: pair[1] };
}

/** API key: one prefixed header, or the two-header form. */
function readApiKey(
  req: PactMiddlewareRequest,
  config: PactMiddlewareConfig,
): PactCredential | null | undefined {
  if ('keyHeader' in config.apiKey) {
    const keyId = req.header(config.apiKey.keyHeader);
    const secret = req.header(config.apiKey.secretHeader);
    if (keyId === null || secret === null) return undefined;
    return { scheme: 'APIKEY', keyId, secret };
  }
  const raw = carried(req, config.apiKey);
  if (raw === null) return undefined;
  const pair = splitPair(raw);
  return pair === null
    ? null
    : { scheme: 'APIKEY', keyId: pair[0], secret: pair[1] };
}

const READERS = {
  BEARER: readBearer,
  BASIC: readBasic,
  APIKEY: readApiKey,
} as const;

/**
 * Extract one {@link PactCredential} from a request, or null when none
 * is presented. Carriers, each on its configured header and prefix:
 *
 * - Bearer token → BEARER
 * - Basic `base64(id:secret)` → BASIC, or APIKEY when
 *   `basic.credential` is `'apiKey'`
 * - `ApiKey keyId:secret`, or the two-header form → APIKEY
 * - key id + signature headers → HMAC, `payload` rendered from the
 *   request template (async because of `${content-digest}`)
 *
 * A malformed carrier (undecodable base64, missing halves) and a scheme
 * excluded by `options.schemes` both return null — the core then rejects
 * with 401 or continues, per `options.optional`.
 */
export async function extractCredential(
  req: PactMiddlewareRequest,
  options?: PactMiddlewareOptions | PactMiddlewareConfig,
): Promise<PactCredential | null> {
  const config = options !== undefined && options.schemes instanceof Set
    ? options as PactMiddlewareConfig
    : resolveOptions(options as PactMiddlewareOptions | undefined);
  for (const scheme of ['BEARER', 'BASIC', 'APIKEY'] as const) {
    if (!config.schemes.has(scheme)) continue;
    const credential = READERS[scheme](req, config);
    if (credential !== undefined) return credential;
  }
  const signed = hmacHeaders(req, config);
  if (signed === null) return null;
  return {
    scheme: 'HMAC',
    keyId: signed.keyId,
    signature: signed.signature,
    payload: await requestPayload(req, config),
    algorithm: config.hmac.algorithm,
  };
}

/**
 * Map a thrown error to the HTTP response an auth boundary should send:
 * authentication failures (`PACT_AUTH_FAILURE_CODES`) are 401,
 * `PERMISSION_DENIED` is 403, `USER_EXISTS` is 409, `ENCRYPTION_INVALID`
 * is 400, any other PactError is 500 with the code hidden. Returns null
 * for non-pact errors — the adapter rethrows those to the framework's
 * own error handling.
 */
export function failureResponse(
  error: unknown,
): { status: number; body: { error: string } } | null {
  if (!(error instanceof PactError)) return null;
  if (PACT_AUTH_FAILURE_CODES.has(error.code)) {
    return { status: 401, body: { error: error.code } };
  }
  if (error.code === 'PERMISSION_DENIED') {
    return { status: 403, body: { error: error.code } };
  }
  if (error.code === 'USER_EXISTS') {
    return { status: 409, body: { error: error.code } };
  }
  if (error.code === 'ENCRYPTION_INVALID') {
    return { status: 400, body: { error: error.code } };
  }
  return { status: 500, body: { error: 'INTERNAL' } };
}

/** The 401 body sent when a route requires a credential and none was
 * presented (or none survived extraction). */
export const NO_CREDENTIALS: { status: 401; body: { error: string } } = {
  status: 401,
  body: { error: 'NO_CREDENTIALS' },
};
