# Errors

How `@tundralibs/norm` reports failures — the `NormError` hierarchy and
the stable `NormErrorCode` strings its surfaces raise. Every code is a
frozen string you can branch on, so error handling never depends on
parsing a message.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [The hierarchy](#the-hierarchy)
- [Error classes](#error-classes)
- [Reading a code](#reading-a-code)
- [Query surface codes](#query-surface-codes)
- [Crypto codes](#crypto-codes)
- [Instance and configuration codes](#instance-and-configuration-codes)
- [Definition and registry codes](#definition-and-registry-codes)
- [Migration codes](#migration-codes)
- [Handling errors](#handling-errors)
- [Guarantees and caveats](#guarantees-and-caveats)
- [Related documentation](#related-documentation)

## The hierarchy

Every error NORM throws extends `NormError`, which extends `BaseError`
from `@tundralibs/utils`. That shared base supplies the typed `context`,
the `cause` chain, and JSON serialization; `NormError` adds the `code`
getter that reads `context.code`.

```
BaseError                    (@tundralibs/utils — context, cause, toJSON)
└─ NormError                 (adds .code; catch to match any norm error)
   ├─ NormQueryError         (caller-side misuse of the query surface)
   ├─ NormCryptoError        (encrypt/decrypt failures, missing secret)
   ├─ NormDefinitionError    (invalid entity/schema/registry definitions)
   ├─ NormMigrationError     (migration refusals and drift)
   ├─ NormAdvisoryLockError  (server-side advisory lock not acquired)
   ├─ NormValidationError    (write payload failed the Guardian)
   ├─ NormHookError          (a lifecycle hook threw)
   └─ NormUnsupportedError   (engine lacks the requested capability)
```

The class tells you the **category**; the code tells you the **exact**
failure. Catch on the class when the whole category gets one reaction
(a `NormValidationError` is a 400), and read the code when one call can
fail several ways that deserve different handling.

Classes and codes come from the `errors` sub-path:

```typescript
import { NormMigrationError, NormQueryError } from '@tundralibs/norm/errors';
import type { NormErrorCode } from '@tundralibs/norm/errors';

const isQueryFailure = (e: unknown): e is NormQueryError =>
  e instanceof NormQueryError;
const isMigrationFailure = (e: unknown): e is NormMigrationError =>
  e instanceof NormMigrationError;
const RETRYABLE: ReadonlySet<NormErrorCode> = new Set(['LOCK_TIMEOUT']);
```

The root barrel (`@tundralibs/norm`, and `@tundralibs/norm/core`)
re-exports most of them for convenience, but **not**
`NormMigrationError` — reach for `@tundralibs/norm/errors` when you
handle migration failures.

## Error classes

| Class                   | Thrown by                                                                                                                                                                                                                                                            | Carries a code                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `NormError`             | The instance/configuration surface — `new Norm({...})`, dialect resolution, `runtimeOf()`. Also the base class.                                                                                                                                                      | Yes — the four instance codes.                        |
| `NormQueryError`        | The read/write surface, **before** any engine call: filters, projections, aggregates, upserts, scopes.                                                                                                                                                               | Yes — all nine query-surface codes.                   |
| `NormCryptoError`       | The crypto path — a cell that would not decrypt/decode, or a request needing a `secret` that was never configured.                                                                                                                                                   | Only for `MISSING_SECRET`; read-path failures do not. |
| `NormDefinitionError`   | `Entity()` / `Schema()` / `use()` and the compile pass. Aggregates every finding on `context.issues`.                                                                                                                                                                | Yes — the five definition codes.                      |
| `NormMigrationError`    | The `Migrator` — drift, blocked drops, plan mismatches, lock contention, refused rewrites.                                                                                                                                                                           | Yes — the migration codes, plus `MISSING_SECRET`.     |
| `NormAdvisoryLockError` | The executor seam when `pg_advisory_lock` / `GET_LOCK` times out. The migrator remaps it to a `NormMigrationError`.                                                                                                                                                  | Always `LOCK_TIMEOUT` (set by the constructor).       |
| `NormValidationError`   | The write path when an insert/update/upsert payload fails the column-derived Guardian. Detail on `context.issues`.                                                                                                                                                   | No — branch on the class.                             |
| `NormHookError`         | The accessor pipeline when a model's `beforeInsert` / `beforeUpdate` / `beforeDelete` / `afterRead` hook throws.                                                                                                                                                     | No — `context.model` and `context.hook` identify it.  |
| `NormUnsupportedError`  | Eagerly, when the configured engine lacks a capability (`db.transaction()` on MongoDB), or the entity's own shape forbids the call (`update()`/`upsert()`/`delete()`/`truncate()` on a `temporal` entity — insert-only on every engine). `context.feature` names it. | No — branch on the class.                             |

## Reading a code

`code` is a getter on `NormError`, so it is available on every subclass:

```typescript
import { NormError } from '@tundralibs/norm/errors';

function describe(err: unknown): string {
  if (!(err instanceof NormError)) return 'not a norm error';
  // `code` is `NormErrorCode | undefined` — narrow before using it.
  return err.code ?? 'no code on this throw site';
}
```

There are **30** codes in the `NormErrorCode` union, grouped below by
the surface that raises them.

## Query surface codes

Nine codes, all carried by `NormQueryError` and all raised **before**
the engine is touched — they describe a shape the repository cannot
execute, never a database failure. Two of the nine (`TEMPORAL_PAST`,
`TEMPORAL_OVERLAP`) apply only to a `temporal` entity's `insert()`.

| Code                    | Raised when                                                                                                                                                                                                                                                         | What to do                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UNKNOWN_ENTITY`        | `db.repo(key)` or `db.query({ entity })` names a registry key no composed schema provides.                                                                                                                                                                          | Compose the schema that declares it (`norm.use(...)`), or fix the key. Treat as a programming error, not user input.                                                     |
| `NON_FILTERABLE_COLUMN` | A filter, `orderBy`, or column reference targets a column marked `unfilterable()` (implied by `encrypt()`) — locally or through a relation — or a hashed column got a non-plaintext value, a column-to-column compare, or a non-equality operator.                  | Filter the plaintext `.hash()` sibling instead of the ciphertext, and keep hashed-column filters to `$eq` / `$ne` / `$in` / `$nin` / `$null` with plaintext (or `null`). |
| `AGGREGATE_MISUSE`      | An `aggregate` request is malformed (unknown fn, non-local column, alias collision) or combined with something incompatible — `total: true`, relation projections, mask columns, or an encrypted column.                                                            | Group over plain, physical, local columns; drop `total` (a grouped query's total is its row count) and read relations in a separate query.                               |
| `UPSERT_CONFLICT_KEY`   | A `conflictKeys` / `updateOnConflict` entry is a virtual mask, an encrypted (nondeterministic) column, or a batch that mixes rows with and without a column whose hash sibling must stay in sync.                                                                   | Point the conflict key at a plain column or the encrypted column's `.hash()` sibling; split batches so every row carries the same columns.                               |
| `SCOPE_VIOLATION`       | A `db.scope(...)` spec is invalid (a key that is not a single `@column`, or a value that is not an equality primitive), a scoped write would move a row out of its scope, a scoped upsert would adopt an outside row, or `truncate()` is called on a scoped handle. | Fix the scope spec, or drop the offending column from the payload and let the scope fill it. Use `delete({})` instead of `truncate()` on a scoped handle.                |
| `INVALID_PROJECTION`    | A projection key does not start with `@`, sub-projects a non-relation, names an unknown target, selects only relations, or asks for `total: true` on a filter that cannot be counted.                                                                               | Correct the projection; include at least one local column when projecting relations.                                                                                     |
| `UNKNOWN_RELATION`      | A relation alias in a filter, `orderBy`, or projection resolves to neither a foreign key nor a reverse relation.                                                                                                                                                    | Use a declared FK alias or the reverse name (`reverseAs`, or the derived default) on that entity.                                                                        |
| `TEMPORAL_PAST`         | A `temporal` entity's `insert({ EffectiveFrom })` supplied a value that doesn't parse, or is in the past beyond a small clock-skew tolerance — history is immutable.                                                                                                | Omit `EffectiveFrom` (norm stamps "now") or pass a value at/after now. See [Temporal](NORM-Temporal.md).                                                                 |
| `TEMPORAL_OVERLAP`      | A `temporal` entity's `insert({ EffectiveFrom })` falls at or before the currently active version's own `EffectiveFrom` — a new version must start strictly after the one it supersedes.                                                                            | Pass a later `EffectiveFrom`, or omit it to use "now". See [Temporal](NORM-Temporal.md).                                                                                 |

Two refusals reuse an existing code rather than getting one of their
own, which is easy to miss: ordering by — or supplying a filter **value**
from — an unprojected to-many relation raises `INVALID_PROJECTION` (an
unprojected to-many runs as an `EXISTS` subquery, so project it or move
the condition to key position); and a scoped upsert whose scope column is
encrypted with no `.hash()` sibling raises `SCOPE_VIOLATION`.

## Crypto codes

| Code             | Carried by                              | Raised when                                                                                                                                                                                             | What to do                                                                                                                      |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `MISSING_SECRET` | `NormCryptoError`, `NormMigrationError` | Encryption or decryption was requested but `new Norm({ secret })` was never given one — on a repo read/write, on the instance-level helpers, or when a migration rebuild has to rewrite encrypted data. | Supply `secret`. The migration variant (`NormMigrationError`) means a table rebuild would have silently dropped encrypted data. |

Read-path decrypt/decode failures use the **same** class but carry no
code: `context.reason` is `'decrypt'` (bad auth tag, wrong key) or
`'decode'` (malformed plaintext), with the underlying error on `cause`.
They surface as a thrown `NormCryptoError` only under
`onDecryptFailure: 'throw'`; the default policy degrades the cell to
`null` and emits a `decryptError` event instead.

## Instance and configuration codes

All four are thrown as a plain `NormError`.

| Code                    | Raised when                                                                                                                                                                                                                             | What to do                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_HANDLE`        | A value passed where a `NormDb` handle was expected is not one — `runtimeOf()` and the migration seam.                                                                                                                                  | Pass the value `norm.use(...)` returned, not the `Norm` instance and not a repo.                                                        |
| `INVALID_ENGINE_CONFIG` | `new Norm({...})` got both `engine` and `database`, neither, or a `database.dialect` NORM does not know.                                                                                                                                | Pass exactly one of `engine` / `database`, and a supported dialect.                                                                     |
| `ENGINE_NOT_REGISTERED` | `database.dialect` names a known dialect whose engine module was never imported (`context.dialect` names it).                                                                                                                           | Import `@tundralibs/norm/engines/<dialect>` — or the root `@tundralibs/norm` barrel, which registers all of them — before constructing. |
| `INVALID_CACHE_CONFIG`  | An entity declares `cache: <minutes>` and also declares `.encrypt()` columns, on a cache engine other than the in-process `MEMORY` one — an external cache must never hold decrypted plaintext at rest. Raised at `norm.use(...)` time. | Cache that entity only on the `MEMORY` cache engine, or drop `cache` from it. See [Caching](NORM-Caching.md).                           |

`ENGINE_NOT_REGISTERED` is the one you meet most often on `sqlite` — the
root barrel deliberately does not register it eagerly (a native binding
on every runtime would make the barrel unbundlable for everyone else),
so a bare `@tundralibs/norm` import still needs its own
`import '@tundralibs/norm/engines/sqlite'` before constructing. It's
also what you meet on an edge runtime if you import
`@tundralibs/norm/core` without registering the engine you asked for —
see **[Choosing an entry point](../README.md#choosing-an-entry-point)**.

## Definition and registry codes

All five are carried by `NormDefinitionError`, whose `context.issues`
array holds one `{ model, path, message }` entry per finding. The code
identifies the **first** structural violation that stopped the pass;
`issues` is where the detail lives.

| Code                | Raised when                                                                                                                    | What to do                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `DUPLICATE_ENTITY`  | Two registry keys map to the same qualified database object, or a key is provided by more than one composed schema.            | Rename one entity (or its `dbSchema`), or stop composing the duplicate schema.                       |
| `UNRESOLVED_FK`     | A foreign key references an entity key that is not registered.                                                                 | Compose the schema that provides the target, or fix the `model` on the FK.                           |
| `INVALID_FK`        | A foreign key's target column does not exist, or the join runs over an encrypted column.                                       | Point at a real column; never join over `encrypt()` — IV-randomized ciphertexts never compare equal. |
| `REVERSE_COLLISION` | A reverse-relation name (explicit `reverseAs` or the derived default) collides with a column, an FK alias, or another reverse. | Set an explicit `reverseAs` on the offending foreign key.                                            |
| `TERMINAL_JOIN`     | A foreign key targets a `QUERY` entity, or a stored `SELECT` reads from / joins one. `QUERY` entities are terminal.            | Reference a `TABLE` or `VIEW` instead.                                                               |

## Migration codes

Carried by `NormMigrationError`, thrown by the `Migrator`. Most are
refusals — the migrator stops rather than desync the database from the
snapshot chain.

| Code                     | Raised when                                                                                                                                      | What to do                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `DRIFT`                  | The applied head no longer matches its recorded snapshot hash — the snapshot file was edited or deleted after it was applied.                    | Restore the snapshot from version control. Never "fix" drift by editing an applied snapshot.                          |
| `BLOCKED_DROPS`          | `apply()` would DROP a table or column and `allowDrop` is not set. `context.dir` is set; the blocked list is in the message.                     | Pass `allowDrop: true` once you have reviewed the list, or add `renamedFrom` hints if these are renames.              |
| `PLAN_HASH_MISMATCH`     | A reviewed `.sql` plan artifact's hash no longer matches the plan `apply()` would execute.                                                       | Re-run `renderPlans()`, get the new diff reviewed, then apply. Production must execute exactly what was reviewed.     |
| `PLAN_CHANGED`           | A version left a partial-apply checkpoint (engines without transactional DDL), but its plan hash has since changed.                              | Reconcile the schema by hand, then delete the checkpoint row from the progress table. Resuming would skip statements. |
| `MISSING_ARTIFACT`       | Reserved for a missing reviewed `.sql` plan artifact. **No throw site raises it today** — see [Guarantees and caveats](#guarantees-and-caveats). | Nothing; do not write a handler that expects it.                                                                      |
| `MISSING_SNAPSHOT`       | A versioned snapshot file is missing or unreadable — the applied head is absent from the directory, or a rollback target's file is gone.         | Restore the file. Pending diffs would otherwise baseline against the wrong version.                                   |
| `LOCK_TIMEOUT`           | A migration lock could not be taken in time — the on-disk `migrator.lock`, or the server-side advisory lock another deploy holds.                | Wait and retry; this is the one code that is genuinely transient. Check whether a deploy is running elsewhere.        |
| `INVALID_ROLLBACK`       | A `rollback({ to })` target is not below the applied head.                                                                                       | Pass a version lower than the current head (or omit `to` to step back one).                                           |
| `DIGEST_IMMUTABLE`       | A one-way digest column's algorithm changed. There is no plaintext to re-digest.                                                                 | Add a new column and backfill it from source data; do not try to migrate the digest in place.                         |
| `REBUILD_COUNT_MISMATCH` | A table rebuild copied a different row count than the original held. `context.subject` is the entity key.                                        | Do not retry blindly — the original table is preserved as `<name>__pre_migrate`. Investigate before dropping it.      |
| `UNSUPPORTED_RENAME`     | An unsupported rename was requested — `renamedFrom` on a `VIEW`.                                                                                 | Drop and recreate the view; there is no data at stake.                                                                |

`NormAdvisoryLockError` is what the **executor** throws when a
server-side lock times out; only the migrator wraps it into a
`LOCK_TIMEOUT` `NormMigrationError`. If you call
`executor.withAdvisoryLock` yourself, catch `NormAdvisoryLockError` —
it carries `context.key` and `context.timeoutMs`, and its constructor
always sets `code: 'LOCK_TIMEOUT'`.

## Handling errors

Branch on the class when the whole category maps to one reaction, and
on the code when one call fails several ways:

```typescript
import {
  Column,
  Entity,
  Norm,
  NormCryptoError,
  NormError,
  NormQueryError,
  NormValidationError,
  Schema,
} from '@tundralibs/norm';

const App = Schema('App', {
  Users: Entity('users', {
    id: Column.integer(),
    email: Column.varchar(255),
  }, { pk: ['id'] }),
});

const norm = new Norm({ database: { dialect: 'sqlite', path: './data' } });
const db = norm.use(App);

async function createUser(email: string): Promise<number> {
  try {
    await db.repo('Users').insert([{ id: 1, email }]);
    return 201;
  } catch (err) {
    // A whole category, one reaction: a bad payload is a 400.
    if (err instanceof NormValidationError) return 400;
    // One call, several failure modes: switch on the stable code.
    if (err instanceof NormQueryError) {
      switch (err.code) {
        case 'SCOPE_VIOLATION':
          return 403; // the write would leave the active scope
        case 'UPSERT_CONFLICT_KEY':
        case 'INVALID_PROJECTION':
        case 'UNKNOWN_ENTITY':
          throw err; // caller bug — fix the query, do not retry
      }
    }
    if (err instanceof NormCryptoError && err.code === 'MISSING_SECRET') {
      throw err; // configuration bug — `new Norm({ secret })` was skipped
    }
    // Anything else that is still ours: log the code and context.
    if (err instanceof NormError) {
      console.error(err.code ?? 'UNCODED', err.context);
    }
    throw err;
  }
}
```

Migration failures are worth a dedicated map, because most of them are
operator-facing and only one is retryable:

```typescript
import { NormMigrationError } from '@tundralibs/norm/errors';

/** Turn a migration failure into an exit code: 75 = retry later. */
export function migrationExitCode(err: unknown): number {
  if (!(err instanceof NormMigrationError)) return 70;
  switch (err.code) {
    case 'LOCK_TIMEOUT':
      return 75; // transient — another deploy holds the lock
    case 'DRIFT':
    case 'MISSING_SNAPSHOT':
    case 'PLAN_HASH_MISMATCH':
    case 'PLAN_CHANGED':
      return 78; // the migration directory needs a human
    case 'BLOCKED_DROPS':
      return 77; // re-run with allowDrop once reviewed
    default:
      return 70;
  }
}
```

Because `NormError` extends `BaseError`, every instance also carries the
shared contract — useful for structured logging:

```typescript
import { NormError } from '@tundralibs/norm/errors';

export function toLogPayload(err: NormError): Record<string, unknown> {
  return {
    code: err.code, // stable NormErrorCode, or undefined
    name: err.name, // the concrete class name
    context: err.context, // typed metadata for this class
    cause: err.cause, // the wrapped upstream error, when chained
    json: JSON.stringify(err), // BaseError.toJSON()
  };
}
```

## Guarantees and caveats

**Codes are additive.** New codes may be appended to `NormErrorCode`;
existing ones are never renamed or repurposed once shipped. A `switch`
over codes should therefore always keep a `default`.

**`code` is optional at every throw site.** On every code-carrying meta
type — `QueryErrorMeta`, `CryptoErrorMeta`, `DefinitionErrorMeta`,
`MigrationErrorMeta` — the field is declared `code?`, and `NormError.code`
returns `NormErrorCode | undefined`. Every throw site listed above does
set one, but nothing in the type system enforces it, and NORM throws
some errors with no code at all (crypto read-path failures,
`NormValidationError`, `NormHookError`, `NormUnsupportedError`). Narrow
before you branch, and always keep a fallback path for `undefined`.

`MigrationErrorMeta` goes furthest: **every** field on it is optional
(`dir?`, `version?`, `subject?`, `code?`), and `NormMigrationError`'s
constructor defaults the whole meta to `{}`. Treat everything on a
migration error's `context` as possibly absent.

**`MISSING_ARTIFACT` is declared but never thrown.** A missing `.sql`
plan artifact is not an error: SQL plans are opt-in (`renderPlans()`),
and `apply()` simply executes the freshly-computed plan when no stored
artifact exists — the review gate is active only once the artifacts are
on disk. A tampered artifact raises `PLAN_HASH_MISMATCH` instead. Do not
write a handler that waits for `MISSING_ARTIFACT`.

**A code can be shared across classes.** `MISSING_SECRET` is raised as
both a `NormCryptoError` (query surface) and a `NormMigrationError`
(rebuild path), and `LOCK_TIMEOUT` appears on both
`NormAdvisoryLockError` and `NormMigrationError`. Match on the class as
well as the code when the reaction differs.

## Related documentation

- **[Querying](./NORM-Querying.md)** — the filters, projections, and
  aggregates that raise the query-surface codes.
- **[Scoping](./NORM-Scoping.md)** — where `SCOPE_VIOLATION` comes from.
- **[Security](./NORM-Security.md)** — encryption, digests, and the
  `onDecryptFailure` policy behind `NormCryptoError`.
- **[Migrations](./NORM-Migrations.md)** — the `Migrator` workflow the
  migration codes police.
- **[Schema definition](./NORM-Schema.md)** — the declarations validated
  into `NormDefinitionError`.
- **[Temporal](./NORM-Temporal.md)** — where `TEMPORAL_PAST` and
  `TEMPORAL_OVERLAP` come from.
- **[Caching](./NORM-Caching.md)** — where `INVALID_CACHE_CONFIG` comes
  from.

---

[← Back to NORM](../README.md)
