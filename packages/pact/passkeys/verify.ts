/**
 * @fileoverview WebAuthn ceremony verification: authenticator-data and
 * clientDataJSON parsing, attestation-object decoding (policy 'none'),
 * and assertion-signature checks. Everything here treats its input as
 * attacker-supplied bytes: malformed input is a typed rejection, never
 * a raw TypeError.
 *
 * Registration failures throw `PASSKEY_REGISTRATION_FAILED` with a
 * diagnostic reason (the caller is authenticated). Assertion
 * verification returns a verdict instead of throwing, so the login path
 * can collapse every failure into one `INVALID_CREDENTIALS`.
 *
 * @module
 */
import { decodeBase64Url, encodeBase64, encodeBase64Url } from '@std/encoding';
import { coseToJwk, decodeCBOR, decodeCBORItem } from '@tundralibs/crypt/cbor';
import { ecdsaDerToRaw, verifyEC, verifyRSA } from '@tundralibs/crypt/sign';
import { PactError } from '../errors/mod.ts';
import type {
  PactPasskeyAssertionResponse,
  PactPasskeyConfig,
  PactPasskeyRegistrationResponse,
  PactStoredPasskey,
} from '../types/mod.ts';

/** `options.passkeys` after validation: sets built, defaults applied. */
export type NormalizedPasskeyConfig = {
  readonly rpId: string;
  readonly rpName: string;
  readonly origins: ReadonlySet<string>;
  readonly userVerification: 'REQUIRED' | 'PREFERRED' | 'DISCOURAGED';
  readonly algorithms: ReadonlySet<'ES256' | 'RS256'>;
  readonly timeout: number;
};

const USER_VERIFICATION_VALUES: ReadonlySet<string> = new Set(
  ['REQUIRED', 'PREFERRED', 'DISCOURAGED'],
);
const ALGORITHM_VALUES: ReadonlySet<string> = new Set(['ES256', 'RS256']);

/** JWS name → COSE identifier for `pubKeyCredParams`. */
export const COSE_BY_ALGORITHM: Readonly<Record<'ES256' | 'RS256', number>> = {
  ES256: -7,
  RS256: -257,
};

function invalid(reason: string): PactError {
  return new PactError('INVALID_OPTION', { option: 'passkeys', reason });
}

/**
 * Validate and normalize the `passkeys` option block: caps enums
 * checked, origins parsed and canonicalized, the rpId proven to be a
 * registrable suffix of every origin.
 *
 * @throws {PactError} `INVALID_OPTION` on any malformed field.
 */
export function normalizePasskeyConfig(
  config: PactPasskeyConfig,
): NormalizedPasskeyConfig {
  if (typeof config.rpId !== 'string' || config.rpId.trim() === '') {
    throw invalid('rpId must be a non-empty domain');
  }
  if (config.rpId.includes('/') || config.rpId.includes(':')) {
    throw invalid('rpId is a bare domain, not a URL');
  }
  if (typeof config.rpName !== 'string' || config.rpName.trim() === '') {
    throw invalid('rpName must be a non-empty string');
  }
  if (!Array.isArray(config.origins) || config.origins.length === 0) {
    throw invalid('origins must list at least one origin');
  }
  const origins = new Set<string>();
  for (const raw of config.origins) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw invalid(`origin '${String(raw)}' is not a valid URL`);
    }
    if (url.origin === 'null') {
      throw invalid(`origin '${String(raw)}' has no usable web origin`);
    }
    const host = url.hostname;
    if (host !== config.rpId && !host.endsWith(`.${config.rpId}`)) {
      throw invalid(
        `origin '${url.origin}' is outside the rpId '${config.rpId}' scope`,
      );
    }
    origins.add(url.origin);
  }
  const userVerification = config.userVerification ?? 'PREFERRED';
  if (!USER_VERIFICATION_VALUES.has(userVerification)) {
    throw invalid(
      "userVerification must be 'REQUIRED', 'PREFERRED', or 'DISCOURAGED'",
    );
  }
  const algorithms = new Set(config.algorithms ?? ['ES256', 'RS256']);
  if (algorithms.size === 0) {
    throw invalid('algorithms must list at least one algorithm');
  }
  for (const algorithm of algorithms) {
    if (!ALGORITHM_VALUES.has(algorithm)) {
      throw invalid(`unsupported algorithm '${String(algorithm)}'`);
    }
  }
  const timeout = config.timeout ?? 60_000;
  if (
    typeof timeout !== 'number' || !Number.isInteger(timeout) || timeout <= 0 ||
    timeout > 600_000
  ) {
    throw invalid('timeout must be a positive integer of at most 600000 ms');
  }
  return {
    rpId: config.rpId,
    rpName: config.rpName,
    origins,
    userVerification,
    algorithms: algorithms as ReadonlySet<'ES256' | 'RS256'>,
    timeout,
  };
}

