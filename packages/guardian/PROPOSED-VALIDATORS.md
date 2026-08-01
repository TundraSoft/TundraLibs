# Proposed Guardian validators

A working list of validations / helpers that would be valuable to add. Grouped
by guardian. Items marked **★** are the highest-value additions. Items marked
**✅** have shipped; items in **🟡 follow-up** are deferred for a later round.

> Conventions: every entry follows the existing chain-method shape — returns
> a fresh instance via `_cloneWith` / `process()` — and ships with OpenAPI
>
> - JSON-Schema metadata where the keyword has a direct schema equivalent.

---

## BaseGuardian

- ✅ **Drop `description=` / `title=` / `examples=` / `deprecated=` setters** —
  they mutated the receiver and contradicted the immutable chain contract.
  Use `.describe({...})` instead.
- ✅ **`.brand<B>()` — universal nominal typing.** Returns a guardian whose
  inferred output type is `T & { readonly [unique symbol]: B }`. Runtime
  no-op; lives entirely in the type system.

---

## StringGuardian

Already covers length / pattern / email / url / uuid* / phone / IPs /
slug / hexColor / domain / credit card / SQL/XSS guards / case-converters /
transforms.

| Method                                    | Status    | Signature                                                         | Notes                                                                                                                                                                                      |
| ----------------------------------------- | --------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ★ **`base64()`**                          | ✅        | `base64(opts?: { urlSafe?: boolean }): this`                      | RFC 4648 base64 / base64url. Maps to `format: 'byte'` / `'base64url'`.                                                                                                                     |
| ★ **`hex()`**                             | ✅        | `hex(opts?: { length?: number; prefix?: '0x' \| 'none' }): this`  | Hex string of N chars. Handles `0x` prefix for Ethereum addresses, hashes, etc.                                                                                                            |
| ★ **`jwt()`**                             | ✅        | `jwt(): this`                                                     | Three base64url segments joined by `.`. Format check only — signature verification stays a runtime concern.                                                                                |
| ★ **`isbn()`**                            | ✅        | `isbn(version?: 10 \| 13): this`                                  | Full ISBN-10 / ISBN-13 checksum. Hyphens / spaces stripped before validation.                                                                                                              |
| **`semver()`**                            | ✅        | `semver(opts?: { allowPrerelease?: boolean }): this`              | Canonical SemVer 2.0.0 regex; `allowPrerelease: false` rejects `1.0.0-rc.1`.                                                                                                               |
| **`mimeType()`**                          | ✅        | `mimeType(allowed?: readonly string[]): this`                     | Format check + optional allow-list (case-insensitive on the primary type).                                                                                                                 |
| **`countryCode()`**                       | ✅        | `countryCode(format?: 'alpha-2' \| 'alpha-3' \| 'numeric'): this` | ISO 3166 — format-only; chain `.isIn([...])` for membership.                                                                                                                               |
| **`currencyCode()`**                      | ✅        | `currencyCode(): this`                                            | ISO 4217 — format-only.                                                                                                                                                                    |
| **`postalCode(pattern)`**                 | ✅        | `postalCode(pattern: RegExp): this`                               | Pluggable — callers bring their own postal-code regex per jurisdiction. Sets `format: 'postal-code'` on the schema. Guardian does not ship country tables.                                 |
| **`languageCode()`**                      | ✅        | `languageCode(): this`                                            | BCP 47 / RFC 5646 — language + optional script + optional region + optional variants (strict variant grammar: 5-8 chars OR 4 chars starting with a digit). Sets `format: 'bcp47'`.         |
| **`latLngString()`**                      | ✅        | `latLngString(opts?: { separator? }): this`                       | Validates `"lat,lng"` (default separator `,`; configurable). Whitespace tolerated and stripped. Lat in `-90..90`, lng in `-180..180`. Returns the canonical form.                          |
| **`ulid()`**                              | ✅        | `ulid(): this`                                                    | 26-char Crockford base32 (case-insensitive).                                                                                                                                               |
| **`cuid()` / `cuid2()`**                  | ✅        | `cuid(): this` / `cuid2(opts?: { length?: number }): this`        | Both shipped; `cuid2.length` defaults to ≥ 24.                                                                                                                                             |
| **`base58()`**                            | ✅        | `base58(): this`                                                  | Bitcoin / IPFS alphabet (`1-9 A-H J-N P-Z a-k m-z` — omits visually-ambiguous `0`, `O`, `I`, `l`). Alphabet check only; no checksum (use Base58Check downstream). Sets `format: 'base58'`. |
| **`base32()`**                            | ✅        | `base32(): this`                                                  | RFC 4648 standard alphabet (`A-Z 2-7`) with optional `=` padding. Useful for OTP secrets / TOTP. For ULID-style Crockford base32, use `.ulid()`.                                           |
| **`json()`**                              | ✅        | `json(): this`                                                    | Validates input parses as JSON; input passes through unchanged.                                                                                                                            |
| **`emoji({ onlyEmoji?, allowSpaces? })`** | ✅        |                                                                   | Uses Unicode `\p{Emoji}` property. `onlyEmoji` enforces emoji-only; `allowSpaces` tolerates whitespace alongside.                                                                          |
| **`stripHtml()` / `escapeHtml()`**        | ⏭ skipped |                                                                   | Out of scope — Guardian validates, sanitizers sanitize. Use a dedicated sanitizer (DOMPurify, etc.) downstream.                                                                            |
| **`encodeUri()` / `decodeUri()`**         | ✅        |                                                                   | Thin transforms over `encodeURIComponent` / `decodeURIComponent`. `decodeUri` wraps malformed-escape `URIError` as `GuardianError`.                                                        |
| **`htmlSafe()`**                          | ⏭ skipped |                                                                   | Out of scope alongside `stripHtml` / `escapeHtml`.                                                                                                                                         |
| **`password()`**                          | ✅        | `password(rules?: {...}): this`                                   | Bundled length / character-class / max-consecutive / common-list policy.                                                                                                                   |
| **`toBigInt()`**                          | ✅        | `toBigInt(opts?: { hex?: boolean }): BigIntGuardian`              | String → bigint. With `{ hex: true }` accepts `0x`-prefixed or raw hex. Closes the round-trip with `BigIntGuardian.toHex()`.                                                               |

