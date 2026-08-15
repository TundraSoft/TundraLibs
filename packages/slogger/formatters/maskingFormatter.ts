/**
 * Masking formatter module for sensitive data protection
 * @module
 */

import type { SloggerFormatter, SlogObject } from '../types/mod.ts';
import { prettyJsonFormatter } from './jsonFormatter.ts';

/**
 * Masking strategy to use for sensitive fields
 */
export enum MaskingStrategy {
  /** Replace entire value with mask characters */
  FULL,
  /** Show first and last character, mask the rest */
  PARTIAL,
  /** Show first N characters, mask the rest */
  PREFIX,
  /** Show last N characters, mask the rest */
  SUFFIX,
}

/**
 * Configuration for masking sensitive information
 */
export type MaskingFormatterOptions = {
  /**
   * Fields to mask in the context object. Matching is **head-anchored**
   * and case-insensitive: a configured name masks a context key only
   * when it names the key's END (head), never a prefix or middle
   * fragment. A key matches when a name equals:
   *
   * - the **whole key** — `password` matches `password`/`PASSWORD`;
   * - a **component suffix** — the name's word components (split on
   *   camelCase / `_`/`-`/`.`) are the trailing components of the key,
   *   so `apiKey` matches `userApiKey`/`x-api-key` and `authToken`
   *   matches `session_auth_token`/`x-auth-token` — but NOT `tokenBucket`
   *   or `sortKey`;
   * - a **concatenation suffix**, for names of 4+ characters — the
   *   separator-stripped name is a literal suffix of the stripped key,
   *   so `authToken` also matches the run-together `authtoken`/`AUTHTOKEN`
   *   and `password` matches `dbpassword`.
   *
   * Because matching anchors to the head, a sensitive term used only as
   * a qualifier (`creditCardBrand`, `creditCardLast4`, `tokenBucket`,
   * `nextTokenCount`, `passwordHash`, `secretary`, `tokenizer`) is NOT
   * masked and its scalar type is preserved. The bare generic words
   * `key`, `token`, `auth`, `private`, `pin`, `pass` and `pwd` are
   * further restricted to whole-key matching only — see
   * {@link GENERIC_WHOLE_KEY_ONLY} — so common benign compounds that
   * merely end in one of them (`sortKey`, `cacheKey`, `pageToken`,
   * `nextPageToken`, `continuationToken`, `csrfToken`, `bypass`,
   * `compass`) are left untouched; the real
   * secret `*Key`/`*Token` compounds are enumerated as their own default
   * fields instead. Replaces the default list when provided — include
   * the defaults you still want.
   */
  sensitiveFields?: string[];
  /** Regular expressions to match sensitive data in messages */
  sensitivePatterns?: RegExp[];
  /** Character to use for masking (default: '*') */
  maskChar?: string;
  /** Strategy to use for masking (default: FULL) */
  strategy?: MaskingStrategy;
  /** Number of characters to show for PREFIX/SUFFIX strategies (default: 4) */
  visibleChars?: number;
  /** Whether to recursively search nested objects (default: true) */
  recursive?: boolean;
  /** Base formatter to use (default: jsonFormatter) */
  baseFormatter?: (log: SlogObject) => string;
};

/**
 * Default sensitive field names to mask. Matching is head-anchored and
 * case-insensitive (see {@link MaskingFormatterOptions.sensitiveFields}),
 * so a term like `apiKey` covers the compounds whose HEAD it names —
 * `userApiKey`/`x-api-key` and the run-together `apikey`/`APIKEY` — while
 * leaving `tokenBucket`/`tokenizer`/`sortKey` alone.
 *
 * The bare generic words `key` and `token` are whole-key only (see
 * {@link GENERIC_WHOLE_KEY_ONLY}) — they head far too many benign
 * compounds (`sortKey`/`cacheKey`, `pageToken`/`nextPageToken`/
 * `continuationToken`) to head-match safely — so the common secret
 * `*Key` and `*Token` compounds are enumerated explicitly. For `*Key`:
 * `apiKey`, `secretKey`, `privateKey`, `encryptionKey`, `accessKey`,
 * `sessionKey`, `signingKey`, `masterKey`, `sharedKey`, `hmacKey`. For
 * `*Token`: `authToken`, `accessToken`, `refreshToken`, `sessionToken`,
 * `apiToken`, `bearerToken`, `idToken`. Being enumerated as their own
 * terms, these are themselves head-anchored, so `userApiKey`,
 * `awsAccessKey`, `x-auth-token`, `session_auth_token` and the
 * run-together `authtoken` are caught by component-/concatenation-suffix
 * matching, while benign cursors such as `pageToken`/`resetToken`/
 * `csrfToken` pass through untouched. The seven bare generic words
 * (`auth`, `key`, `token`, `private`, `pin`, `pass`, `pwd`) match only as
 * a WHOLE key, so they don't swallow
 * `sortKey`/`authUrl`/`isPrivate`/`pageToken`/`bypass`/`compass`.
 */
