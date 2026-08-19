# Validators

Per-type guardian reference. Every validator listed here is a method on the relevant guardian type and returns the same guardian for chaining.

## Table of Contents

- [Coercion rules](#coercion-rules)
- [`Guardian.string()`](#guardianstring)
- [`Guardian.number()`](#guardiannumber)
- [`Guardian.boolean()`](#guardianboolean)
- [`Guardian.date()`](#guardiandate)
- [`Guardian.bigint()`](#guardianbigint)
- [`Guardian.enum([...])` / `Guardian.literal(v)`](#guardianenum--guardianliteral)
- [`Guardian.unknown()`](#guardianunknown)

## Coercion rules

The five primitive guardians (`string`, `number`, `boolean`, `date`, `bigint`) coerce inputs to their declared type **by default**. This matches their typical use at API / DB boundaries, where inputs arrive as strings even when the schema is typed otherwise.

| Guardian             | Accepts (in addition to the declared type)                                                                                                  | Rejects                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `Guardian.string()`  | `number` (finite), `bigint`, `boolean` (`'true'`/`'false'`), valid `Date` (ISO 8601)                                                        | `null`, `undefined`, objects, arrays, NaN                                        |
| `Guardian.number()`  | numeric strings (`'42'`, `'3.14'`), `bigint`, `boolean` (`true`→1, `false`→0), valid `Date` (epoch ms)                                      | `null`, `undefined`, non-numeric strings, NaN inputs, objects                    |
| `Guardian.boolean()` | `'true' \| 'yes' \| 'y' \| 'on' \| '1'` → `true`<br>`'false' \| 'no' \| 'n' \| 'off' \| '0' \| ''` → `false`<br>`1` → `true`, `0` → `false` | strings outside that list (no silent truthification of `'maybe'`), other numbers |
| `Guardian.date()`    | parseable strings, ms timestamps (`number` or `bigint`)                                                                                     | `null`, `undefined`, `boolean`, invalid date strings                             |
| `Guardian.bigint()`  | integer numbers, integer strings, `boolean`                                                                                                 | non-integer numbers (no silent truncation), garbage strings                      |

`null` and `undefined` are **never** coerced — chain `.nullable()` / `.optional()` if you want to accept them.

Coerce-by-default is right for the input-parsing case above, but wrong when you're validating a _response_ — a vendor API returning `age: "42"` where the contract promises a number is a schema violation you want to catch, not silently accept. `Guardian.number()` and `Guardian.boolean()` expose `.strict()` for that case: it requires the input's runtime `typeof` to already match, rejecting the value instead of coercing it. `.strict()` composes correctly no matter where it's called in the chain:

```typescript
import { Guardian } from '@tundralibs/guardian';

const StrictAge = Guardian.number().strict().min(0);
StrictAge.parse(42); // 42
StrictAge.parse('42'); // throws — no coercion in strict mode

const StrictFlag = Guardian.boolean().strict();
StrictFlag.parse(true); // true
StrictFlag.parse('true'); // throws
```

For the other primitives (`string`, `date`, `bigint`), opt out of coercion by chaining a `.test()` with your own typeof check, or by writing a `Guardian.unknown().process(...)` pipeline by hand.

## `Guardian.string()`

```typescript
import { Guardian } from '@tundralibs/guardian';

const Name = Guardian.string().minLength(1).maxLength(50);
Name.parse('Ada'); // 'Ada'
Name.parse(42); // '42'  ← coerced
```

### Length

| Method                                | Behaviour                                                         |
| ------------------------------------- | ----------------------------------------------------------------- |
| `.minLength(n, msg?)`                 | string length ≥ n                                                 |
| `.maxLength(n, msg?)`                 | string length ≤ n                                                 |
| `.length(n, msg?)`                    | exact length                                                      |
| `.notEmpty(msg?)` / `.nonEmpty(msg?)` | non-empty after trimming (`notEmpty` canonical, `nonEmpty` alias) |

### Patterns + presets

| Method                                                    | Behaviour                                                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `.pattern(re, msg?)`                                      | input matches regex                                                                                                          |
| `.email(msg?)`                                            | matches RFC 5322-ish email shape                                                                                             |
| `.url(msg?)`                                              | matches HTTP/HTTPS URL                                                                                                       |
| `.uuid(msg?)` / `.uuidv4(msg?)` / `.uuidv1(msg?)`         | UUID by version                                                                                                              |
| `.ulid(msg?)`                                             | 26-char ULID (Crockford base32)                                                                                              |
| `.cuid(msg?)` / `.cuid2(msg?)`                            | Cuid v1 (`c` + 24 base36) / Cuid2 (cryptographically random, 24–32 chars)                                                    |
| `.alpha(msg?)` / `.alphanumeric(msg?)` / `.numeric(msg?)` | ASCII letter / letter-digit / digit-only (`.numeric` = unsigned `/^\d+$/`)                                                   |
| `.integer(msg?)`                                          | signed integer literal `/^[+-]?\d+$/` (no decimal, no `n`)                                                                   |
| `.bigint(msg?)`                                           | signed integer with an optional trailing `n` — `/^[+-]?\d+n?$/`, accepts `234` and `234n`; pairs with `.toBigInt()`          |
| `.ipv4(msg?)` / `.ipv6(msg?)`                             | IP address                                                                                                                   |
| `.phone(msg?)`                                            | North American phone shape                                                                                                   |
| `.macAddress(msg?)`                                       | MAC address                                                                                                                  |
| `.creditCard(type?, msg?)`                                | credit card pattern; `type` is `'visa' \| 'mastercard' \| 'amex' \| 'any'` (default `'any'`)                                 |
| `.hexColor(msg?)`                                         | `#RRGGBB` or `#RGB`                                                                                                          |
| `.slug(msg?)`                                             | URL-safe slug                                                                                                                |
| `.domain(msg?)`                                           | domain name                                                                                                                  |
| `.ascii(msg?)` / `.noWhitespace(msg?)`                    | character-class checks                                                                                                       |
| `.emoji({ onlyEmoji?, allowSpaces? }, msg?)`              | input must contain (or consist entirely of) emoji                                                                            |
| `.password(opts?, msg?)`                                  | configurable strength check — `minLength`, `requireUpper`, `requireLower`, `requireDigit`, `requireSymbol`, `disallowSpaces` |

### Encodings + identifiers

| Method                                                               | Behaviour                                                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `.base64(msg?)` / `.base32(msg?)` / `.base58(msg?)`                  | string is valid in the named encoding                                            |
| `.hex(msg?)`                                                         | hex digits only (even length)                                                    |
| `.jwt(msg?)`                                                         | three dot-separated base64url segments                                           |
| `.isbn(msg?)`                                                        | ISBN-10 or ISBN-13 with checksum                                                 |
| `.semver(msg?)`                                                      | semver string per https://semver.org/                                            |
| `.json(msg?)`                                                        | string is valid JSON (does not parse — chain `.toJSON()` for that)               |
| `.mimeType(msg?)`                                                    | `type/subtype` MIME shape                                                        |
| `.countryCode(msg?)` / `.currencyCode(msg?)` / `.languageCode(msg?)` | ISO 3166-1 alpha-2 / ISO 4217 / ISO 639-1                                        |
| `.latLngString(msg?)`                                                | `"lat,lng"` numeric pair within geographic ranges                                |
| `.postalCode(pattern, msg?)`                                         | input matches the caller-supplied postal-code regex (no built-in country tables) |

### Transforms

| Method                              | Behaviour                                                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.trim()`                           | strip leading/trailing whitespace                                                                                                                                                                             |
| `.toLowerCase()` / `.toUpperCase()` | case transform                                                                                                                                                                                                |
| `.toNumber(msg?)`                   | parse as float; returns `NumberGuardian`                                                                                                                                                                      |
| `.toInt(radix?, msg?)`              | parse as integer; returns `NumberGuardian`                                                                                                                                                                    |
| `.toBigInt(opts?, msg?)`            | parse integer string → `BigIntGuardian`; strips a trailing `n` (so a `.bigint()`-valid string converts); `opts.hex` parses hex                                                                                |
| `.toDate(msg?)`                     | parse as Date; returns `DateGuardian`                                                                                                                                                                         |
| `.toBoolean(opts?, msg?)`           | parse as boolean → `BooleanGuardian`; trims + lowercases, then matches truthy `['true','1','yes','y','on','t']` / falsy `['false','0','no','n','off','f']` — override either via `opts.truthy` / `opts.falsy` |
| `.toJSON(msg?)`                     | `JSON.parse(input)`; returns `UnknownGuardian`                                                                                                                                                                |
| `.replace(search, replace)`         | regex replace                                                                                                                                                                                                 |
| `.encodeUri()` / `.decodeUri()`     | `encodeURIComponent` / `decodeURIComponent` round-trip                                                                                                                                                        |

### Example: a username

```typescript
import { Guardian } from '@tundralibs/guardian';

const Username = Guardian.string()
  .trim()
  .toLowerCase()
  .minLength(3, 'username too short')
  .maxLength(20, 'username too long')
  .pattern(
    /^[a-z][a-z0-9_]*$/,
    'username must start with a letter and contain only letters, digits, or underscores',
  );
```

`.pattern(re)` / `.phone(re)` / `.postalCode(re)` accept any `RegExp`. A `g` or `y` (global / sticky) flag is stateful — `re.test()` advances `lastIndex` — which would make the same guardian alternate pass/fail on identical input. Those flags are neutralised for validation, so matching stays deterministic across repeated parses (the flag has no meaning for a whole-string membership check anyway).

## `Guardian.number()`

```typescript
import { Guardian } from '@tundralibs/guardian';

const Age = Guardian.number().integer().min(0).max(120);
Age.parse(42); // 42
Age.parse('42'); // 42  ← coerced
```

### Range

| Method                                                   | Behaviour                               |
| -------------------------------------------------------- | --------------------------------------- |
| `.min(v, msg?)`                                          | input ≥ v                               |
| `.max(v, msg?)`                                          | input ≤ v                               |
| `.range(min, max, msg?)`                                 | both bounds                             |
| `.between(min, max, inclusive?, msg?)`                   | bounds with inclusive/exclusive control |
| `.positive(msg?)` / `.negative(msg?)` / `.nonZero(msg?)` | sign checks                             |

### Type checks

| Method                                                    | Behaviour                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `.integer(msg?)`                                          | `Number.isInteger(input)`                                                                         |
| `.finite(msg?)`                                           | rejects `Infinity` / `-Infinity`                                                                  |
| `.safeInteger(msg?)`                                      | within `Number.MIN_SAFE_INTEGER`…`MAX_SAFE_INTEGER`                                               |
| `.odd(msg?)` / `.even(msg?)` / `.prime(msg?)`             | parity / primality                                                                                |
| `.naturalNumber(msg?)`                                    | positive integer (`> 0`, no fractions)                                                            |
| `.multipleOf(n, msg?)`                                    | `input % n === 0`                                                                                 |
| `.evenlyDivisible(divisors, msg?)`                        | divisible by **every** value in `divisors: number[]`                                              |
| `.power(base?, msg?)`                                     | perfect power (of given base or any base)                                                         |
| `.validPort(msg?)` / `.port(msg?)`                        | 0–65535 integer                                                                                   |
| `.timestamp(msg?)`                                        | valid Unix timestamp (non-negative integer)                                                       |
| `.unixSeconds(msg?)` / `.unixMillis(msg?)`                | timestamp validation at second / millisecond resolution                                           |
| `.fullYear(msg?)`                                         | 4-digit calendar year (1900–9999)                                                                 |
| `.percentage(msg?)` / `.probability(msg?)` / `.bps(msg?)` | `[0,100]` / `[0,1]` / basis-points `[0,10000]` ranges                                             |
| `.bigDecimal(msg?)`                                       | finite number — alias for `.finite()` framed as "numeric value suitable for decimal accounting"   |
| `.latitude(msg?)` / `.longitude(msg?)`                    | geographic ranges                                                                                 |
| `.strict(msg?)`                                           | reject coercion — input must already be `typeof 'number'` (see [Coercion rules](#coercion-rules)) |

### Transforms

| Method                                           | Behaviour                                                      |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `.round()` / `.floor()` / `.ceil()` / `.trunc()` | rounding mode                                                  |
| `.abs()` / `.negate()`                           | absolute / sign flip                                           |
| `.clamp(min, max)`                               | restrict to range (vs `.range()` which throws on out-of-bound) |
| `.toFixed(digits)`                               | round to N decimal places                                      |
| `.toString(radix?)`                              | returns `StringGuardian`                                       |
| `.toBigInt(msg?)`                                | integer → bigint; returns `BigIntGuardian`                     |
| `.toDate(msg?)`                                  | ms timestamp → `DateGuardian`                                  |

### Example: pagination

```typescript
import { Guardian } from '@tundralibs/guardian';

const Page = Guardian.number().integer().min(1);
const Limit = Guardian.number().integer().min(1).max(100);

Page.parse('3'); // 3
Limit.parse('20'); // 20
Limit.parse('200'); // throws — exceeds max
```

## `Guardian.boolean()`

```typescript
import { Guardian } from '@tundralibs/guardian';

const Accepted = Guardian.boolean();
Accepted.parse(true); // true
Accepted.parse('yes'); // true   ← coerced
Accepted.parse('off'); // false  ← coerced
Accepted.parse('maybe'); // throws — outside accepted list
Accepted.parse(42); // throws — only 0/1 accepted
```

### Validators

| Method          | Behaviour                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `.true(msg?)`   | requires `true`                                                                                    |
| `.false(msg?)`  | requires `false`                                                                                   |
| `.strict(msg?)` | reject coercion — input must already be `typeof 'boolean'` (see [Coercion rules](#coercion-rules)) |

### Transforms

| Method        | Behaviour                                         |
| ------------- | ------------------------------------------------- |
| `.toNumber()` | `true` → 1, `false` → 0; returns `NumberGuardian` |
| `.toString()` | `'true'` / `'false'`; returns `StringGuardian`    |
| `.negate()`   | flip the boolean                                  |

### Example: terms-of-service gate

```typescript
import { Guardian } from '@tundralibs/guardian';

const TosAccepted = Guardian.boolean().true('Terms must be accepted');
TosAccepted.parse('yes'); // true
TosAccepted.parse(false); // throws — 'Terms must be accepted'
```

## `Guardian.date()`

```typescript
import { Guardian } from '@tundralibs/guardian';

const Birthday = Guardian.date()
  .min(new Date('1900-01-01'))
  .max(new Date());

Birthday.parse(new Date('1995-05-12')); // Date
Birthday.parse('1995-05-12'); // Date  ← coerced from ISO string
Birthday.parse(802915200000); // Date  ← coerced from epoch ms
```

### Range

| Method                          | Behaviour          |
| ------------------------------- | ------------------ |
| `.min(date, msg?)`              | input ≥ date       |
| `.max(date, msg?)`              | input ≤ date       |
| `.between(min, max, msg?)`      | both bounds        |
| `.past(msg?)` / `.future(msg?)` | before / after now |

### Temporal queries

| Method                                | Behaviour                  |
| ------------------------------------- | -------------------------- |
| `.year(y, msg?)`                      | year equals `y`            |
| `.month(m, msg?)`                     | month equals `m` (0-based) |
| `.dayOfWeek(d, msg?)`                 | day equals `d` (0=Sunday)  |
| `.weekdays(msg?)` / `.weekends(msg?)` | Mon–Fri / Sat–Sun          |

### Transforms

| Method                                 | Behaviour                                          |
| -------------------------------------- | -------------------------------------------------- |
| `.startOf(unit)` / `.endOf(unit)`      | snap to unit boundary                              |
| `.add(n, unit)` / `.subtract(n, unit)` | shift by interval                                  |
| `.toTimestamp()`                       | epoch ms; returns `BaseGuardian<number>`           |
| `.toISOString()`                       | ISO 8601; returns `StringGuardian`                 |
| `.diff(other, unit)`                   | difference in unit; returns `BaseGuardian<number>` |

`unit` is one of `'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'`. `.subtract(n, unit)` is exactly `.add(-n, unit)`. For `.startOf('weeks')` / `.endOf('weeks')`, weeks are **Sunday-started**: `startOf` snaps back to the most recent Sunday at `00:00:00.000`, `endOf` forward to the coming Saturday at `23:59:59.999`. All snap boundaries use local time.

## `Guardian.bigint()`

```typescript
import { Guardian } from '@tundralibs/guardian';

const Big = Guardian.bigint().positive();
Big.parse(42n); // 42n
Big.parse(42); // 42n   ← coerced from integer
Big.parse('42'); // 42n   ← coerced from string
Big.parse(3.14); // throws — non-integer
```

### Range

| Method                                                       | Behaviour                                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `.min(v, msg?)` / `.max(v, msg?)` / `.range(min, max, msg?)` | range checks                                                                            |
| `.positive(msg?)` / `.negative(msg?)` / `.nonZero(msg?)`     | sign                                                                                    |
| `.even(msg?)` / `.odd(msg?)`                                 | parity                                                                                  |
| `.multipleOf(divisor, msg?)`                                 | divisibility                                                                            |
| `.uint(bits, msg?)`                                          | unsigned integer at a given bit width — `0 ≤ x < 2**bits` (e.g. `uint(64)` for u64)     |
| `.int(bits, msg?)`                                           | signed two's-complement integer at a given bit width — `-2**(bits-1) ≤ x < 2**(bits-1)` |

### Transforms

| Method              | Behaviour                                                                        |
| ------------------- | -------------------------------------------------------------------------------- |
| `.toNumber(msg?)`   | bigint → number (throws if outside safe-integer range); returns `NumberGuardian` |
| `.toString(radix?)` | string representation; returns `StringGuardian`                                  |

## `Guardian.enum([...])` / `Guardian.literal(v)`

```typescript
import { Guardian } from '@tundralibs/guardian';

const Role = Guardian.enum(['admin', 'user', 'guest'] as const);
type RoleT = Guardian.infer<typeof Role>; // 'admin' | 'user' | 'guest'

const ApiVersion = Guardian.literal('v1');
// Sugar for: Guardian.enum(['v1'] as const)
```

### Methods

| Method                    | Behaviour                                                                 |
| ------------------------- | ------------------------------------------------------------------------- |
| `.exclude([...], msg?)`   | reject values from a denylist (still must be in the original allowed set) |
| `.caseInsensitive()`      | match input case-insensitively, return canonical case (string enums only) |
| `.allowedValues` (getter) | read the underlying allowed-values array                                  |
| `.map(fn)`                | post-validation transform; returns `BaseGuardian<U>`                      |
| `.toString()`             | coerce to string; returns `StringGuardian`                                |

### Case-insensitive matching

```typescript
import { Guardian } from '@tundralibs/guardian';

const Method = Guardian.enum(['GET', 'POST', 'PUT', 'DELETE'])
  .caseInsensitive();
Method.parse('get'); // 'GET'   ← canonical case returned
Method.parse('Post'); // 'POST'
Method.parse('PATCH'); // throws — not in allowed set
```

Construction throws if any allowed value isn't a string, or if two values lowercase to the same string (`['Foo', 'foo']` is ambiguous).

### Discriminator field

`Guardian.literal(value)` is the idiomatic way to declare a discriminator field for [discriminated unions](Guardian-Schemas.md#discriminated-union):

```typescript
import { Guardian } from '@tundralibs/guardian';

Guardian.object({
  kind: Guardian.literal('circle'),
  radius: Guardian.number(),
});
```

## `Guardian.unknown()`

Type-erased escape hatch. Accepts any input; you provide your own validation via `.process(fn)` or `.test(fn)`.

```typescript
import { Guardian, GuardianError } from '@tundralibs/guardian';

const Json = Guardian.unknown().process((raw) => {
  if (typeof raw !== 'string') {
    throw new GuardianError('Expected JSON string', {
      got: raw,
      comparison: 'type',
    });
  }
  return JSON.parse(raw);
});

const FlexibleId = Guardian.unknown<string | number>().test(
  (v) => typeof v === 'string' || typeof v === 'number',
  'Expected string or number',
);
```

Use this when:

- The input type isn't known until runtime (e.g., a polymorphic field that other guardians can't express).
- You're wrapping a third-party validator and need a placeholder that holds the output type.
- You want to bypass the coerce-by-default behaviour of primitives entirely.

## Modifying any guardian

Every guardian (primitive or composite) inherits these from `BaseGuardian`. The `.refine()`/`.test()`/`.brand()` rows are particularly worth noting — they apply uniformly across primitives **and** composite types (objects, arrays, tuples, records, sets, maps, lazy).

| Method                       | Returns                                                          | Behaviour                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `.parse(input)`              | `T`                                                              | validate and transform, throws on failure                                                                       |
| `.parseAsync(input)`         | `Promise<T>`                                                     | async variant (use when chain has async steps); refuses a thenable-shaped result — use `.parse()` for that data |
| `.safeParse(input)`          | `[GuardianError \| null, T \| undefined]`                        | non-throwing                                                                                                    |
| `.safeParseAsync(input)`     | `Promise<[GuardianError \| null, T \| undefined]>`               | async non-throwing; same thenable restriction as `.parseAsync()`                                                |
| `.optional(default?)`        | `FinishedGuardian<T \| undefined>` or `FinishedGuardian<T \| D>` | accept `undefined`; with default, substitute on `undefined`                                                     |
| `.nullable()`                | `FinishedGuardian<T \| null>`                                    | accept `null`                                                                                                   |
| `.process(fn)`               | `BaseGuardian<U>`                                                | arbitrary input → output transform                                                                              |
| `.test(fn, msg?, expected?)` | `BaseGuardian<T>`                                                | predicate; throws `msg` on false                                                                                |
| `.refine(fn, msg, path?)`    | `BaseGuardian<T>`                                                | predicate with mandatory message; short-circuits on first failure                                               |
| `.superRefine([...])`        | `BaseGuardian<T>`                                                | batch refine; accumulates failures across the array                                                             |
| `.brand<B>()`                | `BaseGuardian<Brand<T, B>>`                                      | attach a nominal brand to the output type — runtime no-op, type-only                                            |
| `.equals(v, msg?)`           | `BaseGuardian<T>`                                                | strict equality                                                                                                 |
| `.notEquals(v, msg?)`        | `BaseGuardian<T>`                                                | strict inequality                                                                                               |
| `.isIn(arr, msg?)`           | `BaseGuardian<T>`                                                | input must be in `arr`                                                                                          |
| `.isNotIn(arr, msg?)`        | `BaseGuardian<T>`                                                | input must NOT be in `arr`                                                                                      |
| `.describe(meta)`            | `this`                                                           | attach doc metadata (title, description, examples, deprecated, …)                                               |
| `.toOpenAPI()`               | `Record<string, unknown>`                                        | emit OpenAPI 3.0 schema                                                                                         |
| `.toJSONSchema()`            | `Record<string, unknown>`                                        | emit JSON Schema Draft 2020-12                                                                                  |
| `.toMarkdown()`              | `string`                                                         | emit Markdown documentation                                                                                     |
| `.clone()`                   | `this`                                                           | explicit copy — every chain method already returns a fresh instance, so `.clone()` is mostly a readability aid  |

The full method list for each guardian is in its TypeScript declaration; this doc covers the methods most users reach for. See JSDoc on the source for the rest.

---

[← Back to Guardian](../README.md)