---

## NumberGuardian

Already covers min/max/range/positive/negative/integer/finite/safeInteger/
multipleOf/odd/even/prime/nonZero/validPort/timestamp/power/latitude/longitude

- math transforms.

| Method                               | Status | Signature                                                       | Notes                                                                                                                                                                                                                                                                   |
| ------------------------------------ | ------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ★ **`percentage()`**                 | ✅     | `percentage(opts?: { allowOver?: boolean }): this`              | `0..100`; `allowOver: true` permits > 100 (APR, growth rates).                                                                                                                                                                                                          |
| ★ **`probability()`**                | ✅     | `probability(): this`                                           | `0..1` inclusive.                                                                                                                                                                                                                                                       |
| ★ **`port()`**                       | ✅     | alias of `validPort()`                                          | Shorter, more discoverable.                                                                                                                                                                                                                                             |
| **`fullYear()`**                     | ✅     | `fullYear(opts?: { min?: number; max?: number }): this`         | Replaces the proposed `yearFour` (renamed at user's request). Default range `1900..2099`.                                                                                                                                                                               |
| **`unixSeconds()` / `unixMillis()`** | ✅     |                                                                 | Disambiguate the loose `timestamp()`. `unixSeconds` accepts 0..253_402_300_799 (year 9999). `unixMillis` accepts 978_307_200_000..253_402_300_799_999 — deliberately rejects seconds-scale values to catch unit-confusion bugs. Both set a `format` hint on the schema. |
| **`bps()`**                          | ✅     | `bps(): this`                                                   | Basis points (0..10000).                                                                                                                                                                                                                                                |
| **`naturalNumber()`**                | ✅     | `naturalNumber(): this`                                         | Non-negative integer (alias-ish over `.integer().nonNegative()`).                                                                                                                                                                                                       |
| **`bigDecimal()`**                   | ✅     | `bigDecimal(opts: { scale: number; precision?: number }): this` | Fixed-point decimal — enforces exact representation at `scale` digits.                                                                                                                                                                                                  |
| **`evenlyDivisible()`**              | ✅     | `evenlyDivisible(divisors: number[]): this`                     | Generalises `multipleOf` to a list. Throws on first failing divisor.                                                                                                                                                                                                    |

---

## DateGuardian

Has past/future/min/max/weekday/businessHours/age/ageRange/quarter/leapYear/
holiday/timezone/component + format/ISO/timestamp transforms.

| Method                                                | Status             | Signature                                                              | Notes                                                          |
| ----------------------------------------------------- | ------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| ★ **`isoDateOnly()` / `isoTimeOnly()`**               | ✅                 |                                                                        | Validates the input matches strict `YYYY-MM-DD` / `HH:MM:SS`.  |
| ★ **`afterToday()` / `beforeToday()`**                | ✅                 |                                                                        | Strict relative comparisons using midnight-boundary `Date()`.  |
| **`withinRange(amount, unit)`**                       | ✅                 | `withinRange(n, 'seconds'\|'minutes'\|'hours'\|'days'\|'weeks'): this` | `±n` of `now`.                                                 |
| **`ageMin()` / `ageMax()`**                           | ✅                 |                                                                        | One-sided age bounds.                                          |
| **`sameDayAs(other)` / `sameMonthAs` / `sameYearAs`** | ✅                 |                                                                        | Calendar-aware comparisons (not raw ms).                       |
| **`fiscalYear(startMonth, year)`**                    | ✅                 |                                                                        | Caller declares the FY-start month; range computed from there. |
| **`businessDay()`**                                   | ⏭ skipped per user |                                                                        | Composition of weekdays + non-holiday; just chain the two.     |

---

## ArrayGuardian

Covers length/minLength/maxLength/nonEmpty/unique/includes/excludes + many
transform/curation helpers.

| Method                                        | Status | Signature                                       | Notes                                                                                                                                      |
| --------------------------------------------- | ------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| ★ **`sorted()`**                              | ✅     | `sorted(opts?: { order?; by? }): this`          | Validates pre-sorted; custom comparator for object arrays.                                                                                 |
| ★ **`distinctBy(keyFn)`**                     | ✅     |                                                 | Projection-based uniqueness.                                                                                                               |
| **`pairs()`**                                 | ✅     | `pairs(): ArrayGuardian<[T, T]>`                | Consecutive-pairs transform.                                                                                                               |
| **`tail(n)`**                                 | ✅     |                                                 | Counterpart to `take(n)` / `skip(n)`.                                                                                                      |
| **`chunk(size)`**                             | ✅     | `chunk(size: number): ArrayGuardian<T[]>`       | Bulk-import workflows.                                                                                                                     |
| **`sum()` / `average()` / `min()` / `max()`** | ✅     | `(this: ArrayGuardian<number>): NumberGuardian` | Crosses into `NumberGuardian` so post-aggregation validators chain naturally. `this`-type bound rejects non-number arrays at compile time. |
| **`reduce<U>(fn, initial)`**                  | ✅     | `reduce<U>(fn, initial): BaseGuardian<U>`       | General reduction.                                                                                                                         |

---

## ObjectGuardian

Strong feature set: strict/strip/passthrough/hasKeys/forbiddenKeys/
extend/pick/omit/partial/required/property/transform/refine/superRefine.

| Method                      | Status | Signature                                                             | Notes                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | ------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ★ **`merge(other)`**        | ✅     | `merge<U>(other: ObjectGuardian<U>): ObjectGuardian<TInput & U>`      | Combines schemas; **other wins on key collision** (advertises overwrite in its name; `extend` has the same runtime semantics but is named for adding fields).                                                                                                                                                                                                                     |
| ★ **`deepPartial()`**       | ✅     |                                                                       | Recursive `partial()` — nested `ObjectGuardian` children also become partial.                                                                                                                                                                                                                                                                                                     |
| ★ **`keyOf()`**             | ✅     | `keyOf(): EnumGuardian<keyof TInput & string>`                        | Mirrors TS's `keyof`; useful for sort-column / discriminator fields.                                                                                                                                                                                                                                                                                                              |
| **`exclude(other)`**        | ✅     |                                                                       | Inverse of `extend` — strips fields present in `other`.                                                                                                                                                                                                                                                                                                                           |
| **`renameField(from, to)`** | ✅     |                                                                       | Renames a single field; remaps at parse time.                                                                                                                                                                                                                                                                                                                                     |
| **`shape` getter**          | ✅     |                                                                       | Read-only alias for `schema`; reads more naturally (`User.shape.email`).                                                                                                                                                                                                                                                                                                          |
| **`brand<B>()`**            | ✅     |                                                                       | Lives on `BaseGuardian` — available on every guardian, not just Object.                                                                                                                                                                                                                                                                                                           |
| **`catchall(g)`**           | ✅     | `catchall<U>(g): ObjectGuardian<TInput, TOutput & Record<string, U>>` | Fourth mode between `strip` and `passthrough` — extras are kept _and_ validated against `g`. Implemented as a fourth `_mode` variant ('catchall'); last-mode-wins (`.catchall(g).strict()` ends in strict). Failures aggregate alongside known-field failures in one `Object validation failed` envelope. `additionalProperties` emit carries the catchall guardian's own schema. |

---

## RecordGuardian

| Method                             | Status | Signature                 | Notes                                                           |
| ---------------------------------- | ------ | ------------------------- | --------------------------------------------------------------- |
| **`forbiddenKeyPattern(pattern)`** | ✅     |                           | Regex-matched key denylist.                                     |
| **`valueRefinement(fn, message)`** | ✅     | `(value, key) => boolean` | Sugar over `refine` — per-value check rather than whole-record. |

---

## TupleGuardian

| Method              | Status | Signature                                              | Notes                                                                                                                                           |
| ------------------- | ------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| ★ **`rest(g)`**     | ✅     | `rest<U>(g: FinishedGuardian<U>): TupleGuardian<T, U>` | Variadic tail. Resulting type is `[...T, ...U[]]`; OpenAPI / JSON-Schema emit updated to use `additionalItems` / `items` for the variadic tail. |
| **`labels(names)`** | ✅     |                                                        | Positional labels for richer error messages (`'Tuple element ''y'' (index 1): …'`).                                                             |

---

## BigIntGuardian

Already very feature-rich (prime, bitLength, math ops). The only common gaps:

| Method           | Status                                                      | Signature | Notes                                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`uint(bits)`** | ✅                                                          |           | Unsigned N-bit range.                                                                                                                                                      |
| **`int(bits)`**  | ✅                                                          |           | Signed N-bit two's-complement range.                                                                                                                                       |
| **`fromHex()`**  | ✅ — landed on **`StringGuardian.toBigInt({ hex: true })`** |           | Input is a string, output is a bigint, so it naturally lives on the input-type guardian alongside `toNumber` / `toInt` / `toDate`. Accepts both `0x`-prefixed and raw hex. |

---

## BooleanGuardian

| Method              | Status    | Signature | Notes                                                                                         |
| ------------------- | --------- | --------- | --------------------------------------------------------------------------------------------- |
| **`mustBe(value)`** | ⏭ skipped |           | Redundant with `BaseGuardian.equals(value)` plus the existing `.true()` / `.false()` methods. |

---

## New top-level Guardian factory methods

| Factory                                    | Status       | Notes                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ★ **`Guardian.lazy(() => schema)`**        | ✅           | New `LazyGuardian` defers thunk resolution to parse time + caches. Recursive schema emit returns `{ $ref: '#' }` on cycle detection.                                                                                                                                                                                                     |
| ★ **`Guardian.intersection(a, b)`**        | ✅           | Runs both, merges with `b` winning on key conflict (matches `merge` / `extend`). Emits `allOf: [a, b]` on schema serialisation.                                                                                                                                                                                                          |
| ★ **`Guardian.preprocess(fn, schema)`**    | ✅           | Pre-validation transform. Static factory (not a chain method) so the data flow reads left-to-right. Async `fn` detected via `AsyncFunction.name`. `.optional()` chained on the result short-circuits **before** `fn` runs — matches existing finisher semantics. Schema emit delegates to the inner schema (preprocess is runtime-only). |
| **`Guardian.set(elementSchema)`**          | ✅           | New `SetGuardian`. Coerces arrays → `Set` at the boundary (JSON has no `Set` type). Schema emit: `type: 'array', uniqueItems: true`.                                                                                                                                                                                                     |
| **`Guardian.map(keySchema, valueSchema)`** | ✅           | New `MapGuardian`. Accepts native `Map`, `Array<[K, V]>`, or plain object (string keys). Schema emit: array of `[K, V]` tuples. Distinct from `Guardian.record`.                                                                                                                                                                         |
| **`Guardian.instanceof(Ctor)`**            | ✅           | `x instanceof Ctor` check. Returns the instance unchanged. Schema emit: `{ type: 'object', className }` placeholder (not expressible in JSON Schema).                                                                                                                                                                                    |
| **`Guardian.never()`**                     | ✅           | Always rejects. Schema emit: `{ not: {} }`. Useful as a discriminated-union default branch or unreachable marker.                                                                                                                                                                                                                        |
| **`Guardian.nan()`**                       | ⏭ skipped    | Too niche; `Guardian.number().test(Number.isNaN)` covers the rare cases.                                                                                                                                                                                                                                                                 |
| **`Guardian.symbol()`**                    | ⏭ skipped    | Symbols aren't data — don't survive JSON / IPC.                                                                                                                                                                                                                                                                                          |
| **`Guardian.function(args?, returns?)`**   | ⏭ skipped    | Type signature implies validation that can't happen at runtime; use `.test(v => typeof v === 'function')` if needed.                                                                                                                                                                                                                     |
| **`Guardian.recursive(name, builder)`**    | 🟡 follow-up | Named-ref variant of `lazy` for clean schema emit. Defer until someone actually hits the `$ref: '#'` limitation.                                                                                                                                                                                                                         |

---

## Cross-cutting follow-ups

1. **`Guardian.fromJsonSchema(schema)`** 🟡 deferred — reverse of `toJSONSchema()`. Big feature (JSON Schema spec is wide); ship as its own package when a real consumer drives it.
2. **`Guardian.fromOpenAPI(spec, path)`** 🟡 deferred — same as #1, mostly shares implementation.
3. **Async refinements on every guardian** 🟡 next discussion — currently object/record-only.
4. **Path-tagged errors out of the box** ✅ — `GuardianError` now carries a structured `path` array. Composite guardians (Object / Array / Tuple / Record / Set / Map / catchall) prepend their key/index as errors bubble up. `error.leafErrors()` iterates over leaves with absolute paths, ready for form/API consumption. As a side-effect, fixed a latent closure-binding bug in `TupleGuardian.labels()` where the label list set on the cloned instance wasn't visible to the source's bound transform.

---

## id package — ID generation helpers (separate work)

`StringGuardian.ulid()` / `.cuid()` / `.cuid2()` **validate** these IDs.
Generators shipped in `packages/id/`:

- ✅ `id.ulid()` / `id.monotonicUlid()` — pre-existed; 26-char Crockford base32.
- ✅ `id.cuid()` — 25 chars, `c`-prefixed, timestamp + counter + fingerprint + random.
- ✅ `id.cuid2(length?)` — cryptographically secure, configurable length (24..32, default 24).

The generators produce output matching the guardian validator patterns, so
round-tripping (generate → validate) is verified by their respective test
suites.

---

## Removal candidates (consistency cleanup)

- ✅ **`BaseGuardian` setters** removed.

(No further removals queued.)