const DEFAULT_SENSITIVE_FIELDS = [
  'password',
  'passwd',
  'passphrase',
  'pass',
  'pwd',
  'secret',
  'clientSecret',
  'client_secret',
  'credential',
  'credentials',
  'token',
  'jwt',
  'authToken',
  'auth_token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'sessionToken',
  'session_token',
  'bearerToken',
  'bearer_token',
  'idToken',
  'id_token',
  'apiKey',
  'api_key',
  'apiToken',
  'api_token',
  'auth',
  'authorization',
  'key',
  'secretKey',
  'privateKey',
  'private_key',
  'encryptionKey',
  'encryption_key',
  'accessKey',
  'sessionKey',
  'signingKey',
  'masterKey',
  'sharedKey',
  'hmacKey',
  'private',
  'pin',
  'otp',
  'cvv',
  'ssn',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
];

/**
 * Bare generic words that are the head of many unrelated context keys
 * (`sortKey`, `cacheKey`, `partitionKey`, `authUrl`, `authMethod`,
 * `isPrivate`, `privateIp`, `keyMetrics`, `spinner`, `pageToken`,
 * `nextPageToken`, `continuationToken`, `bypass`, `compass`). Unlike other
 * terms they match ONLY as a whole key — never as a component suffix or
 * concatenation suffix — because even head-anchored matching on them
 * would redact large classes of benign keys and coerce their scalar
 * values (`sortKey`/`cacheKey` all end in the head `key`; `pageToken`,
 * `nextPageToken`, `continuationToken`, `resetToken`, `csrfToken` all
 * end in the head `token` yet are non-secret pagination cursors /
 * anti-forgery tokens; `bypass`, `compass`, `surpass` and `encompass`
 * all end in the run-together head `pass`). Real secret compounds ending
 * in one of these generic heads are instead caught by enumerating the
 * specific compound as its own default (`apiKey`, `secretKey`,
 * `accessKey`, …, the `*Token` secrets `authToken`, `accessToken`,
 * `refreshToken`, `sessionToken`, `apiToken`, `bearerToken`, `idToken`,
 * and the password family `password`/`passwd`/`passphrase`, which are
 * long enough to head-match safely); a caller wanting another (e.g.
 * `symmetricKey`, `deployKey`, `webhookToken`, `dbPass`) adds it to
 * `sensitiveFields`.
 */
const GENERIC_WHOLE_KEY_ONLY: ReadonlySet<string> = new Set([
  'auth',
  'key',
  'token',
  'private',
  'pin',
  'pass',
  'pwd',
]);

/**
 * Shortest term eligible for concatenation-suffix matching. Terms of 3
 * characters or fewer (`otp`, `ssn`, `cvv`, `jwt`, and the generic
 * `key`/`pin`/`pwd`) match only as a whole key or a word-component
 * suffix, so
 * a short term can never align to the tail of an unrelated run-together
 * word (`ssn` at the end of `businessName` — which it isn't).
 */
const MIN_CONCAT_TERM_LENGTH = 4;

/** Word-boundary separators inside a context key (`_`, `-`, `.`, space). */
const KEY_SEPARATORS = /[\s_\-.]+/g;