// ── binary plumbing ─────────────────────────────────────────────────

function b64urlDecode(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || value === '') return null;
  try {
    return decodeBase64Url(value);
  } catch {
    return null;
  }
}

/** Strip base64url padding so browser and pact encodings compare equal
 * ('=' only ever appears as padding in base64). */
function stripPadding(value: string): string {
  return value.split('=', 1)[0]!;
}

async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', data as BufferSource),
  );
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

type ClientData = { type: string; challenge: string; origin: string };

/** Parse and shape-check clientDataJSON; null on anything malformed. */
function parseClientData(encoded: string): ClientData | null {
  const bytes = b64urlDecode(encoded);
  if (bytes === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const data = parsed as Record<string, unknown>;
  if (
    typeof data.type !== 'string' || typeof data.challenge !== 'string' ||
    typeof data.origin !== 'string'
  ) return null;
  return { type: data.type, challenge: data.challenge, origin: data.origin };
}

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

type AuthData = {
  readonly rpIdHash: Uint8Array;
  readonly userPresent: boolean;
  readonly userVerified: boolean;
  readonly signCount: number;
  /** Attested credential data — present only when the AT flag is set. */
  readonly credential?: {
    readonly id: Uint8Array;
    readonly cosePublicKey: unknown;
  };
};

/** Parse authenticator data; null on truncated or malformed bytes. */
function parseAuthenticatorData(bytes: Uint8Array): AuthData | null {
  if (bytes.length < 37) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = bytes[32]!;
  const base = {
    rpIdHash: bytes.slice(0, 32),
    userPresent: (flags & FLAG_UP) !== 0,
    userVerified: (flags & FLAG_UV) !== 0,
    signCount: view.getUint32(33),
  };
  if ((flags & FLAG_AT) === 0) return base;
  // aaguid(16) + credentialIdLength(2) + credentialId + COSE key
  if (bytes.length < 55) return null;
  const idLength = view.getUint16(53);
  const idEnd = 55 + idLength;
  if (idLength === 0 || idLength > 1023 || bytes.length < idEnd) return null;
  try {
    const { value } = decodeCBORItem(bytes, idEnd);
    return {
      ...base,
      credential: { id: bytes.slice(55, idEnd), cosePublicKey: value },
    };
  } catch {
    return null;
  }
}

/** The shared clientData gate; null reason means it passed. */
function clientDataFailure(
  client: ClientData | null,
  expectedType: string,
  expectedChallenge: string,
  config: NormalizedPasskeyConfig,
): string | null {
  if (client === null) return 'clientDataJSON is malformed';
  if (client.type !== expectedType) {
    return `clientData type '${client.type}' is not '${expectedType}'`;
  }
  if (
    stripPadding(client.challenge) !== stripPadding(expectedChallenge) ||
    stripPadding(expectedChallenge) === ''
  ) return 'challenge mismatch';
  if (!config.origins.has(client.origin)) {
    return `origin '${client.origin}' is not allowed`;
  }
  return null;
}

// ── registration ────────────────────────────────────────────────────

function registrationFailed(reason: string): PactError {
  return new PactError('PASSKEY_REGISTRATION_FAILED', { reason });
}

/**
 * Verify a registration ceremony under attestation policy 'none' and
 * extract what gets stored. The attestation statement is parsed but not
 * chain-verified — full attestation slots in here if device allowlists
 * ever demand it.
 *
 * @throws {PactError} `PASSKEY_REGISTRATION_FAILED` with a diagnostic
 *   reason on any verification failure.
 */
export async function verifyRegistrationCeremony(
  response: PactPasskeyRegistrationResponse,
  expectedChallenge: string,
  config: NormalizedPasskeyConfig,
): Promise<Omit<PactStoredPasskey, 'userId' | 'metadata'>> {
  if (
    response === null || typeof response !== 'object' ||
    typeof response.id !== 'string' || response.id === '' ||
    response.response === null || typeof response.response !== 'object'
  ) {
    throw registrationFailed('response is not a registration payload');
  }
  const clientFailure = clientDataFailure(
    parseClientData(response.response.clientDataJSON),
    'webauthn.create',
    expectedChallenge,
    config,
  );
  if (clientFailure !== null) throw registrationFailed(clientFailure);

  const attestationBytes = b64urlDecode(response.response.attestationObject);
  if (attestationBytes === null) {
    throw registrationFailed('attestationObject is not base64url');
  }
  let attestation: unknown;
  try {
    attestation = decodeCBOR(attestationBytes);
  } catch {
    throw registrationFailed('attestationObject is not valid CBOR');
  }
  if (!(attestation instanceof Map)) {
    throw registrationFailed('attestationObject is not a CBOR map');
  }
  const fmt = attestation.get('fmt');
  const authDataBytes = attestation.get('authData');
  if (typeof fmt !== 'string' || !(authDataBytes instanceof Uint8Array)) {
    throw registrationFailed('attestationObject is missing fmt/authData');
  }
  const authData = parseAuthenticatorData(authDataBytes);
  if (authData === null) {
    throw registrationFailed('authenticator data is malformed');
  }
  if (authData.credential === undefined) {
    throw registrationFailed('no attested credential data present');
  }
  const expectedRpIdHash = await sha256Bytes(
    new TextEncoder().encode(config.rpId),
  );
  if (!bytesEqual(authData.rpIdHash, expectedRpIdHash)) {
    throw registrationFailed('rpIdHash does not match the configured rpId');
  }
  if (!authData.userPresent) {
    throw registrationFailed('user-presence flag is not set');
  }
  if (config.userVerification === 'REQUIRED' && !authData.userVerified) {
    throw registrationFailed(
      'user verification is required and was not performed',
    );
  }
  const credentialId = stripPadding(encodeBase64Url(authData.credential.id));
  if (stripPadding(response.id) !== credentialId) {
    throw registrationFailed(
      'response id does not match the attested credential',
    );
  }
  let jwk: JsonWebKey;
  let algorithm: string;
  try {
    const result = coseToJwk(
      authData.credential.cosePublicKey as Parameters<typeof coseToJwk>[0],
    );
    jwk = result.jwk;
    algorithm = result.algorithm;
  } catch (error) {
    throw registrationFailed(
      `credential public key rejected: ${String((error as Error).message)}`,
    );
  }
  if (
    (algorithm !== 'ES256' && algorithm !== 'RS256') ||
    !config.algorithms.has(algorithm)
  ) {
    throw registrationFailed(`algorithm '${algorithm}' is not enabled`);
  }
  // The COSE `alg` label is attacker-controlled and coseToJwk trusts it
  // over the key material — refuse self-inconsistent keys here rather
  // than store a credential that can never (or, for a degenerate RSA
  // exponent, trivially) verify.
  if (!keyMatchesAlgorithm(jwk, algorithm)) {
    throw registrationFailed('credential public key failed sanity checks');
  }
  return {
    id: credentialId,
    publicKey: JSON.stringify(jwk),
    algorithm,
    signCount: authData.signCount,
    transports: sanitizeTransports(response.response.transports),
  };
}

/** The key material must actually be what the algorithm claims: P-256
 * coordinates of exactly 32 bytes for ES256; a 2048-bit-or-larger
 * modulus with a standard exponent (65537 or 3) for RS256. */
function keyMatchesAlgorithm(
  jwk: JsonWebKey,
  algorithm: 'ES256' | 'RS256',
): boolean {
  const fieldLength = (value: string | undefined): number =>
    value === undefined ? -1 : b64urlDecode(value)?.length ?? -1;
  if (algorithm === 'ES256') {
    return jwk.kty === 'EC' && jwk.crv === 'P-256' &&
      fieldLength(jwk.x) === 32 && fieldLength(jwk.y) === 32;
  }
  return jwk.kty === 'RSA' && (jwk.e === 'AQAB' || jwk.e === 'Aw') &&
    fieldLength(jwk.n) >= 256;
}

function sanitizeTransports(
  transports: readonly string[] | undefined,
): readonly string[] | undefined {
  if (!Array.isArray(transports)) return undefined;
  const clean = transports.filter(
    (t): t is string => typeof t === 'string' && t.length <= 32,
  );
  return clean.length === 0 ? undefined : clean.slice(0, 8);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ── assertion ───────────────────────────────────────────────────────

/**
 * The assertion verdict: invalid carries only the clone signal (for the
 * `passkeyCloneSuspected` event) — the login path collapses every
 * invalid verdict into `INVALID_CREDENTIALS`.
 */
export type AssertionVerdict =
  | { readonly valid: false; readonly cloneSuspected: boolean }
  | { readonly valid: true; readonly signCount: number };

const INVALID: AssertionVerdict = { valid: false, cloneSuspected: false };

/**
 * Verify a login assertion against one stored passkey: clientData gate,
 * rpIdHash, presence/verification flags, signature, and the signature
 * counter. Never throws on bad input — every failure is a verdict.
 */
export async function verifyAssertionCeremony(
  response: PactPasskeyAssertionResponse,
  expectedChallenge: string,
  config: NormalizedPasskeyConfig,
  passkey: PactStoredPasskey,
): Promise<AssertionVerdict> {
  if (
    response === null || typeof response !== 'object' ||
    response.response === null || typeof response.response !== 'object'
  ) return INVALID;
  const clientFailure = clientDataFailure(
    parseClientData(response.response.clientDataJSON),
    'webauthn.get',
    expectedChallenge,
    config,
  );
  if (clientFailure !== null) return INVALID;

  const authDataBytes = b64urlDecode(response.response.authenticatorData);
  const signatureBytes = b64urlDecode(response.response.signature);
  const clientDataBytes = b64urlDecode(response.response.clientDataJSON);
  if (
    authDataBytes === null || signatureBytes === null ||
    clientDataBytes === null
  ) return INVALID;
  const authData = parseAuthenticatorData(authDataBytes);
  if (authData === null) return INVALID;
  const expectedRpIdHash = await sha256Bytes(
    new TextEncoder().encode(config.rpId),
  );
  if (!bytesEqual(authData.rpIdHash, expectedRpIdHash)) return INVALID;
  if (!authData.userPresent) return INVALID;
  if (config.userVerification === 'REQUIRED' && !authData.userVerified) {
    return INVALID;
  }

  let jwk: JsonWebKey;
  try {
    jwk = JSON.parse(passkey.publicKey) as JsonWebKey;
  } catch {
    return INVALID; // corrupt stored key — fail closed
  }
  const signedData = concat(authDataBytes, await sha256Bytes(clientDataBytes));
  let signatureValid = false;
  try {
    if (passkey.algorithm === 'ES256') {
      signatureValid = await verifyEC(
        signedData,
        ecdsaDerToRaw(signatureBytes, 'P-256'),
        jwk,
        { curve: 'P-256' },
      );
    } else if (passkey.algorithm === 'RS256') {
      // WebAuthn RS256 is RSASSA-PKCS1-v1_5 — crypt defaults to PSS.
      signatureValid = await verifyRSA(
        signedData,
        encodeBase64(signatureBytes),
        jwk,
        { scheme: 'PKCS1' },
      );
    }
  } catch {
    return INVALID; // malformed signature material is a 401, never a 500
  }
  if (!signatureValid) return INVALID;

  // Counter regression with counters in use is the cloned-authenticator
  // signal; synced passkeys report 0 forever and skip the check.
  if (
    (passkey.signCount > 0 || authData.signCount > 0) &&
    authData.signCount <= passkey.signCount
  ) {
    return { valid: false, cloneSuspected: true };
  }
  return { valid: true, signCount: authData.signCount };
}
