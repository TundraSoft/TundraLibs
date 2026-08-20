/**
 * The payoff of injecting dependencies instead of reaching for globals:
 * the Posts module is unit-testable IN ISOLATION — no HTTP server, no
 * database. We register a FAKE `Norm` (a tiny in-memory stand-in) under
 * the same doctor token the module injects, `new Posts()`, and drive its
 * methods directly. The module is the source of truth; this tests it.
 *
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Doctor } from '@tundralibs/doctor';
import { Norm } from '@tundralibs/norm';
import { Slogger } from '@tundralibs/slogger';
import { RapidError } from '../../../errors/mod.ts';
import type {
  RapidContextPaging,
  RapidContextQuery,
} from '../../../types/mod.ts';
import type { Post } from '../types.ts';
import { registerBlogServices } from '../di.ts';
import { Posts } from './Posts.ts';

/** A Map-backed stand-in for `norm.use(BlogSchema)` — just the repo calls
 * the Posts module makes. No SQL, no engine. */
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
  return { use: () => handle } as unknown as Norm;
}

const noopLog = {
  info() {},
  warn() {},
  error() {},
  debug() {},
} as unknown as Slogger;

describe('blog.Posts (unit — fake Norm via doctor, no server/DB)', () => {
  it('create → find round-trips, tags parsed, 201 status', async () => {
    Doctor.reset();
    registerBlogServices(fakeNorm(), noopLog);
    const posts = new Posts(); // deps inject() themselves during `new`

    const created = await posts.create({
      title: 'Hello',
      body: 'B',
      tags: ['a', 'b'],
    });
    asserts.assertEquals(created.status, 201);
    const post = created.content as Post;
    asserts.assertEquals(post.tags, ['a', 'b']); // stored JSON → array
    asserts.assertEquals(typeof post.createdAt, 'string'); // Date → ISO

    const found = await posts.find(post.id);
    asserts.assertEquals((found.content as Post).title, 'Hello');
    Doctor.reset();
  });

  it('find() on a missing id throws the framework 404', async () => {
    Doctor.reset();
    registerBlogServices(fakeNorm(), noopLog);
    const posts = new Posts();
    await asserts.assertRejects(
      () => posts.find('nope'),
      RapidError,
      'Not found',
    );
    Doctor.reset();
  });

  it('list() pages and reports the total', async () => {
    Doctor.reset();
    registerBlogServices(fakeNorm(), noopLog);
    const posts = new Posts();
    await posts.create({ title: 'one', body: 'b' });
    await posts.create({ title: 'two', body: 'b' });

    // size:1 → one row per page but total:2. A wrong offset (e.g. page*size)
    // returns the wrong row / an empty page, so this pins the paging math.
    const p1 = await posts.list(
      {} as RapidContextQuery,
      { page: 1, size: 1 } as RapidContextPaging,
    );
    const b1 = p1.content as { rows: Post[]; total: number };
    asserts.assertEquals(b1.total, 2);
    asserts.assertEquals(b1.rows.length, 1);

    const p2 = await posts.list(
      {} as RapidContextQuery,
      { page: 2, size: 1 } as RapidContextPaging,
    );
    const b2 = p2.content as { rows: Post[]; total: number };
    asserts.assertEquals(b2.rows.length, 1);
    asserts.assert(b1.rows[0]!.id !== b2.rows[0]!.id); // distinct pages
    Doctor.reset();
  });
});