/**
 * Lower-case `s` and strip every word separator, collapsing a key or
 * term to its bare concatenation (`x-api-key` → `xapikey`,
 * `credit_card` → `creditcard`).
 *
 * @param s - The key or term to normalise.
 * @returns The lower-cased, separator-stripped form.
 */
function stripSeparators(s: string): string {
  return s.toLowerCase().replace(KEY_SEPARATORS, '');
}

/**
 * Pre-compiled sensitive-key matcher. Built once per formatter from the
 * configured `sensitiveFields` (see {@link buildMatcher}) so the per-log
 * walk pays cheap comparisons instead of re-deriving the tiers for every
 * key. Every tier is HEAD-ANCHORED: a term matches only when it names
 * the END (head) of the key, never a prefix or middle fragment — this is
 * what stops benign superstrings (`tokenBucket`, `creditCardBrand`,
 * `secretary`) from being masked or having their scalar type coerced.
 */
type SensitiveMatcher = {
  /** Every term, lower-cased — matched against the whole key. */
  readonly wholeKeys: ReadonlySet<string>;
  /**
   * Non-generic terms as their word-component lists — matched when the
   * list is a SUFFIX of the key's components (`apiKey` = `['api','key']`
   * matches `userApiKey`; `authToken` = `['auth','token']` matches
   * `session_auth_token`, but not `tokenBucket` whose head is `bucket`
   * nor `pageToken` whose qualifier `page` is not an enumerated secret).
   */
  readonly componentSuffixes: readonly (readonly string[])[];
  /**
   * Non-generic terms of at least {@link MIN_CONCAT_TERM_LENGTH}
   * characters, separators stripped — matched when they are a literal
   * SUFFIX of the separator-stripped key AND the match begins at a word
   * boundary of the key, so run-together spellings with no hump to split
   * on are still caught (`authtoken`, `dbpassword`) while a compound term
   * cannot align across a boundary that IS present (`androidToken` and
   * `validToken` both end in `idtoken`, but that `id` is mid-word, so
   * neither matches `idToken`).
   */
  readonly concatSuffixes: readonly string[];
};

/**
 * Partition the configured `fields` into the matching tiers of a
 * {@link SensitiveMatcher}. The bare generic words in
 * {@link GENERIC_WHOLE_KEY_ONLY} are whole-key only; every other term is
 * also eligible for component-suffix matching and (when long enough)
 * concatenation-suffix matching.
 *
 * @param fields - The configured sensitive field names.
 * @returns The compiled matcher.
 */
function buildMatcher(fields: readonly string[]): SensitiveMatcher {
  const wholeKeys = new Set(fields.map((field) => field.toLowerCase()));
  const specific = fields.filter(
    (field) => !GENERIC_WHOLE_KEY_ONLY.has(field.toLowerCase()),
  );
  const componentSuffixes = specific
    .map((field) => splitKeyComponents(field))
    .filter((parts) => parts.length > 0);
  const concatSuffixes = [
    ...new Set(
      specific
        .map((field) => stripSeparators(field))
        .filter((term) => term.length >= MIN_CONCAT_TERM_LENGTH),
    ),
  ];
  return { wholeKeys, componentSuffixes, concatSuffixes };
}

/**
 * Default regex patterns to mask in message strings
 */
