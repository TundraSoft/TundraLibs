/**
 * @fileoverview `createPactMiddleware(pact, options)` — the framework-neutral
 * factory every adapter wraps: one options bag, one challenge, and the two
 * halves as pure functions over a request view and an auth context. An
 * adapter for any stack is a few lines mapping a verdict to its response.
 *
 * @module
 */
import type { Pact } from '../Pact.ts';
import type { PactAuthContext, PermissionBits } from '../types/mod.ts';
import { PactError } from '../errors/mod.ts';
import type {
  PactMiddlewareConfig,
  PactMiddlewareCore,
  PactMiddlewareDenial,
  PactMiddlewareOptions,
  PactMiddlewareRequest,
  PactMiddlewareResponder,
} from './types/mod.ts';
import {
  failureResponse,
  isFreshTimestamp,
  queryOf,
  readCarrier,
  requestPayload,
  resolveOptions,
} from './shared.ts';
import { contentDigest } from './template.ts';

/** The scheme words a `WWW-Authenticate` challenge uses. */
const CHALLENGE_NAME = {
  BEARER: 'Bearer',
  BASIC: 'Basic',
  APIKEY: 'ApiKey',
  HMAC: 'HMAC',
} as const;
const JOSE = 'application/jose';
const DECODER = new TextDecoder();

/** Build the `WWW-Authenticate` value: one challenge per scheme (RFC 7235). */
function challengeFor(
  config: PactMiddlewareConfig,
  options: PactMiddlewareOptions,
): string {
  const param = options.realm === undefined
    ? ''
    : ` realm="${options.realm.replace(/["\\]/g, '')}"`;
  return [...config.schemes].map((s) => `${CHALLENGE_NAME[s]}${param}`).join(
    ', ',
  );
}

/** The same view with `body()` read once, however many features need it. */
function memoBody(req: PactMiddlewareRequest): PactMiddlewareRequest {
  const read = req.body;
  if (read === undefined) return req;
  let pending: Promise<Uint8Array | string | null> | undefined;
  return {
    method: req.method,
    path: req.path,
    query: req.query,
    authority: req.authority,
    scheme: req.scheme,
    header: (name) => req.header(name),
    body: () => pending ??= read.call(req),
  };
}

/** The media type of a header value, without parameters, lowercased. */
function mediaType(value: string | null): string {
  return (value ?? '').split(';', 1)[0]!.trim().toLowerCase();
}

/**
 * Whether the request carries a body. The raw bytes settle it when the
 * adapter can see them; otherwise the framing headers do — a parser may
 * have consumed the stream before the adapter ran.
 */
function hasBody(
  req: PactMiddlewareRequest,
  raw: Uint8Array | string | null,
): boolean {
  if (raw !== null) return raw.length > 0;
  const length = req.header('content-length');
  return (length !== null && length !== '0') ||
    req.header('transfer-encoding') !== null;
}

/**
 * Build the neutral core over one instance and one options bag. The
 * adapters (`expressPact`, `fastifyPact`, `oakPact`, `honoPact`) are
 * thin glue over this; use it directly for any other framework.
 *
 * @example
 * ```ts ignore
 * const core = createPactMiddleware(pact, { optional: true });
 * async function myAuth(req: MyRequest, res: MyResponse, pass: () => void) {
 *   const verdict = await core.authenticate({
 *     method: req.method, path: req.pathname, header: (n) => req.headers.get(n),
 *   });
 *   if (!verdict.ok) return res.send(verdict.denial.status, verdict.denial.body, verdict.denial.headers);
 *   req.auth = verdict.auth;
 *   pass();
 * }
 * ```
 *
 * @throws {PactError} INVALID_OPTION when a carrier or template option is
 *   malformed; UNKNOWN_MODULE / PERMISSION_NOT_IN_MODULE from
 *   `authorize()` when the module or permission is not in the instance's
 *   catalog — at the call site, not on the first request.
 */
export function createPactMiddleware<
  B extends PermissionBits,
  M extends string,
