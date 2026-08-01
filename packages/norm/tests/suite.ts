/**
 * The engine-agnostic live suite — 20 ordered steps driving the
 * Shortly app (tests/models/) through a REAL database. No mocks:
 * every assertion is against rows the engine actually stored.
 *
 * Each engine gets a thin `live-<engine>.test.ts` that supplies a
 * {@linkcode LiveFixture} — an engine with the Shortly DDL applied
 * plus dialect normalizers — and calls {@linkcode runLiveSuite}. The
 * steps themselves never know which database they are hitting, so
 * replicating for Postgres/Maria means adding a fixture file, not
 * copying tests.
 *
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import { Migrator } from '../migrations/mod.ts';
import {
  Norm,
  type NormConfig,
  type NormDb,
  NormQueryError,
  NormValidationError,
  use,
} from '../mod.ts';
import { Audit, Blog, Identity, Shortener } from './models/mod.ts';

const SECRET = 'shortly-live-secret-key-32-bytes!';

/** The engine union `Norm` accepts. */
export type LiveEngine = NonNullable<NormConfig['engine']>;

/** Readback normalizers for the engine's dialect. */
export type LiveDialect = {
  /** TIMESTAMP readback → epoch millis. */
  asTime(v: unknown): number;
  /** BIGINT readback → bigint. */
  asBig(v: unknown): bigint;
  /** JSON readback → parsed value. */
  asJson(v: unknown): unknown;
};