const DEFAULT_SENSITIVE_PATTERNS = [
  // Credit card numbers: 16 digits, may have spaces or dashes
  /\b(?:\d[ -]*?){13,16}\b/g,
  // API keys, tokens, etc. (common formats)
  /(?:api[_\s-]?key|token|secret|password)[:=]\s*["']?([a-zA-Z0-9_.-]+)["']?/gi, //NOSONAR
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // SSN format (US)
  /\b\d{3}-?\d{2}-?\d{4}\b/g,
];

/**
 * Masks a string value based on the provided strategy
 *
 * @param value - The string to mask
 * @param config - Masking configuration
 * @returns The masked string
 */
function maskValue(
  value: string,
  config: Required<MaskingFormatterOptions>,
): string {
  const length = value.length;

  if (length === 0) return '';

  switch (config.strategy) {
    case MaskingStrategy.FULL: {
      return config.maskChar.repeat(length);
    }

    case MaskingStrategy.PARTIAL: {
      if (length <= 2) return config.maskChar.repeat(length);
      return value[0] + config.maskChar.repeat(length - 2) + value[length - 1];
    }

    case MaskingStrategy.PREFIX: {
      const prefixLen = Math.min(config.visibleChars, length);
      return value.substring(0, prefixLen) +
        config.maskChar.repeat(length - prefixLen);
    }

    case MaskingStrategy.SUFFIX: {
      const suffixLen = Math.min(config.visibleChars, length);
      return config.maskChar.repeat(length - suffixLen) +
        value.substring(length - suffixLen);
    }

    default: {
      return config.maskChar.repeat(length);
    }
  }
}

/**
 * Placeholder emitted where the context references one of its own
 * ancestors (a cycle) — recursing would never terminate.
 */
const CIRCULAR_PLACEHOLDER = '[Circular]';

/**
 * Redact a single scalar leaf. Strings/numbers/booleans/bigints are
 * stringified and run through {@link maskValue}; functions, symbols,
 * `null` and `undefined` carry no loggable secret payload (JSON base
 * formatters drop functions/symbols and emit `null` for the rest) so
 * they pass through untouched.
 *
 * @param value - The scalar (non-object) value to redact
 * @param config - Masking configuration
 * @returns The masked scalar
 */
function maskScalar(
  value: unknown,
  config: Required<MaskingFormatterOptions>,
): unknown {
  if (typeof value === 'string') {
    return maskValue(value, config);
  }
  if (
    typeof value === 'number' || typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return maskValue(String(value), config);
  }
  // function / symbol / null / undefined — nothing to redact.
  return value;
}

/**
 * Mask-aware copy of a single value — the recursive step shared by
 * {@link maskObject} for object values and array elements.
 *
 * Copy semantics (chosen so the walk can never throw and therefore
 * never lose a log record):
 * - Primitives pass through by value; functions and symbols pass
 *   through **by reference** (a `structuredClone` would throw
 *   `DataCloneError` on them — JSON-based base formatters simply
 *   omit them downstream).
 * - `Date`s are duplicated.
 * - Arrays are copied element-wise; plain objects and class
 *   instances are copied as plain records of their own enumerable
 *   string-keyed properties via {@link maskObject}, so nested
 *   sensitive keys are still masked.
 * - Cycles are replaced with {@link CIRCULAR_PLACEHOLDER}; `seen`
 *   tracks the current ancestor path (shared but acyclic references
 *   are copied normally).
 * - With `recursive: false`, non-`Date` objects pass through by
 *   reference untouched (the historical behavior).
 *
 * When `forceMask` is set, the value sits under a sensitive ancestor
 * key: every scalar leaf beneath it is redacted regardless of its own
 * key name, so a sensitive key holding an array/object/boolean/bigint
 * (not just a string or number) is fully masked rather than leaked.
 *
 * @param value - The value to copy
 * @param config - Masking configuration
 * @param matcher - The compiled sensitive-key matcher
 * @param seen - Ancestor objects on the current recursion path
 * @param forceMask - Redact every scalar leaf (sensitive ancestor)
 * @returns The copied (and where applicable, masked) value
 */
function copyValue(
  value: unknown,
  config: Required<MaskingFormatterOptions>,
  matcher: SensitiveMatcher,
  seen: WeakSet<object>,
  forceMask: boolean = false,
): unknown {
  if (value === null || typeof value !== 'object') {
    // Primitive, function, or symbol — pass through (by reference
    // where applicable). Never throws, unlike structuredClone. Under a
    // sensitive ancestor, scalar leaves are redacted instead.
    return forceMask ? maskScalar(value, config) : value;
  }
  if (value instanceof Date) {
    // Under a sensitive ancestor a Date is a value to hide (an expiry,
    // a birth date); mask its ISO form. Otherwise duplicate it.
    return forceMask
      ? maskValue(value.toISOString(), config)
      : new Date(value.getTime());
  }
  if (!config.recursive) {
    // Historical non-recursive behavior: nested objects pass through —
    // unless the key was sensitive, in which case leaving the object in
    // cleartext would defeat the redaction, so replace it wholesale.
    return forceMask ? maskValue('[redacted]', config) : value;
  }
  if (seen.has(value)) {
    return CIRCULAR_PLACEHOLDER;
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) =>
        copyValue(item, config, matcher, seen, forceMask)
      );
    }
    return maskObject(
      value as Record<string, unknown>,
      config,
      matcher,
      seen,
      forceMask,
    );
  } finally {
    // Ancestor-path tracking: remove on the way out so the same
    // object referenced from two sibling branches (a DAG, not a
    // cycle) is copied in both places.
    seen.delete(value);
  }
}

