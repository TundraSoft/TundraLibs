/**
 * The payoff of injecting dependencies and booting through `initModules`:
 * the Posts module is testable IN ISOLATION — no HTTP server, no
 * database. A fake `Norm` is stocked under the label `BlogModule`
 * injects, the module is booted standalone, and its methods are driven
 * directly (plain calls — guards and envelopes belong to `invoke`).
 *
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Doctor } from '@tundralibs/doctor';
import type { Norm } from '@tundralibs/norm';
import { RapidError } from '../../../errors/mod.ts';
import { initModules } from '../../../modules/mod.ts';
import type {
  RapidContextPaging,
  RapidContextQuery,
} from '../../../types/mod.ts';
import { NORM } from '../di.ts';
import type { Post } from '../types.ts';
import { Audit } from './Audit.ts';
import { Posts } from './Posts.ts';

/** A Map-backed stand-in for `norm.use(BlogSchema)` — just the repo calls
 * the Posts module makes. No SQL, no engine. `reset()` empties it. */
function fakeNorm() {
  const posts = new Map<string, Record<string, unknown>>();
  let seq = 0;
  const postsRepo = {
    insert: (row: Record<string, unknown>) => {
      const stored = {
        id: `p${++seq}`,
        published: false,
        createdAt: new Date('2026-01-01'),
        ...row,
      };
      posts.set(stored.id as string, stored);
      return { data: [stored] };
    },
    find: (
      filter?: { '@id'?: string },
      opts?: { limit?: number; offset?: number },
    ) => {
      const rows = filter?.['@id']
        ? [posts.get(filter['@id'])].filter(Boolean)
        : [...posts.values()];
      // Honor LIMIT/OFFSET so the paging test can actually fail on an
      // off-by-one in list()'s offset math.
      const start = opts?.offset ?? 0;
      const end = opts?.limit === undefined ? undefined : start + opts.limit;
      return { data: rows.slice(start, end) };
    },
    count: () => ({ count: posts.size }),
    update: (set: Record<string, unknown>, filter: { '@id': string }) => {
      const row = posts.get(filter['@id']);
      if (row) Object.assign(row, set);
      return { count: row ? 1 : 0 };
    },
    delete: (filter: { '@id': string }) => ({
      count: posts.delete(filter['@id']) ? 1 : 0,
    }),
  };
  const handle = { repo: () => postsRepo };
  return {
    norm: { use: () => handle } as unknown as Norm,
    reset: () => {
      posts.clear();
      seq = 0;
    },
  };
}

const fake = fakeNorm();
Doctor.stock(NORM, fake.norm); // stocked ONCE; reset between tests
const boot = () => {
  fake.reset();
  return initModules({ name: 'blog-test', logger: { handlers: [] } }, {
    modules: [{ Posts, Audit }],
  });
};

describe('blog.Posts (unit — fake Norm via doctor, no server/DB)', () => {
  it('create → find round-trips, tags parsed, 201 status, PostCreated reaches Audit', async () => {
    const { modules, runtime } = await boot();
    const created = await modules.Posts.create({
      title: 'Hello',
      body: 'B',
      tags: ['a', 'b'],
    });
    asserts.assertEquals(created.status, 201);
    const post = created.content as Post;
    asserts.assertEquals(post.tags, ['a', 'b']); // stored JSON → array
    asserts.assertEquals(typeof post.createdAt, 'string'); // Date → ISO
    const found = await modules.Posts.find(post.id);
    asserts.assertEquals((found.content as Post).title, 'Hello');
    asserts.assertEquals(modules.Audit.trail.map((t) => [t.event, t.id]), [
      ['posts:Posts:PostCreated', post.id],
    ]);
    await runtime.dispose();
  });

  it('find() on a missing id throws the framework 404; through invoke it is a 404 envelope', async () => {
    const { modules, runtime } = await boot();
    await asserts.assertRejects(
      () => modules.Posts.find('nope'),
      RapidError,
      'Not found',
    );
    asserts.assertEquals(
      (await runtime.invoke(Posts, 'get', ['nope'])).status,
      404,
    );
    await runtime.dispose();
  });

  it('list() pages and reports the total', async () => {
    const { modules, runtime } = await boot();
    await modules.Posts.create({ title: 'one', body: 'b' });
    await modules.Posts.create({ title: 'two', body: 'b' });
    // size:1 → one row per page but total:2. A wrong offset (e.g. page*size)
    // returns the wrong row / an empty page, so this pins the paging math.
    const p1 = await modules.Posts.list(
      {} as RapidContextQuery,
      { page: 1, size: 1 } as RapidContextPaging,
    );
    const b1 = p1.content as { rows: Post[]; total: number };
    asserts.assertEquals(b1.total, 2);
    asserts.assertEquals(b1.rows.length, 1);
    const p2 = await modules.Posts.list(
      {} as RapidContextQuery,
      { page: 2, size: 1 } as RapidContextPaging,
    );
    const b2 = p2.content as { rows: Post[]; total: number };
    asserts.assertEquals(b2.rows.length, 1);
    asserts.assert(b1.rows[0]!.id !== b2.rows[0]!.id); // distinct pages
    await runtime.dispose();
  });
});