/** What a `live-<engine>.test.ts` supplies. */
export type LiveFixture = {
  /** Suite label — describe() renders `norm.live-<name>`. */
  name: string;
  /** Create the engine with the Shortly DDL already applied.
   * Called once in beforeAll. */
  setup(): Promise<LiveEngine>;
  /** Dispose whatever setup created (files, containers…). Called in
   * afterAll, after the pool disconnects. */
  teardown(): Promise<void>;
  dialect: LiveDialect;
  /** false = the Migrator does NOT own the schema (schemaless
   * engines: Mongo collections appear on first insert; the fixture's
   * setup() creates whatever indexes it needs). Default true. */
  migrate?: boolean;
  /** Steps this dialect cannot run, keyed by step id ('17', '13b'),
   * with the REASON — rendered as a loud SKIPPED step so gaps stay
   * visible in every run, never silently green. */
  skip?: Record<string, string>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function appRegistry() {
  return use(Identity, Shortener, Blog, Audit);
}

/** Register the 20-step Shortly suite against the given fixture. */
export function runLiveSuite(fixture: LiveFixture): void {
  const { asTime, asBig, asJson } = fixture.dialect;

  let norm: Norm;
  let db: NormDb<ReturnType<typeof appRegistry>>;
  const calls: Array<
    { entity: string; op: string; id: string; isSlow: boolean }
  > = [];
  const envelopeIds: string[] = [];

  // Seeded ids we reference across steps.
  let ada = '';
  let bob = '';
  let eve = '';

  let migDir = '';

  // Steps register through this wrapper so a dialect can declare a
  // gap: the step still APPEARS in the run, titled SKIPPED with the
  // reason — gaps stay visible, never silently green.
  const step = (title: string, fn: () => void | Promise<void>): void => {
    const id = title.split(' ')[0]!;
    const reason = fixture.skip?.[id];
    if (reason !== undefined) {
      it(`${title} — SKIPPED on ${fixture.name}: ${reason}`, () => {});
      return;
    }
    it(title, fn);
  };

  describe(`norm.live-${fixture.name} — the Shortly app, end to end`, () => {
    beforeAll(async () => {
      const engine = await fixture.setup();
      norm = new Norm({
        engine,
        secret: SECRET,
        _oncall: (entity, op, _t, isSlow, id) =>
          void calls.push({ entity, op, id, isSlow }),
      });
      db = norm.use(Identity, Shortener, Blog, Audit);
      if (fixture.migrate !== false) {
        // The Migrator OWNS the schema — no hand-written DDL anywhere:
        // snapshot the composed registry and apply it to the fresh db.
        migDir = await makeTempDir({
          prefix: `norm-live-${fixture.name}-mig-`,
        });
        const mig = new Migrator(db, { dir: migDir });
        await mig.snapshot();
        await mig.apply();
      }
    });

    afterAll(async () => {
      await norm.disconnect();
      await fixture.teardown();
      if (migDir !== '') await removeDir(migDir, { recursive: true });
    });

    // ── 01 Writes: defaults, hooks, crypto, RETURNING ─────────────────

    step(
      '01 insert users: expr-UUID pk, guardian defaults, hooks, decrypted RETURNING, hidden strip',
      async () => {
        const r = await db.repo('Users').insert({
          email: '  ADA@Shortly.DEV ',
          apiKey: 'ak-ada-0001',
          displayName: '  Ada  ',
          passwordHash: 'bcrypt$ada',
          pin: '4471',
        });
        envelopeIds.push(r.id);
        asserts.assertEquals(r.op, 'INSERT');
        asserts.assertEquals(r.count, 1);
        const row = r.data[0]!;
        ada = row.id;
        // Expression default: DAM-generated UUID.
        asserts.assertMatch(ada, /^[0-9a-f-]{36}$/i);
        // Guardian .optional(default)s fired.
        asserts.assertEquals(row.role, 'viewer');
        asserts.assertEquals(row.loginCount, 0);
        // beforeInsert hook + RETURNING decryption round-trip.
        asserts.assertEquals(row.email, 'ada@shortly.dev');
        asserts.assertEquals(row.displayName, 'Ada');
        asserts.assertEquals(row.apiKey, 'ak-ada-0001');
        // hidden() stripped from RETURNING.
        asserts.assertEquals('passwordHash' in row, false);
        // Virtual mask computed in RETURNING; raw apiKey also present
        // (not hidden — both are independently projectable).
        asserts.assertEquals(row.apiKeyHint, '…0001');
        // Digest column: SHA-256 hex at rest, plaintext lookups work.
        asserts.assertMatch(row.pin as string, /^[0-9a-f]{64}$/);
        const byPin = await db.repo('Users').findOne({ '@pin': '4471' });
        asserts.assertEquals(byPin.data?.id, ada);

        const batch = await db.repo('Users').insert([
          {
            email: 'bob@shortly.dev',
            apiKey: 'ak-bob-0001',
            displayName: 'Bob',
            passwordHash: 'bcrypt$bob',
            role: 'editor',
          },
          {
            email: 'eve@shortly.dev',
            apiKey: 'ak-eve-0001',
            displayName: 'Eve',
            passwordHash: 'bcrypt$eve',
            role: 'admin',
          },
        ]);
        asserts.assertEquals(batch.count, 2);
        bob = batch.data[0]!.id;
        eve = batch.data[1]!.id;
        asserts.assertNotEquals(ada, bob);
      },
    );

    step(
      '02 at rest: ciphertext stored, sibling is a 64-hex digest, dupes collide case-insensitively',
      async () => {
        const raw = await db.query<Record<string, unknown>>({
          type: 'SELECT',
          table: 'users',
          columns: ['id', 'email', 'email_hash', 'apiKey'],
          projection: {
            '@id': true,
            '@email': true,
            '@email_hash': true,
            '@apiKey': true,
          },
          where: { '@id': ada },
        });
        const at = raw.data[0]!;
        // Stored email is ciphertext, decryptable with the Norm secret.
        asserts.assertNotEquals(at.email, 'ada@shortly.dev');
        asserts.assertEquals(
          await db.decrypt(at.email as string),
          'ada@shortly.dev',
        );
        asserts.assertMatch(at.email_hash as string, /^[0-9a-f]{64}$/);
        asserts.assertEquals(at.email_hash, await db.hash('ada@shortly.dev'));
        asserts.assertNotEquals(at.apiKey, 'ak-ada-0001');

        // The UNIQUE index on the SIBLING makes email uniqueness work
        // for ciphertext — and beforeWrite makes it case-insensitive.
        await asserts.assertRejects(() =>
          db.repo('Users').insert({
            email: 'ADA@SHORTLY.DEV', // different case, same digest
            apiKey: 'ak-dupe',
            displayName: 'Imposter',
            passwordHash: 'x',
          })
        );
      },
    );

    step(
      '03 hashed filters: plaintext equality, $in, update/delete-by-hash — all live SQL',
      async () => {
        const one = await db.repo('Users').findOne({
          '@email': '  Ada@Shortly.Dev  ', // normalization applies to lookups
        });
        asserts.assertEquals(one.count, 1);
        asserts.assertEquals(one.data?.id, ada);

        const two = await db.repo('Users').find({
          '@email': { $in: ['bob@shortly.dev', 'eve@shortly.dev'] },
        });
        asserts.assertEquals(two.count, 2);

        const upd = await db.repo('Users').update(
          { loginCount: 1 },
          { '@email': 'ada@shortly.dev' },
        );
        asserts.assertEquals(upd.count, 1);
        const check = await db.repo('Users').getByPK({ id: ada });
        asserts.assertEquals(check.data?.loginCount, 1);

        // delete-by-hash: a throwaway user removed via its email digest.
        // Net-zero (insert + delete) so the fixture's user set is intact
        // for later steps.
        await db.repo('Users').insert({
          email: 'throwaway@shortly.dev',
          apiKey: 'ak-tmp-0001',
          displayName: 'Tmp',
          passwordHash: 'bcrypt$tmp',
        });
        const del = await db.repo('Users').delete({
          '@email': 'throwaway@shortly.dev',
        });
        asserts.assertEquals(del.count, 1);
        const gone = await db.repo('Users').findOne({
          '@email': 'throwaway@shortly.dev',
        });
        asserts.assertEquals(gone.count, 0);
      },
    );

    step(
      '04 scopes live: out-of-scope update rejected; updatedAt auto-touches',
      async () => {
        const before = await db.repo('Users').getByPK({ id: ada });
        await sleep(20);
        await db.repo('Users').update(
          { displayName: 'Ada L.' },
          { '@email': 'ada@shortly.dev' },
        );
        const after = await db.repo('Users').getByPK({ id: ada });
        asserts.assertEquals(after.data?.displayName, 'Ada L.');
        // Auto-touch came from OUTSIDE the caller scope.
        asserts.assertEquals(
          asTime(after.data?.updatedAt) > asTime(before.data?.updatedAt),
          true,
        );
        // email is not in the update pick-list.
        await asserts.assertRejects(
          () =>
            db.repo('Users').update(
              { email: 'new@shortly.dev' } as never,
              { '@id': ada },
            ),
          NormValidationError,
        );
        // lov violations are validation errors, not SQL errors.
        await asserts.assertRejects(
          () =>
            db.repo('Users').update({ role: 'root' as never }, { '@id': ada }),
          NormValidationError,
        );
      },
    );

    // ── 05-07 Relations against real joins ───────────────────────────

    step(
      '05 hasOne: Users → Profile (derived from FK==pk), object-or-null',
      async () => {
        const born = new Date('1815-12-10T00:00:00.000Z');
        await db.repo('Profiles').insert([
          {
            userId: ada,
            bio: 'norm author',
            website: 'https://ada.dev',
            birthday: born,
          },
        ]);
        // EAGER hasOne (reverseProject): Ada's DEFAULT read now carries
        // her Profile; Bob's is null. Depth-1 — the nested row is the
        // profile's LOCAL shape.
        const adaFull = await db.repo('Users').getByPK({ id: ada });
        asserts.assertEquals(
          (adaFull.data?.Profile as Record<string, unknown>).bio,
          'norm author',
        );
        const bobFull = await db.repo('Users').getByPK({ id: bob });
        asserts.assertEquals(bobFull.data?.Profile, null);
        // Encrypted Date: TEXT ciphertext at rest, Date back on read.
        const prof = await db.repo('Profiles').getByPK({ userId: ada });
        asserts.assertEquals(prof.data?.birthday instanceof Date, true);
        asserts.assertEquals(
          (prof.data?.birthday as Date).toISOString(),
          born.toISOString(),
        );
        const withP = await db.repo('Users').findOne({ '@id': ada }, {
          project: { '@id': true, '@Profile': { '@bio': true } },
        });
        asserts.assertEquals(withP.data?.Profile, { bio: 'norm author' });
        const withoutP = await db.repo('Users').findOne({ '@id': bob }, {
          project: { '@id': true, '@Profile': { '@bio': true } },
        });
        asserts.assertEquals(withoutP.data?.Profile, null);
      },
    );

    step(
      '06 links: batch insert (json/bigint/bool), unique slug, pattern guard',
      async () => {
        const mk = (i: number) => ({
          id: i + 1,
          slug: `link-${String(i).padStart(2, '0')}`,
          targetUrl: `https://example.com/page/${i}`,
          ownerId: i % 2 === 0 ? ada : bob,
          createdById: eve,
          ...(i === 0
            ? { meta: { tags: ['launch', 'hero'], campaign: 'q3' } }
            : {}),
          ...(i >= 20 ? { isActive: false } : {}),
        });
        const r = await db.repo('Links').insert(
          Array.from({ length: 25 }, (_, i) => mk(i)),
        );
        asserts.assertEquals(r.count, 25);

        // UNIQUE slug via real index.
        await asserts.assertRejects(() =>
          db.repo('Links').insert({
            id: 999,
            slug: 'link-00',
            targetUrl: 'https://example.com/dupe',
            ownerId: ada,
            createdById: eve,
          })
        );
        // Guardian pattern fires BEFORE SQL.
        await asserts.assertRejects(
          () =>
            db.repo('Links').insert({
              id: 998,
              slug: 'Bad Slug!',
              targetUrl: 'https://example.com/bad',
              ownerId: ada,
              createdById: eve,
            }),
          NormValidationError,
        );
      },
    );

    step(
      '07 belongsTo + named reverses: renamed sub-projections, distinct FK paths',
      async () => {
        const links = await db.repo('Links').find(
          { '@Owner.@role': 'viewer' },
          {
            project: {
              '@slug': true,
              '@Owner': { '@displayName': 'owner' },
            },
            orderBy: { '@slug': 'ASC' },
            limit: 3,
          },
        );
        asserts.assertEquals(links.count, 3);
        asserts.assertEquals(links.data[0]!.Owner, { owner: 'Ada L.' });

        // Two DIFFERENT reverse paths to the same table.
        const adaView = await db.repo('Users').findOne({ '@id': ada }, {
          project: {
            '@id': true,
            '@Links': { '@slug': true },
            '@CreatedLinks': { '@slug': true },
          },
        });
        asserts.assertEquals((adaView.data?.Links as unknown[]).length, 13); // owns even ids
        asserts.assertEquals(adaView.data?.CreatedLinks, []); // eve created all
        const eveView = await db.repo('Users').findOne({ '@id': eve }, {
          project: { '@id': true, '@CreatedLinks': { '@slug': true } },
        });
        asserts.assertEquals(
          (eveView.data?.CreatedLinks as unknown[]).length,
          25,
        );
      },
    );

    // ── 08-10 Volume: joins, pagination, operators ────────────────────

    step(
      '08 visits: 200 rows; joined filters + count',
      async () => {
        const countries = ['in', 'us', 'de', 'br'];
        const rows = Array.from({ length: 200 }, (_, i) => ({
          id: i + 1,
          linkId: (i % 25) + 1,
          country: countries[i % 4]!, // beforeWrite uppercases
          ...(i % 3 === 0 ? { referrer: 'https://news.ycombinator.com' } : {}),
        }));
        const ins = await db.repo('Visits').insert(rows);
        asserts.assertEquals(ins.count, 200);
        asserts.assertEquals(ins.data[0]!.country, 'IN');

        // Joined belongsTo filter on a COUNT — real SQL join.
        const c = await db.repo('Visits').count({ '@Link.@slug': 'link-00' });
        asserts.assertEquals(c.count, 8);
      },
    );

    step('08r raw SQL escape hatch: named params, no decrypt', async () => {
      // db.raw runs hand-written SQL with :name: params, bound to the
      // connection — rows come back RAW (email stays ciphertext, no
      // afterRead). Injection-safe only via params.
      const r = await db.raw<{ n: number | bigint }>(
        'SELECT COUNT(*) AS n FROM users WHERE role = :role:',
        { role: 'viewer' },
      );
      // Data-independent: raw count must equal the typed repo's count
      // for the same filter (proves raw executes against real data).
      const typed = await db.repo('Users').count({ '@role': 'viewer' });
      asserts.assertEquals(Number(r.data[0]!.n), typed.count);
      asserts.assertEquals(r.op, 'RAW');
      // Ciphertext, NOT the plaintext the typed repo would decrypt.
      const raw = await db.raw<{ email: string }>(
        'SELECT email FROM users WHERE id = :id:',
        { id: ada },
      );
      asserts.assertNotEquals(raw.data[0]!.email, 'ada@shortly.dev');
    });

    step(
      '08s scope: tenant isolation across reads + writes, graceful, stamped',
      async () => {
        const inDb = db.scope({ '@country': 'IN' });
        // READ: scoped count sees only the partition; unscoped sees all.
        const scoped = await inDb.repo('Visits').count();
        asserts.assertEquals(scoped.count, 50); // 200 / 4 countries
        asserts.assertEquals(scoped.scoped, { '@country': 'IN' });
        asserts.assertEquals((await db.repo('Visits').count()).count, 200);
        // find respects it too.
        const rows = await inDb.repo('Visits').find(undefined, { limit: 0 });
        asserts.assertEquals(rows.data.length, 50);
        asserts.assert(rows.data.every((v) => v.country === 'IN'));

        // GRACEFUL: Users has no `country` column → queried UNSCOPED.
        const users = await inDb.repo('Users').count();
        asserts.assertEquals(users.scoped, undefined);
        asserts.assert(users.count >= 3);

        // WRITE: insert under a JP scope auto-fills country; the row is
        // only visible inside that scope; a scoped delete cleans it up.
        const jpDb = db.scope({ '@country': 'JP' });
        // country OMITTED — the scope auto-fills it, and the scoped
        // handle's InsertOf relaxes it to optional (no cast needed).
        await jpDb.repo('Visits').insert({ id: 9999, linkId: 1 });
        const back = await db.repo('Visits').getByPK({ id: 9999 });
        asserts.assertEquals(back.data?.country, 'JP'); // auto-filled
        asserts.assertEquals((await jpDb.repo('Visits').count()).count, 1);
        // A conflicting write is rejected.
        await asserts.assertRejects(
          () =>
            jpDb.repo('Visits').insert({ id: 9998, linkId: 1, country: 'US' }),
          NormQueryError,
          'scope-bound',
        );
        // Scoped delete removes only in-scope rows (net-zero for later steps).
        await jpDb.repo('Visits').delete({});
        asserts.assertEquals((await db.repo('Visits').count()).count, 200);
      },
    );

    step(
      '08e to-many filters via EXISTS (correlated, fan-out-free)',
      async () => {
        // Filter-only to-many runs as a correlated EXISTS: every link
        // has exactly 2 IN visits, so a LEFT-JOIN fan-out would return
        // 50 rows — EXISTS must return each matching link ONCE.
        const inLinks = await db.repo('Links').find(
          { '@Visits.@country': 'IN' },
          { limit: 30 },
        );
        asserts.assertEquals(inLinks.count, 25);
        asserts.assertEquals(
          new Set(inLinks.data.map((l) => l.slug)).size,
          25, // no duplicate base rows
        );
        // count() agrees (no over-count), and a non-matching subquery
        // filter matches nothing.
        const inCount = await db.repo('Links').count(
          { '@Visits.@country': 'IN' },
        );
        asserts.assertEquals(inCount.count, 25);
        const none = await db.repo('Links').count(
          { '@Visits.@country': 'XX' },
        );
        asserts.assertEquals(none.count, 0);
        // total:true rides the same EXISTS plan for its COUNT.
        const paged = await db.repo('Links').find(
          { '@Visits.@country': 'IN' },
          { orderBy: { '@slug': 'ASC' }, limit: 10, total: true },
        );
        asserts.assertEquals(paged.count, 10);
        asserts.assertEquals(paged.total, 25);
      },
    );

    step(
      '08b typed aggregates: GROUP BY country + entity-bound db.query',
      async () => {
        // Typed grouped report — no raw IR, no manual GROUP BY.
        const perCountry = await db.repo('Visits').find(undefined, {
          project: { '@country': true },
          aggregates: { visits: { fn: 'COUNT', column: '@id' } },
          orderBy: { '@country': 'ASC' },
          limit: 10,
        });
        asserts.assertEquals(perCountry.count, 4);
        asserts.assertEquals(perCountry.data[0]!.country, 'BR');
        for (const row of perCountry.data) {
          asserts.assertEquals(Number(row.visits), 50); // 200 / 4
        }
        // Aggregate-only (no group keys): plain SELECT COUNT/MAX.
        const summary = await db.repo('Visits').find(undefined, {
          aggregates: {
            total: { fn: 'COUNT', column: '@id' },
            latest: { fn: 'MAX', column: '@id' },
          },
          limit: 5,
        });
        asserts.assertEquals(Number(summary.data[0]!.total), 200);
        asserts.assertEquals(Number(summary.data[0]!.latest), 200);

        // Entity-BOUND raw query: hand-built IR, but the rows ride the
        // decrypt pipeline — email comes back plaintext, not ciphertext.
        const bound = await db.query({
          type: 'SELECT',
          table: 'users',
          columns: ['id', 'email'],
          projection: { '@id': true, '@email': true },
          where: { '@id': ada },
        }, { entity: 'Users' });
        asserts.assertEquals(bound.data[0]!.email, 'ada@shortly.dev');
        // Unbound stays raw (ciphertext) — the old contract unchanged.
        const raw = await db.query({
          type: 'SELECT',
          table: 'users',
          columns: ['id', 'email'],
          projection: { '@id': true, '@email': true },
          where: { '@id': ada },
        });
        asserts.assertNotEquals(raw.data[0]!.email, 'ada@shortly.dev');
      },
    );

    step('09 pagination + total + orderBy windows', async () => {
      const page = await db.repo('Links').find(undefined, {
        orderBy: { '@slug': 'ASC' },
        limit: 10,
        offset: 10,
        total: true,
      });
      asserts.assertEquals(page.count, 10); // THIS page
      asserts.assertEquals(page.total, 25); // all matching
      asserts.assertEquals(page.data[0]!.slug, 'link-10');
      asserts.assertEquals(page.data[9]!.slug, 'link-19');

      // Paginated walk sums to total.
      let seen = 0;
      for (let off = 0; off < page.total!; off += 10) {
        const w = await db.repo('Links').find(undefined, {
          orderBy: { '@slug': 'ASC' },
          limit: 10,
          offset: off,
        });
        seen += w.count;
      }
      asserts.assertEquals(seen, 25);
    });

    step(
      '10 operators live: $like, $between, $null, $or across hashed + plain',
      async () => {
        const like = await db.repo('Links').count({
          '@slug': { $like: 'link-1%' },
        });
        asserts.assertEquals(like.count, 10);

        const between = await db.repo('Links').count({
          '@id': { $between: [5, 8] },
        });
        asserts.assertEquals(between.count, 4);

        const noExpiry = await db.repo('Links').count({
          '@expiresAt': { $null: true },
        });
        asserts.assertEquals(noExpiry.count, 25);

        const or = await db.repo('Users').find({
          $or: [{ '@email': 'ada@shortly.dev' }, { '@role': 'admin' }],
        });
        asserts.assertEquals(or.count, 2); // ada + eve
      },
    );

    // ── 11-12 Dialect edges: bigint, JSON ─────────────────────────────

    step('11 bigint survives beyond Number.MAX_SAFE_INTEGER', async () => {
      const big = 1152921504606846976n; // 2^60
      await db.repo('Links').update({ clicks: big }, { '@id': 1 });
      const back = await db.repo('Links').getByPK({ id: 1 });
      asserts.assertEquals(asBig(back.data?.clicks), big);
    });

    step(
      '12 JSON column round-trips (stored TEXT, parsed on read)',
      async () => {
        const back = await db.repo('Links').getByPK({ id: 1 });
        asserts.assertEquals(asJson(back.data?.meta), {
          tags: ['launch', 'hero'],
          campaign: 'q3',
        });
      },
    );

    // ── 13 M2M through the junction ───────────────────────────────────

    step(
      '13 posts/tags M2M: composite pk junction, two-hop traversal',
      async () => {
        await db.repo('Posts').insert([
          { id: 1, authorId: ada, title: '  Shipping norm  ', draft: false },
          { id: 2, authorId: ada, title: 'Draft thoughts' },
          { id: 3, authorId: bob, title: 'Bob on SQLite', draft: false },
        ]);
        await db.repo('Tags').insert([
          { id: 1, name: 'Deno' }, // beforeWrite lowercases
          { id: 2, name: 'databases' },
        ]);
        await db.repo('PostTags').insert([
          { postId: 1, tagId: 1 },
          { postId: 1, tagId: 2 },
          { postId: 3, tagId: 2 },
        ]);

        // beforeWrite on title trimmed at rest.
        const p1 = await db.repo('Posts').getByPK({ id: 1 });
        asserts.assertEquals(p1.data?.title, 'Shipping norm');

        // Tag → junction rows (reverse) → sub-projected Post via the
        // junction's OWN belongsTo — a two-hop walk.
        const deno = await db.repo('Tags').findOne({ '@name': 'deno' }, {
          project: { '@name': true, '@PostLinks': { '@postId': true } },
        });
        const postIds = (deno.data?.PostLinks as { postId: number }[])
          .map((l) => l.postId);
        asserts.assertEquals(postIds, [1]);

        const dbTagged = await db.repo('PostTags').find({ '@tagId': 2 }, {
          project: { '@postId': true, '@Post': { '@title': true } },
        });
        asserts.assertEquals(
          dbTagged.data.map((r) => (r.Post as { title: string } | null)?.title)
            .sort(),
          ['Bob on SQLite', 'Shipping norm'],
        );

        // Composite-pk operations on the junction itself.
        const one = await db.repo('PostTags').getByPK({ postId: 1, tagId: 2 });
        asserts.assertEquals(one.count, 1);
        await db.repo('PostTags').deleteByPK({ postId: 1, tagId: 2 });
        const gone = await db.repo('PostTags').getByPK({ postId: 1, tagId: 2 });
        asserts.assertEquals(gone.data, null);
      },
    );

    // ── 14-15 VIEW + QUERY over real objects ──────────────────────────

    step(
      '13b M2M via VIEW: one-call Posts→Tags projection + EXISTS filter',
      async () => {
        // The tags_of_posts VIEW (junction⋈tags, DB-side) declares a
        // LOGICAL fk to Posts with reverseAs 'Tags' — so the M2M reads
        // like a plain relation: ONE call, ONE SELECT, no junction
        // pivoting, no id mapping.
        const posts = await db.repo('Posts').find(undefined, {
          project: { '@id': true, '@title': true, '@Tags': { '@name': true } },
          orderBy: { '@id': 'ASC' },
        });
        asserts.assertEquals(posts.count, 3);
        const tagsOf = (i: number) =>
          (posts.data[i]!.Tags as { name: string }[]).map((t) => t.name).sort();
        // Step 13 deleted junction (1,2) — post 1 keeps only 'deno'.
        asserts.assertEquals(tagsOf(0), ['deno']); // post 1
        asserts.assertEquals(tagsOf(1), []); // post 2 untagged
        asserts.assertEquals(tagsOf(2), ['databases']); // post 3

        // Filtering THROUGH the M2M rides the EXISTS lift — over the
        // view — when the relation is not projected.
        const denoPosts = await db.repo('Posts').find(
          { '@Tags.@name': 'deno' },
          { limit: 10 },
        );
        asserts.assertEquals(denoPosts.count, 1);
        asserts.assertEquals(denoPosts.data[0]!.id, 1);

        // The view itself stays a full ReadRepo (typed filters incl.
        // its OWN belongsTo projection through the logical fk).
        const rows = await db.repo('TagsOfPosts').find(
          { '@name': 'databases' },
          { project: { '@postId': true, '@Post': { '@title': true } } },
        );
        asserts.assertEquals(
          rows.data.map((r) => (r.Post as { title: string } | null)?.title),
          ['Bob on SQLite'], // (1,2) was deleted in step 13
        );
      },
    );

    step('14 VIEW: ReadRepo over active_links', async () => {
      const active = await db.repo('ActiveLinks').find(undefined, {
        orderBy: { '@slug': 'ASC' },
        limit: 25,
      });
      asserts.assertEquals(active.count, 20); // 5 were inserted inactive
      asserts.assertEquals(active.data[0]!.slug, 'link-00');
      const c = await db.repo('ActiveLinks').count({
        '@slug': { $like: 'link-2%' },
      });
      asserts.assertEquals(c.count, 0); // 20-24 are inactive
    });

    step(
      '15 QUERY: stored SELECT composed ON the view, paginated',
      async () => {
        const top = await db.repo('TopLinks').find({ limit: 3 });
        asserts.assertEquals(top.count, 3);
        // Link 1 got the 2^60 clicks bump above.
        asserts.assertEquals(top.data[0]!.slug, 'link-00');
        const next = await db.repo('TopLinks').find({ limit: 3, offset: 3 });
        asserts.assertEquals(next.count, 3);
        asserts.assertNotEquals(next.data[0]!.slug, top.data[0]!.slug);
      },
    );

    // ── 16 Upsert with hash-sibling sync ──────────────────────────────

    step(
      '16 upsert: slug conflict updates; email conflict-update re-syncs the digest',
      async () => {
        const up = await db.repo('Links').upsert({
          id: 500,
          slug: 'link-00', // collides with the unique index
          targetUrl: 'https://example.com/replaced',
          ownerId: bob,
          createdById: bob,
        }, { conflictKeys: ['slug'], updateOnConflict: ['targetUrl'] });
        asserts.assertEquals(up.op, 'UPSERT');
        const after = await db.repo('Links').findOne({ '@slug': 'link-00' });
        asserts.assertEquals(
          after.data?.targetUrl,
          'https://example.com/replaced',
        );
        asserts.assertEquals(after.data?.id, 1); // updated, not inserted

        // Conflict-updating an ENCRYPTED+HASHED column: the sibling is
        // auto-added to updateOnConflict, so plaintext lookups follow.
        await db.repo('Users').upsert({
          id: ada,
          email: 'ada.lovelace@shortly.dev',
          apiKey: 'ak-ada-0002',
          displayName: 'Ada L.',
          passwordHash: 'bcrypt$ada',
        }, { conflictKeys: ['id'], updateOnConflict: ['email'] });
        const byNew = await db.repo('Users').findOne({
          '@email': 'ada.lovelace@shortly.dev',
        });
        asserts.assertEquals(byNew.data?.id, ada);
        const byOld = await db.repo('Users').findOne({
          '@email': 'ada@shortly.dev',
        });
        asserts.assertEquals(byOld.data, null); // digest moved WITH the email

        // Encrypted conflict keys are rejected up front.
        await asserts.assertRejects(
          () =>
            db.repo('Users').upsert({
              email: 'x@shortly.dev',
              apiKey: 'k',
              displayName: 'Xx',
              passwordHash: 'x',
            }, { conflictKeys: ['email'] }),
          NormQueryError,
          'nondeterministic',
        );
      },
    );

    step(
      "16s scoped upsert: lands IN the scope, never adopts another scope's row",
      async () => {
        const jpDb = db.scope({ '@country': 'JP' });
        // INSERT branch. `country` is OMITTED — the scoped handle's
        // payload type relaxes it (no cast) and the runtime auto-fills
        // it. The conflict target is emitted exactly as spelled: there
        // is no (country, id) unique, and Postgres/SQLite REFUSE an
        // ON CONFLICT list that matches no index.
        const up = await jpDb.repo('Visits').upsert(
          { id: 9500, linkId: 1 },
          { conflictKeys: ['id'] },
        );
        asserts.assertEquals(up.op, 'UPSERT');
        asserts.assertEquals(up.scoped, { '@country': 'JP' });
        const back = await db.repo('Visits').getByPK({ id: 9500 });
        asserts.assertEquals(back.data?.country, 'JP'); // auto-filled
        // UPDATE branch: conflicts with its OWN row, inside the scope.
        await jpDb.repo('Visits').upsert(
          { id: 9500, linkId: 2 },
          { conflictKeys: ['id'] },
        );
        asserts.assertEquals(
          (await db.repo('Visits').getByPK({ id: 9500 })).data?.linkId,
          2,
        );
        asserts.assertEquals((await jpDb.repo('Visits').count()).count, 1);

        // The guarantee: visit 1 belongs to country IN. A JP-scoped
        // upsert aimed at it is REFUSED on EVERY dialect — including
        // MariaDB, whose ON DUPLICATE KEY UPDATE ignores the conflict
        // target and would otherwise rewrite the row silently.
        await asserts.assertRejects(
          () =>
            jpDb.repo('Visits').upsert(
              { id: 1, linkId: 3 },
              { conflictKeys: ['id'] },
            ),
          NormQueryError,
          'OUTSIDE the active scope',
        );
        const victim = await db.repo('Visits').getByPK({ id: 1 });
        asserts.assertEquals(victim.data?.country, 'IN');
        asserts.assertEquals(victim.data?.linkId, 1);

        // Net-zero for later steps.
        await jpDb.repo('Visits').delete({});
        asserts.assertEquals((await db.repo('Visits').count()).count, 200);
      },
    );

    // ── 17 Transactions on the real engine ────────────────────────────

    step(
      '17 transactions: commit persists, rollback vanishes, txId stamped',
      async () => {
        await db.transaction(async (tx) => {
          asserts.assertEquals(tx.inTransaction, true);
          const r = await tx.repo('Tags').insert({ id: 50, name: 'committed' });
          asserts.assertEquals(typeof r.txId, 'string');
          return 0;
        });
        const kept = await db.repo('Tags').findOne({ '@name': 'committed' });
        asserts.assertEquals(kept.count, 1);

        await asserts.assertRejects(
          () =>
            db.transaction(async (tx) => {
              await tx.repo('Tags').insert({ id: 51, name: 'doomed' });
              const seen = await tx.repo('Tags').findOne({ '@name': 'doomed' });
              asserts.assertEquals(seen.count, 1); // visible INSIDE the tx
              throw new Error('boom');
            }),
          Error,
          'boom',
        );
        const gone = await db.repo('Tags').findOne({ '@name': 'doomed' });
        asserts.assertEquals(gone.data, null); // rolled back
      },
    );

    step(
      '17b nested transaction = SAVEPOINT: inner rolls back, outer survives',
      async () => {
        await db.transaction(async (tx) => {
          await tx.repo('Tags').insert({ id: 52, name: 'outer-kept' });

          // A JS failure in the nested block undoes ONLY the inner work.
          await asserts.assertRejects(
            () =>
              tx.transaction(async (inner) => {
                await inner.repo('Tags').insert({
                  id: 53,
                  name: 'inner-doomed',
                });
                const seen = await inner.repo('Tags').findOne({
                  '@name': 'inner-doomed',
                });
                asserts.assertEquals(seen.count, 1); // visible pre-rollback
                throw new Error('inner-boom');
              }),
            Error,
            'inner-boom',
          );
          const innerGone = await tx.repo('Tags').findOne({
            '@name': 'inner-doomed',
          });
          asserts.assertEquals(innerGone.data, null);

          // A SQL-LEVEL failure (pk collision) inside the nested block
          // ALSO recovers now: the engine scopes its
          // auto-rollback-on-failure to the innermost savepoint, so only
          // the block's work is undone — the outer transaction survives
          // (on Postgres this also clears the aborted-tx state).
          await asserts.assertRejects(
            () =>
              tx.transaction(async (inner) => {
                await inner.repo('Tags').insert({
                  id: 56,
                  name: 'pre-fail-row',
                });
                // id 52 already exists in this tx → SQL pk violation
                await inner.repo('Tags').insert({ id: 52, name: 'dup' });
              }),
          );
          // the block's earlier write was rolled back to the savepoint…
          asserts.assertEquals(
            (await tx.repo('Tags').findOne({ '@name': 'pre-fail-row' })).data,
            null,
          );

          // …and the outer transaction is still fully usable:
          const outerAlive = await tx.repo('Tags').findOne({
            '@name': 'outer-kept',
          });
          asserts.assertEquals(outerAlive.count, 1);

          // A successful nested block folds into the outer commit.
          await tx.transaction(async (inner) => {
            await inner.repo('Tags').insert({ id: 54, name: 'inner-kept' });
          });
        });

        // Post-commit: outer + successful inner persisted, doomed gone.
        asserts.assertEquals(
          (await db.repo('Tags').findOne({ '@name': 'outer-kept' })).count,
          1,
        );
        asserts.assertEquals(
          (await db.repo('Tags').findOne({ '@name': 'inner-kept' })).count,
          1,
        );
        asserts.assertEquals(
          (await db.repo('Tags').findOne({ '@name': 'inner-doomed' })).data,
          null,
        );
      },
    );

    // ── 18-20 Cleanup ops, cross-schema, event correlation ────────────

    step(
      '18 audit (cross-schema FK) writes + joined read; scoped use() fails loudly',
      async () => {
        await db.repo('AuditLog').insert([
          { id: 1, actorId: ada, action: 'create', subject: 'link-00' },
          { id: 2, actorId: eve, action: 'delete', subject: 'link-99' },
        ]);
        const who = await db.repo('AuditLog').find(
          { '@Actor.@role': 'admin' },
          { project: { '@subject': true, '@Actor': { '@displayName': true } } },
        );
        asserts.assertEquals(who.count, 1);
        asserts.assertEquals(who.data[0]!.subject, 'link-99');

        // Every schema pointing at 'Users' needs Identity in the SAME
        // use() — alone or together, they fail loudly without it.
        asserts.assertThrows(
          () => norm.use(Audit),
          Error,
          "references entity key 'Users'",
        );
        asserts.assertThrows(
          () => norm.use(Shortener, Blog, Audit),
          Error,
          "references entity key 'Users'",
        );
      },
    );

    step(
      '18c FK ON DELETE CASCADE fires: deleting a user removes its profile',
      async () => {
        // Throwaway user with ONLY a profile (no links/posts/audit), so
        // the delete succeeds and cascades. Profiles.User FK is CASCADE.
        const u = await db.repo('Users').insert({
          email: 'temp@shortly.dev',
          apiKey: 'ak-temp-0001',
          displayName: 'Temp',
          passwordHash: 'bcrypt$temp',
          role: 'viewer',
        });
        const uid = u.data[0]!.id;
        await db.repo('Profiles').insert({
          userId: uid,
          bio: 'to be cascaded',
        });
        asserts.assertEquals(
          (await db.repo('Profiles').getByPK({ userId: uid })).data?.bio,
          'to be cascaded',
        );
        // Delete the user → the DB cascades the profile away.
        await db.repo('Users').deleteByPK({ id: uid });
        asserts.assertEquals(
          (await db.repo('Profiles').getByPK({ userId: uid })).data,
          null, // gone — ON DELETE CASCADE fired
        );
      },
    );

    step('19 truncate + explicit {} delete', async () => {
      const t = await db.repo('Visits').truncate();
      asserts.assertEquals(t.op, 'TRUNCATE');
      asserts.assertEquals((await db.repo('Visits').count()).count, 0);

      await db.repo('PostTags').delete({}); // explicit all-rows, no warning
      asserts.assertEquals((await db.repo('PostTags').count()).count, 0);
    });

    step(
      '20 event bus correlates 1:1 with envelopes; nothing row-shaped leaked',
      async () => {
        const r = await db.repo('Users').find({ '@role': 'admin' });
        const evt = calls.find((c) => c.id === r.id);
        asserts.assertEquals(evt?.entity, 'Users');
        asserts.assertEquals(evt?.op, 'SELECT');
        // Every event id is a 26-char ULID; entity values are registry
        // keys or '<query>' — never payload objects.
        for (const c of calls) {
          asserts.assertEquals(c.id.length, 26);
          asserts.assertEquals(typeof c.entity, 'string');
        }
        // The very first envelope id of the suite also hit the bus.
        asserts.assertEquals(calls.some((c) => c.id === envelopeIds[0]), true);
      },
    );
  });
}