/**
 * Split a context key into its lower-cased word components so a compound
 * name can be matched against the key's HEAD (see
 * {@link isComponentSuffix}): `authToken` → `['auth', 'token']`,
 * `db_password` → `['db', 'password']`, `bearer-token` → `['bearer',
 * 'token']`. Splits on camelCase humps (`APIKey` → `['api', 'key']`) and
 * on `_` / `-` / `.` / whitespace separators.
 *
 * Component-suffix matching over these parts catches real compound
 * secrets (`authToken`, `userApiKey`) without the substring over-masking
 * of earlier designs (`author` splits to `['author']`, not `auth`;
 * `tokenBucket` to `['token', 'bucket']`, whose head is `bucket`, so it
 * is left alone).
 *
 * Separator-less concatenations (`authtoken`, `passwordhash`) have no
 * hump to split on, so they collapse to a single component; those are
 * caught by the concatenation-suffix tier of {@link isSensitiveKey}.
 *
 * @param key - The context key.
 * @returns The lower-cased word components of `key`.
 */
function splitKeyComponents(key: string): string[] {
  return key
    // camelCase / digit boundary: `authToken`, `oauth2Token`.
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // acronym → word boundary: `APIKey` → `API Key`.
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .map((part) => part.toLowerCase())
    .filter((part) => part.length > 0);
}

/**
 * Whether the term component list `termParts` is a SUFFIX of the key's
 * component list `keyParts` — i.e. the term names the key's head.
 * `['api','key']` is a suffix of `['user','api','key']` (→ match) but
 * not of `['api','key','rotation']` (head `rotation`) or `['sort','key']`
 * (term `['api','key']` ≠ trailing `['sort','key']`).
 *
 * @param keyParts - The key's word components.
 * @param termParts - A sensitive term's word components.
 * @returns `true` when `termParts` is a trailing run of `keyParts`.
 */
function isComponentSuffix(
  keyParts: readonly string[],
  termParts: readonly string[],
): boolean {
  if (termParts.length === 0 || termParts.length > keyParts.length) {
    return false;
  }
  const offset = keyParts.length - termParts.length;
  for (let i = 0; i < termParts.length; i++) {
    if (keyParts[offset + i] !== termParts[i]) return false;
  }
  return true;
}

/**
 * Whether `key` should be masked given the compiled `matcher`. Matching
 * is HEAD-ANCHORED — a sensitive term must name the END (head) of the
 * key. `true` when any tier matches (see {@link SensitiveMatcher}):
 *
 * 1. **whole key** — `key` equals a term case-insensitively (every
 *    term, including the bare generic `key`/`token`/`auth`/`private`/
 *    `pin`/`pass`/`pwd`);
 * 2. **component suffix** — a non-generic term's word components are a
 *    SUFFIX of `key`'s camelCase / separator components (`authToken`
 *    masks `session_auth_token`, `apiKey` masks `userApiKey`/`x-api-key`)
 *    — never a prefix, so `tokenBucket`/`sortKey` are left alone;
 * 3. **concatenation suffix** — a non-generic term of at least
 *    {@link MIN_CONCAT_TERM_LENGTH} characters is a literal suffix of
 *    the separator-stripped `key` AND begins at a word boundary of the
 *    key, catching run-together spellings (`authtoken` → `authToken`,
 *    `dbpassword` → `password`) that tier 2 can't split, without letting
 *    a compound term align across a hump that is actually there
 *    (`androidToken`/`validToken` end in `idtoken` but their `id` is
 *    mid-word, so they do NOT match `idToken`).
 *
 * Because every tier anchors to the head, a sensitive term sitting at
 * the START or MIDDLE of a compound (a qualifier, not the head) does NOT
 * match: `creditCardBrand`, `creditCardLast4`, `tokenBucket`,
 * `nextTokenCount`, `passwordHash`, `secretary` and `tokenizer` all pass
 * through with their scalar types intact. And because the bare generic
 * `key`/`token`/`pass` are whole-key only, benign compounds that merely
 * end in one of them (`sortKey`, `cacheKey`, `pageToken`,
 * `nextPageToken`, `continuationToken`, `resetToken`, `csrfToken`,
 * `bypass`, `compass`) are left untouched — only the enumerated
 * `*Key`/`*Token` secrets and the `password`/`passwd`/`passphrase`
 * family are masked.
 *
 * @param key - The context key.
 * @param matcher - The compiled sensitive-key matcher.
 * @returns `true` when the key names a sensitive field.
 */