>(
  pact: Pact<B, M>,
  options: PactMiddlewareOptions = {},
): PactMiddlewareCore<B, M> {
  const config = resolveOptions(options);
  const challenge = challengeFor(config, options);
  const denialHeaders = (status: number): Readonly<Record<string, string>> =>
    status === 401 && options.challenge !== false
      ? { 'www-authenticate': challenge }
      : {};
  const deny = (
    status: PactMiddlewareDenial['status'],
    error: string,
  ): PactMiddlewareDenial => ({
    status,
    body: { error },
    headers: denialHeaders(status),
  });
  const denyFrom = (error: unknown): PactMiddlewareDenial => {
    const failure = failureResponse(error);
    if (failure === null) throw error; // not pact's — the framework's error path
    return deny(
      failure.status as PactMiddlewareDenial['status'],
      failure.body.error,
    );
  };

  /** Sign and/or encrypt the finished response for one key-bound caller. */
  const responder = (
    keyId: string,
    signs: boolean,
    encrypts: boolean,
    req: PactMiddlewareRequest,
  ): PactMiddlewareResponder =>
  async (res) => {
    const headers: Record<string, string> = {};
    let body = res.body;
    let patched: string | undefined;
    if (
      encrypts && config.encryption !== null && body !== null && body.length > 0
    ) {
      patched = await pact.encryptFor(keyId, body, {
        enc: config.encryption.enc,
      });
      body = patched;
      headers['content-type'] = JOSE;
    }
    if (signs && config.hmac.response !== null) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const nonce = req.header(config.hmac.nonceHeader);
      const digest = await contentDigest(body);
      const payload = config.hmac.response.render((key) => {
        switch (key) {
          case '@status':
            return String(res.status);
          case '@method':
            return req.method.toUpperCase();
          case '@path':
            return req.path;
          case '@query':
            return queryOf(req);
          case 'x-timestamp':
            return timestamp;
          case 'x-nonce':
            return nonce ?? '';
          case 'x-key-id':
            return keyId;
          case 'content-digest':
            return digest;
          default:
            return ''; // unreachable: response keys are validated at boot
        }
      });
      headers[config.hmac.timestampHeader] = timestamp;
      headers[config.hmac.signatureHeader] = await pact.signFor(
        keyId,
        payload,
        { algorithm: config.hmac.algorithm },
      );
      if (nonce !== null) headers[config.hmac.nonceHeader] = nonce;
    }
    return patched === undefined ? { headers } : { headers, body: patched };
  };

  /**
   * Open an encrypted request payload for a key-bound caller: the
   * plaintext, `undefined` when none arrived, or a denial.
   */
  const openPayload = async (
    keyId: string,
    req: PactMiddlewareRequest,
  ): Promise<Uint8Array | undefined | { denial: PactMiddlewareDenial }> => {
    if (config.encryption === null) return undefined;
    const raw = await req.body?.() ?? null;
    if (!hasBody(req, raw)) return undefined;
    if (mediaType(req.header('content-type')) !== JOSE) {
      return config.encryption.required
        ? { denial: deny(400, 'ENCRYPTION_INVALID') }
        : undefined;
    }
    if (raw === null) {
      // The adapter cannot see a JOSE body: nothing to decrypt with.
      return { denial: deny(400, 'ENCRYPTION_INVALID') };
    }
    const jwe = typeof raw === 'string' ? raw : DECODER.decode(raw);
    try {
      return await pact.decryptFor(keyId, jwe.trim(), {
        enc: [config.encryption.enc],
      });
    } catch (error) {
      return { denial: denyFrom(error) };
    }
  };

  return {
    challenge,
    async authenticate(incoming) {
      const req = memoBody(incoming);
      const carrier = readCarrier(req, config);
      if (carrier === null) {
        if (options.optional === true) return { ok: true, auth: undefined };
        return { ok: false, denial: deny(401, 'NO_CREDENTIALS') };
      }
      // Freshness is checked before the body is digested, so a stale or
      // forged signed request costs no hashing and no key lookup.
      if (
        carrier.kind === 'hmac' &&
        !isFreshTimestamp(
          req.header(config.hmac.timestampHeader),
          config.hmac.maxSkew,
        )
      ) {
        return { ok: false, denial: deny(401, 'STALE_TIMESTAMP') };
      }
      const credential = carrier.kind === 'credential' ? carrier.credential : {
        scheme: 'HMAC' as const,
        keyId: carrier.keyId,
        signature: carrier.signature,
        payload: await requestPayload(req, config),
        algorithm: config.hmac.algorithm,
      };
      let auth: PactAuthContext<M, B>;
      try {
        auth = await pact.authenticate(credential);
      } catch (error) {
        return { ok: false, denial: denyFrom(error) };
      }
      if (credential.scheme !== 'APIKEY' && credential.scheme !== 'HMAC') {
        return { ok: true, auth };
      }
      const keyId = credential.keyId;
      const opened = await openPayload(keyId, req);
      if (opened !== undefined && !(opened instanceof Uint8Array)) {
        return { ok: false, denial: opened.denial };
      }
      const signs = credential.scheme === 'HMAC' &&
        config.hmac.response !== null;
      // The response is encrypted for callers who showed they can read
      // one: they sent a JWE, asked for one, or the deployment demands it.
      const encrypts = config.encryption !== null &&
        (opened !== undefined || config.encryption.required ||
          mediaType(req.header('accept')) === JOSE);
      const respond = signs || encrypts
        ? responder(keyId, signs, encrypts, req)
        : undefined;
      return {
        ok: true,
        auth,
        ...(opened === undefined ? {} : { body: opened }),
        ...(respond === undefined ? {} : { respond }),
      };
    },
    authorize(module, permission) {
      // getModulePermissions throws UNKNOWN_MODULE itself; the ceiling
      // check is ours. Both at build time — a typo is a boot error.
      if (!pact.getModulePermissions(module).includes(permission)) {
        throw new PactError('PERMISSION_NOT_IN_MODULE', { permission, module });
      }
      return async (auth: PactAuthContext<M, B> | undefined) => {
        if (auth === undefined) return deny(401, 'NO_CREDENTIALS');
        try {
          await auth.principal.assert(module, permission);
          return undefined;
        } catch (error) {
          return denyFrom(error);
        }
      };
    },
  };
}
