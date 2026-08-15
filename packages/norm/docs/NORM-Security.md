# Security

At-rest column encryption, digest siblings, one-way digest columns,
virtual masks, hidden columns, and the crypto override seam — NORM's
flagship security surface. One `secret` on the `Norm` instance drives
every encrypted column on every registered entity; the TypeScript
types never change.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Configuration](#configuration)
- [Column encryption — `.encrypt()`](#column-encryption--encrypt)
  - [The plaintext codec](#the-plaintext-codec)
  - [Per-cell cost](#per-cell-cost)
- [Digest siblings — `.encrypt().hash()`](#digest-siblings--encrypthash)
  - [Why ciphertext can't be filtered](#why-ciphertext-cant-be-filtered)
  - [Filtering, uniqueness, and upsert keys](#filtering-uniqueness-and-upsert-keys)
- [One-way digest columns — `Column.hash()`](#one-way-digest-columns--columnhash)
- [Virtual masks — `Column.mask()`](#virtual-masks--columnmask)
- [Hidden columns — `.hidden()`](#hidden-columns--hidden)
- [Crypto overrides](#crypto-overrides)
- [Migrations and crypto](#migrations-and-crypto)
- [Read-path decrypt failures — `onDecryptFailure`](#read-path-decrypt-failures--ondecryptfailure)
- [Key rotation — `rotateKey()`](#key-rotation--rotatekey)
- [Limitations](#limitations)
- [Related Documentation](#related-documentation)

## Overview

NORM turns column-level cryptography into a declaration. Five builder
markers, all read from one schema:

| Marker                 | What it does                                             | Reversible            | Filterable                          |
| ---------------------- | -------------------------------------------------------- | --------------------- | ----------------------------------- |
| `.encrypt()`           | Ciphertext at rest, plaintext in TS                      | Yes (with the secret) | No (see `.hash()`)                  |
| `.encrypt().hash()`    | Encrypt **and** synthesize a `<col>_hash` digest sibling | Yes                   | Yes — equality only                 |
| `Column.hash(algo)`    | One-way digest column (store only the digest)            | **No**                | Yes — equality only                 |
| `Column.mask(src, fn)` | Virtual, computed-on-read presentation column            | n/a                   | No — never stored                   |
| `.hidden()`            | Excluded from default reads, opt-in projectable          | n/a                   | Yes (unless also `.unfilterable()`) |

Encryption is **per cell**: every encrypted value carries its own
random salt and IV, so two equal plaintexts never produce equal
ciphertext. That is the security property — and the reason equality
filters, uniqueness, joins, and upsert keys need a deterministic
_digest_ rather than the ciphertext itself.

The whole surface is correct-by-construction. `.hash()` exists only
after `.encrypt()`, validators (`pattern` / `lov` / `min` / `max` /
`minLength` / `maxLength`) must chain _before_ `.encrypt()` because
they constrain the plaintext, and `Column.hash(algo)` exposes no
`.encrypt()`. Invalid combinations simply do not type-check.

This page expands the **At-rest encryption** summary in the
[NORM README](../README.md#at-rest-encryption).

## Configuration

The secret and algorithm live on the `Norm` instance, not the schema:

```typescript
import { Norm } from '@tundralibs/norm';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';

const engine = new SQLiteEngine('app', { path: './data' });

const norm = new Norm({
  engine,
  secret: process.env.NORM_SECRET, // required if any column .encrypt()s
  algorithm: 'AES-256-GCM', // optional; this is the default
});

const db = norm.use(/* ...schemas */);
```

| Option             | Type                  | Default                              | Notes                                                                                                                         |
| ------------------ | --------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `secret`           | `string`              | —                                    | Symmetric key material. Keep it out of source; load from an env var or secret store.                                          |
| `algorithm`        | `EncryptAlgorithm`    | `'AES-256-GCM'`                      | Bound per instance, applied to every encrypted column.                                                                        |
| `crypto`           | `CryptoOverrides`     | AES + SHA (from `@tundralibs/crypt`) | Swap the encrypt / decrypt / hash callbacks — see [Crypto overrides](#crypto-overrides).                                      |
| `onDecryptFailure` | `'null'` \| `'throw'` | `'null'`                             | What a read does when a cell won't decrypt — see [Read-path decrypt failures](#read-path-decrypt-failures--ondecryptfailure). |

`EncryptAlgorithm` is any AES key length crossed with a mode:
`AES-{128,192,256}-{GCM,CBC,CTR}`. GCM is authenticated natively;
CBC/CTR are wrapped in encrypt-then-MAC by the default helper.

**Digest algorithms are not instance config.** Encrypt-siblings are
pinned to SHA-256 (`SIBLING_HASH_ALGORITHM`) so the physical
`VARCHAR(64)` never moves, and one-way digest columns carry their
algorithm in the _definition_ (`Column.hash('SHA-512')`).

**No secret, but a column asks to be encrypted?** `norm.use(...)`
throws a `NormDefinitionError` at composition time — the misconfig
never reaches a query.

The instance also exposes crypto helpers for the raw escape hatches:

```typescript ignore
const cipher = await db.encrypt('ada@example.dev'); // this instance's secret + algorithm
const plain = await db.decrypt(cipher); // → 'ada@example.dev'
const digest = await db.hash('ada@example.dev'); // SHA-256 by default — matches siblings
```

`db.hash(plaintext, algorithm?)` defaults to SHA-256 so its output
matches sibling digests; pass an algorithm to match a
`Column.hash(algo)` column instead.

## Column encryption — `.encrypt()`

`.encrypt()` works on **every** value kind — string, number, bigint,
date, boolean, JSON. The logical TypeScript type is unchanged; only
the physical storage becomes ciphertext (migrated to `TEXT`).

```typescript
import { Column, Entity } from '@tundralibs/norm';

const Profiles = Entity('profiles', {
  userId: Column.uuid(),
  bio: Column.text().nullable(),
  birthday: Column.timestamp().encrypt().nullable(), // Date in TS, TEXT at rest
  website: Column.varchar(255).nullable(),
}, { pk: ['userId'] });
```

`profiles.birthday` is a `Date | null` to your code on both write and
read. At rest it is AES ciphertext:

```typescript ignore
const prof = await db.repo('Profiles').getByPK({ userId });
prof.data?.birthday instanceof Date; // true — decrypted and decoded on read
```

### The plaintext codec

Encryption operates on strings, but the column keeps its declared
type. Before encrypting (and digesting), NORM canonicalizes the
validated value to a deterministic string; on read it decodes back.
The canonical forms are timezone-stable and re-digestable — the same
value always yields the same digest.

| Logical type                                        | Canonical string                     | Decoded back to |
| --------------------------------------------------- | ------------------------------------ | --------------- |
| `DATE` / `TIME` / `DATETIME` / `TIMESTAMP`          | `Date.toISOString()`                 | `Date`          |
| `BIGINT`                                            | decimal string                       | `bigint`        |
| `INTEGER` / `DECIMAL` / `FLOAT` / `DOUBLE` / `REAL` | `String(n)`                          | `number`        |
| `BOOLEAN`                                           | `'true'` / `'false'`                 | `boolean`       |
| `JSON` / `JSONB`                                    | recursively **key-sorted** JSON text | parsed value    |
| `VARCHAR` / `CHAR` / `TEXT` / `UUID`                | the string as-is                     | `string`        |

JSON is key-sorted so digests of semantically equal objects agree
regardless of insertion order. Decoding is defensive: a corrupted or
pre-codec cell falls back to the raw string on every branch — one bad
value neither aborts the whole read nor silently flips into a
legal-looking value.

`Column.blob()` **cannot** be encrypted — the codec is text-canonical.
Encode binary to a text form and encrypt that if you need it.

### Per-cell cost

Be honest with yourself about bulk writes. The default AES helper
derives the encryption key from your secret with **PBKDF2-SHA-256
(210,000 iterations, random per-message salt)** on _every_ encrypt and
_every_ decrypt call. That is deliberate — it makes brute-forcing a
short secret expensive — but it means each encrypted cell pays a full
key derivation in both directions. On commodity hardware that is
**~22 ms per encrypt and ~22 ms per decrypt** (see `rotate.bench.ts`),
so encrypting or reading back tens of thousands of rows is measurably
heavy.

If that cost dominates a workload, the [crypto override seam](#crypto-overrides) lets you supply a cheaper KDF (e.g. a derived
key cached per secret) or delegate to a KMS.

## Digest siblings — `.encrypt().hash()`

Chaining `.hash()` after `.encrypt()` synthesizes a **`<col>_hash`**
digest sibling — a deterministic SHA-256 `VARCHAR(64)` column that
NORM maintains on every write. It exists so plaintext equality
operations work against a column whose ciphertext is unusable for
comparison.

```typescript
import { Column, Entity } from '@tundralibs/norm';

const Users = Entity('users', {
  id: Column.uuid().default({ $$_expression: 'UUID' }),
  email: Column.varchar(255).pattern(/^\S+@\S+\.\S+$/)
    .beforeWrite((v) => v.trim().toLowerCase())
    .encrypt().hash(), // → ciphertext `email` + digest `email_hash`
  apiKey: Column.varchar(256).encrypt(), // encrypted, NOT hashed → not filterable
}, {
  pk: ['id'],
  unique: { email: ['email_hash'] }, // uniqueness lives on the digest
});
```

### Why ciphertext can't be filtered

An encrypted column with **no** `.hash()` (like `apiKey` above) is
readable but not filterable. Random-IV ciphertext never equals itself,
so `where email = <ciphertext>` can never match, uniqueness can't be
enforced, and you can't group, order, or join on it. Try to filter one
and NORM throws with a pointed hint:

```
Column 'apiKey' on entity 'Users' is not filterable
  — declare .hash() to enable equality filtering.
```

### Filtering, uniqueness, and upsert keys

With `.hash()` declared, all of these work transparently — you always
speak plaintext, and NORM rewrites to the digest sibling under the
hood. Equality-class operators only (`$eq`, `$ne`, `$in`, `$nin`,
`$null`); ordering by a digest is meaningless and stays rejected.

```typescript ignore
// Equality — rewritten to email_hash = sha256('ada@shortly.dev').
// The column's beforeWrite (trim + lowercase) runs on the lookup too,
// so a differently-cased/whitespaced input still finds the row.
await db.repo('Users').findOne({ '@email': '  Ada@Shortly.Dev  ' });

// $in — each element digested.
await db.repo('Users').find({
  '@email': { $in: ['bob@shortly.dev', 'eve@shortly.dev'] },
});

// The rewrite composes with $or, joins, and update()/delete() filters.
await db.repo('Users').update({ loginCount: 1 }, {
  '@email': 'ada@shortly.dev',
});

// Uniqueness — enforced by a real UNIQUE index on the sibling.
// A different-case duplicate collides because it digests identically.
await db.repo('Users').insert({ email: 'ADA@SHORTLY.DEV' /* ... */ }); // rejects
```

Because the digest is deterministic, an encrypted-and-hashed column can
be an **upsert conflict key** (via the sibling) even though the
ciphertext can't:

```typescript ignore
// Encrypted `email` cannot be a conflict key directly — ciphertext is
// nondeterministic — so conflict on the id and update email; NORM
// auto-adds `email_hash` to updateOnConflict so the digest re-syncs
// with the new ciphertext and plaintext lookups keep finding the row.
await db.repo('Users').upsert({
  id: userId,
  email: 'ada.lovelace@shortly.dev',
  apiKey: 'ak-ada-0002',
  displayName: 'Ada L.',
  passwordHash: 'bcrypt$ada',
}, { conflictKeys: ['id'], updateOnConflict: ['email'] });

// Naming the encrypted column itself as a conflict key is rejected:
//   "Column 'email' ... cannot be an upsert conflict key — ciphertext
//    is nondeterministic. Use the 'email_hash' sibling ..."
```

Non-string plaintext works too: an encrypted `bigint` or `Date` column
with `.hash()` canonicalizes filter operands exactly like the write
path, so the digests line up. The sibling always uses SHA-256
regardless of the instance's encrypt algorithm.

## One-way digest columns — `Column.hash()`

For values that must be _comparable_ but never _readable_ — passwords,
PINs, recovery codes — use a standalone digest column. Callers write
and filter by plaintext; NORM digests on the way in and the column
stores only the hex digest. There is nothing to decrypt, so `.encrypt()`
on a digest column is a hard error.

```typescript ignore
const Users = Entity('users', {
  // ...
  pin: Column.hash('SHA-256').nullable(), // one-way digest, plaintext lookups
});
```

The algorithm — `'SHA-256'` (default), `'SHA-384'`, or `'SHA-512'` —
determines the physical `VARCHAR` length: 64, 96, or 128 hex
characters respectively.

```typescript ignore
const row = (await db.repo('Users').insert({ pin: '4471' /* ... */ })).data[0]!;
row.pin; // 64-hex SHA-256 digest — the plaintext '4471' is gone

// Filter by plaintext — the VALUE is digested, the column key stays.
const byPin = await db.repo('Users').findOne({ '@pin': '4471' });
```

Note the difference from an encrypt-sibling: `.encrypt().hash()`
rewrites the filter _key_ to `@email_hash`; a `Column.hash(algo)`
digest rewrites only the _value_ and keeps the `@pin` key, because the
column itself already stores the digest. Both are transparent to the
caller. Validators (`pattern` / `minLength` / `maxLength`) on a digest
column constrain the plaintext — your password policy — not the digest.

## Virtual masks — `Column.mask()`

A mask is a **presentation** column: computed client-side from a
sibling `source` column _after_ decryption, never stored, never sent
to SQL, and excluded from inserts, updates, filters, and ordering.

```typescript ignore
const Users = Entity('users', {
  apiKey: Column.varchar(256).encrypt(), // the raw, encrypted source
  apiKeyHint: Column.mask('apiKey', (v) => `…${v.slice(-4)}`),
  // ...
});
```

`apiKeyHint` is its own first-class key. The raw `apiKey` and the
masked `apiKeyHint` are **independently projectable** — a default read
carries both:

```typescript ignore
const row = (await db.repo('Users').insert({ apiKey: 'ak-ada-0001' /* ... */ }))
  .data[0]!;
row.apiKey; // 'ak-ada-0001' (decrypted)
row.apiKeyHint; // '…0001'
```

Details that matter:

- The mask fn receives the **decoded stored value** — a real `Date`
  for an encrypted timestamp source, a `number` for a numeric one.
  Type the fn's parameter to the source's logical type
  (`Column.mask<Date>('birthday', (d) => d.getFullYear().toString())`).
- Several masks may share one source, with any custom names.
- Whether the raw source projects by default stays the source's own
  `.hidden()` decision — a hidden source is still fetched (and
  decrypted) to compute the mask, then stripped from the result.
- On a `decrypt: false` read, masks over an **encrypted** source are
  skipped — the fn must never see ciphertext.
- Only `hidden()` / `comment()` / `nullable()` chain on a mask.
  Declare `.nullable()` when the source is nullable (a null source
  yields a null mask).
- Masks are **not** computed by the `db.query()` escape hatch (its
  sources may be absent) — they are a typed-read feature.

## Hidden columns — `.hidden()`

`.hidden()` excludes a column from default read shapes (and from
RETURNING), while keeping it writable and explicitly projectable. It is
the natural home for a stored credential you verify but never surface.

```typescript ignore
const Users = Entity('users', {
  // ...
  passwordHash: Column.varchar(64).hidden().unfilterable(),
});
```

The password-verification pattern — the hash never leaves the database
on a default read, but you can opt into it for the one query that
checks a login:

```typescript ignore
// Default read: passwordHash is absent.
const user = await db.repo('Users').findOne({ '@email': 'ada@shortly.dev' });
'passwordHash' in (user.data ?? {}); // false

// Verification: project it explicitly, compare with your own hasher.
const withHash = await db.repo('Users').findOne(
  { '@email': 'ada@shortly.dev' },
  { project: { '@id': true, '@passwordHash': true } },
);
const ok = await verifyPassword(candidate, withHash.data!.passwordHash);
```

`.hidden()` composes with `.unfilterable()` (reject it in WHERE /
ORDER BY) and survives every generic-changing modifier in a chain
(`nullable`, `default`, `encrypt`, `hash`) — the type-level brand and
the runtime strip never diverge.

## Crypto overrides

`CryptoOverrides` on `new Norm({ crypto })` swaps the default crypto
callbacks. Any callback you omit falls back to the built-in
AES/SHA implementation from `@tundralibs/crypt`.

```typescript
import type { EncryptAlgorithm, HashAlgorithm } from '@tundralibs/norm';

type CryptoOverrides = {
  encrypt?: (
    plaintext: string,
    secret: string,
    algorithm: EncryptAlgorithm,
  ) => Promise<string>;
  decrypt?: (
    ciphertext: string,
    secret: string,
    algorithm: EncryptAlgorithm,
  ) => Promise<string>;
  hash?: (plaintext: string, algorithm: HashAlgorithm) => Promise<string>;
};
```

**`encrypt` and `decrypt` must be overridden as a pair.** If encrypted
columns exist and you override one but not the other, `norm.use(...)`
rejects it — rows would be written in one format and read back in
another.

```typescript
import { Norm } from '@tundralibs/norm';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';

declare const kms: {
  encrypt(plain: string, secret: string, algo: string): Promise<string>;
  decrypt(cipher: string, secret: string, algo: string): Promise<string>;
};
const engine = new SQLiteEngine('app', { path: './data' });

const norm = new Norm({
  engine,
  secret: process.env.NORM_SECRET,
  crypto: {
    // Delegate the symmetric crypto to a KMS-backed helper.
    encrypt: (plain, secret, algo) => kms.encrypt(plain, secret, algo),
    decrypt: (cipher, secret, algo) => kms.decrypt(cipher, secret, algo),
  },
});
```

The `hash` callback may be overridden **alone** — it takes no secret in
its default form, which is the seam for **hardening low-entropy
digests**. A one-way `Column.hash()` over a small value space (a
4-digit PIN, a short code) is trivially rainbow-tabled as a bare
SHA-256; swapping `hash` for a keyed HMAC binds every digest to your
secret:

```typescript
import { type HashAlgorithm, Norm } from '@tundralibs/norm';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';

declare function hmac(
  plain: string,
  key: string,
  algo: HashAlgorithm,
): Promise<string>;
const engine = new SQLiteEngine('app', { path: './data' });

const norm = new Norm({
  engine,
  secret: process.env.NORM_SECRET,
  crypto: {
    // HMAC-with-secret siblings + digests instead of bare SHA.
    hash: async (plain, algo) => hmac(plain, process.env.HASH_KEY!, algo),
  },
});
```

Because sibling digests and `db.hash()` both route through
`crypto.hash`, one override hardens encrypt-siblings _and_
`Column.hash()` columns consistently — and, crucially, plaintext-filter
rewrites use the same callback, so lookups still match.

## Migrations and crypto

The Migrator derives crypto changes from your definitions. The
encrypt/hash/digest markers are **crypto facts**; when one flips, no
in-place `ALTER` can express the change, so the Migrator performs a
**table rebuild** (rename aside → recreate → copy → verify → drop) and
runs the copy step per row in JS:

- **Turning `.encrypt()` on** encrypts every existing row's plaintext.
- **Turning `.encrypt()` off** decrypts it back to plaintext.
- **Adding `.hash()`** backfills the `<col>_hash` sibling from the
  decrypted values.

The reviewable `.sql` artifact makes the rebuild explicit (`-- (copy
step runs per-row in the migrator: decrypt/re-encrypt/…)`), and
`apply()` refuses to run a plan whose hash doesn't match the reviewed
artifact.

**Digest algorithm changes are one-way and rejected.** Changing a
`Column.hash('SHA-256')` to `'SHA-384'` cannot be migrated — the
digests are one-way and the plaintext is gone, so there is nothing to
re-digest from:

```
Column 'Users.pin': digest algorithm changes cannot be migrated —
  digests are one-way, the plaintext is gone. Add a new column and
  backfill from source data instead.
```

See **[Migrations](NORM-Migrations.md)** for the rebuild engine, stored
plans, and the advisory lock.

## Read-path decrypt failures — `onDecryptFailure`

A stored ciphertext can fail to become plaintext on read: it was
corrupted, tampered with (GCM/MAC authentication fails), or written
under a **different key** than the instance now holds. `onDecryptFailure`
decides what a read does with that one cell:

| Policy               | Behaviour                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'null'` _(default)_ | The cell reads as `null`; the row's other columns are untouched, the rest of the page still flows, and a metadata-only `decryptError` event fires. One bad cell never fails the whole query. |
| `'throw'`            | The read raises a typed `NormCryptoError` naming the entity, column, and pk. Use it when a failure must be loud — an operational alarm rather than a silent gap.                             |

```typescript
import { Norm } from '@tundralibs/norm';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';

declare const metrics: {
  increment(name: string, tags: Record<string, string>): void;
};
const engine = new SQLiteEngine('app', { path: './data' });
const secret = process.env.NORM_SECRET;

const norm = new Norm({
  engine,
  secret,
  onDecryptFailure: 'null', // the default
});

// Observe degraded cells without failing reads:
norm.on('decryptError', (entity, column, pk, reason) => {
  metrics.increment('norm.decrypt_failure', { entity, column, reason });
});
```

`reason` is `'decrypt'` (ciphertext failed its auth tag / wrong key) or
`'decode'` (decrypted, but the canonical plaintext was malformed). The
event **never** carries the ciphertext or the failed value — only
identifiers. Under `'throw'`, the same context rides on
`NormCryptoError.context`:

```typescript ignore
try {
  await db.repo('Vaults').find();
} catch (e) {
  if (e instanceof NormCryptoError) {
    console.error(
      `${e.context.entity}.${e.context.column} (pk ${e.context.pk}) ` +
        `failed to ${e.context.reason}`,
    );
  }
}
```

The `'null'` default is deliberate: after a [key rotation](#key-rotation--rotatekey)
that hasn't finished, or a partially-restored backup, a single
unreadable cell degrades gracefully instead of taking down every list
view that touches the table.

## Key rotation — `rotateKey()`

Rotating the encryption secret — re-encrypting every stored cell from an
old key to a new one — is an **admin activity**, not a migration: no
snapshot, no plan file, no DDL. `rotateKey()` walks each encrypted table
in primary-key order, decrypts each cell with `oldKey`, and re-encrypts
it with `newKey`, streaming in chunks so a multi-million-row table never
lands in memory at once.

```typescript ignore
import { rotateKey } from '@tundralibs/norm';

// Run during a downtime window (app stopped, or not writing encrypted
// columns), then restart the app configured with newKey.
const report = await rotateKey(db, {
  oldKey: process.env.OLD_SECRET!,
  newKey: process.env.NEW_SECRET!,
  chunkSize: 500, // rows per batch (default)
  onProgress: (p) => console.log(`${p.entity}: ${p.rotated} cells`),
});

console.log(
  `rotated ${report.rotatedCells} cells across ${report.entities.length} tables`,
);
```

**Resumable and idempotent.** Every ciphertext is stamped with a short
fingerprint of the key that produced it (`k1.<fp>.<body>`). Rotation
reads that fingerprint to classify each cell — already under `newKey`
(skip), under `oldKey` or legacy/un-stamped (rotate), or under some
**third** key (leave, count under `unknownCells`). So a crashed run
resumes safely: re-running skips whatever already moved, and a mistyped
`oldKey` surfaces as "0 rotated, everything unknown" — never as silent
corruption.

```typescript ignore
// Preview the job first — classifies + counts, writes nothing:
const preview = await rotateKey(db, { oldKey, newKey, dryRun: true });
console.log(`${preview.rotatedCells} cells would rotate`);
```

**Searchable hashes survive rotation.** `.encrypt().hash()` sibling
digests are derived from **plaintext**, not ciphertext, so rotation
never touches them — hashed-equality filters keep working across a
rotation with no reindex.

Rotation reports a tally per entity (`rows`, `rotatedRows`,
`rotatedCells`, `skippedCells`, `unknownCells`) plus grand totals. It
throws a `NormCryptoError` (naming entity / column / pk) if a cell won't
decrypt with `oldKey`, and having written nothing for that row.

**Sizing the window.** Rotation is crypto-bound: each cell pays a
decrypt _and_ a re-encrypt, ≈ **44 ms/cell** with the default PBKDF2
helper ([Per-cell cost](#per-cell-cost)) — order **~20 cells/sec/core**,
so a million encrypted cells is hours, not minutes. The classification
that makes it resumable is nanoseconds and the paging/UPDATE round-trips
are dwarfed by the KDF, so cell-count × 44 ms is a good estimate;
`rotate.bench.ts` benchmarks the per-cell cost. A cheaper KDF via the
[crypto override seam](#crypto-overrides) is the lever if that window is
too long.

> **v1 is downtime-first.** Rotation rewrites rows without holding a
> global lock or a transaction spanning the whole table; run it while the
> app is not writing encrypted columns. An online rotation (a runtime
> keyring that reads both keys during the sweep) is a future addition —
> the stamped-key-id envelope is the groundwork for it.

## Limitations

Be precise about what NORM does **not** do yet:

- **Key rotation is downtime-first.** `rotateKey()` re-encrypts every
  stored cell old→new key, resumably and idempotently (see
  [Key rotation](#key-rotation--rotatekey)), but v1 expects a downtime
  window — there is no runtime keyring that reads both keys online during
  the sweep yet.
- **Foreign-key columns must stay plaintext.** A join compares the
  actual column values across tables in its `ON` clause, and a digest
  sibling doesn't help there — random-IV ciphertext never matches. Keep
  FK columns unencrypted. A **scope** column is the exception: a scope
  is an equality _filter_ (not a join), so an `.encrypt().hash()` scope
  column rewrites to digest equality on its `<col>_hash` sibling and
  works — a plain `.encrypt()` scope column (no hash) is still rejected.
  See [Scoping](NORM-Scoping.md#rules-and-limits).
- **Encrypted columns are not orderable or aggregatable.** IV-random
  ciphertext never groups; aggregating an encrypted column is rejected
  up front.
- **`BLOB` cannot be encrypted** — the codec is text-canonical.
- **Escape hatches bypass decryption.** `db.raw()` returns rows exactly
  as the driver does (ciphertext, no afterRead) and emits a `warning`
  event; `db.query()` stays raw unless you bind it to an entity with
  `{ entity: 'Users' }`, which rides the decrypt pipeline (but not
  mask compute or hashed-filter rewrites).
- **Events never carry plaintext.** The metadata-only event surface
  (`call` / `warning` / transaction events) emits entity keys,
  operations, timings, and ids — never row data, plaintext, or secrets.

## Related Documentation

- [Schema definition](NORM-Schema.md) — the full `Column.*` builder
  reference, entities, relations, hooks, and validators.
- [Querying](NORM-Querying.md) — filters, projections, and how hashed
  columns fit the filter language.
- [Migrations](NORM-Migrations.md) — the rebuild engine, crypto flips,
  and stored plans.
- [Scoping](NORM-Scoping.md) — tenant scoping and how scope columns
  interact with encryption (plain `.encrypt()` rejected;
  `.encrypt().hash()` matched via the digest sibling).

---

[← Back to NORM](../README.md)