function isSensitiveKey(
  key: string,
  matcher: SensitiveMatcher,
): boolean {
  // Tier 1 — whole key (also the only tier the generic words use).
  if (matcher.wholeKeys.has(key.toLowerCase())) return true;
  // Tier 2 — component suffix (head-anchored word match).
  const keyParts = splitKeyComponents(key);
  for (const termParts of matcher.componentSuffixes) {
    if (isComponentSuffix(keyParts, termParts)) return true;
  }
  // Tier 3 — concatenation suffix (head-anchored, separator-less) that
  // begins at a WORD BOUNDARY of the key. Stripping every separator and
  // camelCase hump lets a compound term's run-together form align across
  // a boundary that IS present in the key: `androidToken` (`android` +
  // `Token`) and `validToken` (`valid` + `Token`) both collapse to
  // strings ending in `idtoken`, yet the `id` there is the tail of
  // another word, not an `idToken`. A concat match is therefore honoured
  // only when no component boundary of the key falls strictly inside the
  // matched span — i.e. the matched tail is a single unbroken run
  // (`authtoken`, `dbpassword`, the run-together spellings this tier
  // exists for) or starts exactly at a boundary. When a boundary DOES
  // fall inside the span the key had explicit structure there that tier
  // 2 already inspected, so deferring never misses a real secret.
  const stripped = keyParts.join(''); // === stripSeparators(key)
  // Component-start offsets in `stripped`: 0, len(part0), len(part0)+len(part1), …
  const boundaries: number[] = [];
  let offset = 0;
  for (const part of keyParts) {
    boundaries.push(offset);
    offset += part.length;
  }
  for (const term of matcher.concatSuffixes) {
    if (!stripped.endsWith(term)) continue;
    const matchStart = stripped.length - term.length;
    if (!boundaries.some((boundary) => boundary > matchStart)) return true;
  }
  return false;
}

/**
 * Recursively copies `obj`, masking sensitive fields along the way.
 * The copy and the masking are a single walk (see {@link copyValue}
 * for the exact copy semantics) so the formatter never depends on
 * `structuredClone`-ability of the caller's context values.
 *
 * @param obj - The object to process
 * @param config - Masking configuration
 * @param matcher - The compiled sensitive-key matcher
 * @param seen - Ancestor objects on the current recursion path
 * @param forceMask - Treat every key as sensitive (the object sits
 *   under a sensitive ancestor key)
 * @returns A new object with masked values
 */
