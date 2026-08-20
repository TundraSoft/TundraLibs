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
    find: (filter?: { '@id'?: string }) => ({
      data: filter?.['@id']
        ? [posts.get(filter['@id'])].filter(Boolean)
        : [...posts.values()],
    }),
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

    const res = await posts.list(
      {} as RapidContextQuery,
      { page: 1, size: 10 } as RapidContextPaging,
    );
    const body = res.content as { rows: Post[]; total: number };
    asserts.assertEquals(body.total, 2);
    asserts.assertEquals(body.rows.length, 2);
    Doctor.reset();
  });
});