function maskObject(
  obj: Record<string, unknown>,
  config: Required<MaskingFormatterOptions>,
  matcher: SensitiveMatcher,
  seen: WeakSet<object>,
  forceMask: boolean = false,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Head-anchored whole-key / component-suffix / concatenation-suffix
    // match (see {@link isSensitiveKey}): catches compound secrets like
    // `authToken`/`userApiKey` and their run-together spellings
    // (`authtoken`) without masking benign qualifier-position keys
    // (`tokenBucket`, `creditCardBrand`, `pageToken`) or letting the bare
    // generic words `key`/`token`/`auth`/`private`/`pin`/`pass`/`pwd`
    // over-mask `sortKey`/`pageToken`/`authUrl`/`bypass`. `forceMask`
    // propagates a sensitive
    // ancestor's sensitivity onto every descendant key.
    const isSensitive = forceMask || isSensitiveKey(key, matcher);

    if (isSensitive && typeof value === 'string') {
      // Mask sensitive string values
      result[key] = maskValue(value, config);
    } else if (isSensitive && typeof value === 'number') {
      // Convert numbers to strings before masking
      result[key] = maskValue(String(value), config);
    } else if (isSensitive) {
      // Sensitive key holding a non-string/number value (array,
      // object, boolean, bigint, Date, …). Redact the WHOLE value by
      // recursing with `forceMask` so every scalar leaf beneath it is
      // masked too — a sensitive key must never leak, whatever its
      // value type.
      result[key] = copyValue(value, config, matcher, seen, true);
    } else {
      // Non-sensitive key: mask-aware copy that still descends to mask
      // any nested sensitive keys.
      result[key] = copyValue(value, config, matcher, seen, false);
    }
  }

  return result;
}

/**
 * Masks sensitive patterns in a message string
 *
 * @param message - The message to process
 * @param config - Masking configuration
 * @returns The message with sensitive data masked
 */
function maskMessage(
  message: string,
  config: Required<MaskingFormatterOptions>,
): string {
  let result = message;

  for (const pattern of config.sensitivePatterns) {
    result = result.replace(pattern, (match) => maskValue(match, config));
  }

  return result;
}

/**
 * Creates a formatter that masks sensitive information
 *
 * The masked record is produced by a mask-aware copy — NOT
 * `structuredClone`, which throws `DataCloneError` on ordinary
 * context shapes (functions, symbols, class instances holding
 * function properties) and, because `Slogger.log()` dispatches
 * handlers fire-and-forget, would silently drop the log record. See
 * {@link copyValue} for the exact copy semantics: sensitive keys are
 * masked, plain objects/arrays/Dates are copied, non-cloneable
 * leaves (functions, symbols) pass through by reference, and cycles
 * are replaced with the string `'[Circular]'`. The original log
 * object is never mutated.
 *
 * @param config - Configuration for masking sensitive data
 * @returns A formatter function that masks sensitive information
 */
export function maskingFormatter(
  config: MaskingFormatterOptions = {},
): SloggerFormatter {
  // Merge provided config with defaults
  const fullConfig: Required<MaskingFormatterOptions> = {
    sensitiveFields: config.sensitiveFields || [...DEFAULT_SENSITIVE_FIELDS],
    sensitivePatterns: config.sensitivePatterns ||
      [...DEFAULT_SENSITIVE_PATTERNS],
    maskChar: config.maskChar || '*',
    strategy: config.strategy ?? MaskingStrategy.FULL,
    visibleChars: config.visibleChars || 4,
    recursive: config.recursive !== false,
    baseFormatter: config.baseFormatter || prettyJsonFormatter,
  };

  // Pre-compile the sensitive-key matcher once — the per-log walk then
  // pays cheap Set lookups plus a short substring scan per key instead
  // of re-deriving the matching tiers every time.
  const matcher = buildMatcher(fullConfig.sensitiveFields);

  // Return the formatter function
  return (log: SlogObject): string => {
    // Shallow-copy the record (materialising its lazy getters — id,
    // isoDate) with the message masked; the context is rebuilt by the
    // mask-aware deep copy below. The original log object and its
    // context are never mutated.
    const masked: SlogObject = {
      ...log,
      message: maskMessage(log.message, fullConfig),
    };

    // Mask sensitive fields in the context
    if (masked.context && typeof masked.context === 'object') {
      masked.context = maskObject(
        masked.context,
        fullConfig,
        matcher,
        new WeakSet(),
      );
    }

    // Apply the base formatter to the masked log object
    return fullConfig.baseFormatter(masked);
  };
}

/**
 * Default masking formatter with standard settings
 */
/**
 * Default masking formatter with standard configuration
 */
export const defaultMaskingFormatter: SloggerFormatter = maskingFormatter();
