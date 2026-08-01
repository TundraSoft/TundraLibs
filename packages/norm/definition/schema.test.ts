/**
 * Schema-layer tests: named `Schema()` values, `.extend()`,
 * `use()` composition (deferred FK resolution, collision + terminal
 * rules), and the documentation emitters.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import {
  Column,
  Entity,
  type RowOf,
  Schema,
  snapshot,
  toMarkdown,
  toMermaidERD,
  toPlantUML,
  use,
} from './mod.ts';

// ── Type-assertion helpers ───────────────────────────────────────────
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

// ── Fixtures ─────────────────────────────────────────────────────────

const Users = Entity('users', {
  id: Column.uuid().default({ $$_expression: 'UUID' }),
  email: Column.varchar(255).encrypt().hash(),
  status: Column.varchar(16).lov(['active', 'banned']).default('active'),
}, { pk: ['id'], comment: 'Registered accounts' });

// FKs reference ENTITY KEYS — no imports, resolved at use() time.
const Posts = Entity('posts', {
  id: Column.integer(),
  authorId: Column.uuid(),
  title: Column.varchar(200),
}, {
  pk: ['id'],
  fk: { Author: { model: 'Users', on: { authorId: 'id' } } },
});

const Comments = Entity('comments', {
  id: Column.bigint(),
  postId: Column.integer(),
  authorId: Column.uuid(),
}, {
  pk: ['id'],
  fk: {
    Post: { model: 'Posts', on: { postId: 'id' } },
    Author: { model: 'Users', on: { authorId: 'id' } },
  },
});

const ActivePosts = Entity('active_posts', {
  id: Column.integer(),
  title: Column.varchar(200),
}, {
  type: 'VIEW',
  query: {
    type: 'SELECT',
    table: 'posts',
    columns: ['id', 'title'],
    projection: { '@id': true, '@title': true },
  },
});

const RoleCounts = Entity('role_counts', {
  role: Column.varchar(32),
  total: Column.integer(),
}, {
  type: 'QUERY',
  query: {
    type: 'SELECT',
    table: 'users',
    columns: ['role'],
    projection: { '@role': true },
  },
});

const VisitorStats = Entity('visitor_stats', {
  day: Column.date(),
  path: Column.varchar(255),
  hits: Column.integer().default(0),
}, { pk: ['day', 'path'], dbSchema: 'stats' });

describe('norm.schema (Schema + use + docs)', () => {
  // ── Schema() — named values ───────────────────────────────────────

  it('collects entities, filters non-entities, enforces unique names', () => {
    const helper = () => 'not an entity';
    const S = Schema('Blog', { Users, Posts, helper, VERSION: '1.0' });
    asserts.assertEquals(S.name, 'Blog');
    asserts.assertEquals(Object.keys(S.entities), ['Users', 'Posts']);

    const Dup = Entity('users', { id: Column.integer() }, { pk: ['id'] });
    asserts.assertThrows(
      () => Schema('X', { Users, Dup }),
      Error,
      'must be unique',
    );
  });

  it('validates locally-resolvable FK keys, defers unknown keys', () => {
    // Keys 'Posts'/'Users' are not in this schema — deferred, no throw.
    const Loose = Schema('Loose', { Comments });
    asserts.assertEquals(Object.keys(Loose.entities), ['Comments']);

    // A locally-resolvable target with a bad remote column throws NOW.
    const BadRef = Entity('bad_ref', {
      id: Column.integer(),
      userId: Column.uuid(),
    }, {
      pk: ['id'],
      fk: { Author: { model: 'Users', on: { userId: 'ghost' } } },
    });
    asserts.assertThrows(
      () => Schema('X', { Users, BadRef }),
      Error,
      "target column 'ghost'",
    );

    // A locally-resolvable QUERY target is terminal — throws NOW.
    const OnQuery = Entity('on_query', {
      id: Column.integer(),
      role: Column.varchar(32),
    }, {
      pk: ['id'],
      fk: { Counts: { model: 'RoleCounts', on: { role: 'role' } } },
    });
    asserts.assertThrows(
      () => Schema('X', { RoleCounts, OnQuery }),
      Error,
      'cannot be joined',
    );
  });

  it('entity keys decouple linkage from physical names', () => {
    // Physical reality: table 'usr' in database schema 'usrgrp'. The
    // entity KEY 'Members' is what every FK references — renaming the
    // table/dbSchema is an ALTER; linkage definitions never change.
    const Members = Entity('usr', { id: Column.uuid() }, {
      pk: ['id'],
      dbSchema: 'usrgrp',
    });
    const Follows = Entity('follows', {
      id: Column.integer(),
      whoId: Column.uuid(),
    }, {
      pk: ['id'],
      fk: { Who: { model: 'Members', on: { whoId: 'id' } } },
    });
    const db = use(Schema('S', { Members, Follows }));
    asserts.assertEquals(db.Follows.foreignKeys?.Who.model, 'Members');
    // The diagram resolves the key to the physical (qualified) node.
    asserts.assertStringIncludes(
      toMermaidERD(db),
      'follows }o--|| usrgrp_usr : "Who"',
    );
  });

  it('a QUERY reading from itself is terminal — rejected', () => {
    const SelfQ = Entity('selfq', { x: Column.integer() }, {
      type: 'QUERY',
      query: {
        type: 'SELECT',
        table: 'selfq',
        columns: ['x'],
        projection: { '@x': true },
      },
    });
    asserts.assertThrows(() => Schema('S', { SelfQ }), Error, 'terminal');
  });

  it('a schema-qualified table read is not mistaken for a QUERY read', () => {
    const X = Entity('x', { id: Column.integer() }, {
      pk: ['id'],
      dbSchema: 's',
    });
    const XQ = Entity('x', { id: Column.integer() }, {
      type: 'QUERY',
      query: {
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { '@id': true },
      },
    });
    // Reads `{ schema: 's', table: 'x' }` — unambiguously the TABLE
    // s.x, even though a QUERY with the bare name 'x' is registered.
    const V = Entity('v_over_x', { id: Column.integer() }, {
      type: 'VIEW',
      query: {
        type: 'SELECT',
        schema: 's',
        table: 'x',
        columns: ['id'],
        projection: { '@id': true },
      },
    });
    const ok = Schema('S', { Users, X, XQ, V });
    asserts.assertEquals(Object.keys(ok.entities).length, 4);
  });

  // ── use() — composition ───────────────────────────────────────────

  it('use() merges schemas; registry keys stay unique across them', () => {
    const Blog = Schema('Blog', { Users, Posts, Comments, ActivePosts });
    const Stats = Schema('Stats', { VisitorStats });

    const db = use(Blog, Stats);
    asserts.assertEquals(Object.keys(db).sort(), [
      'ActivePosts',
      'Comments',
      'Posts',
      'Users',
      'VisitorStats',
    ]);
    type _row = Expect<
      Equal<
        RowOf<typeof db['VisitorStats']>,
        { day: Date; path: string; hits: number }
      >
    >;

    const AlsoUsers = Schema('Wat', {
      Users: Entity('users2', { id: Column.integer() }, { pk: ['id'] }),
    });
    asserts.assertThrows(
      () => use(Blog, AlsoUsers),
      Error,
      "provided by both 'Blog' and 'Wat'",
    );
  });

  it('resolves cross-schema string FKs at use(); missing targets are named errors', () => {
    // Comments (string FKs to 'posts'/'users') lives in its OWN schema.
    const Extras = Schema('Extras', { Comments });
    const Blog = Schema('Blog', { Users, Posts });

    // Composed together: resolves fine.
    const db = use(Blog, Extras);
    asserts.assertEquals(Object.keys(db).length, 3);

    // Composed WITHOUT the providing schema: named failure.
    asserts.assertThrows(
      () => use(Extras),
      Error,
      "references entity key 'Posts', which is not registered",
    );
  });

  it('QUERY stays terminal across composed schemas', () => {
    const OverQuery = Entity('over_query', { role: Column.varchar(32) }, {
      type: 'QUERY',
      query: {
        type: 'SELECT',
        table: 'role_counts', // reads FROM a QUERY — terminal violation
        columns: ['role'],
        projection: { '@role': true },
      },
    });
    asserts.assertThrows(
      () => use(Schema('A', { RoleCounts }), Schema('B', { Users, OverQuery })),
      Error,
      'terminal',
    );

    // Views remain composable: a QUERY over a VIEW is fine.
    const OverView = Entity('over_view', { id: Column.integer() }, {
      type: 'QUERY',
      query: {
        type: 'SELECT',
        table: 'active_posts',
        columns: ['id'],
        projection: { '@id': true },
      },
    });
    const ok = use(
      Schema('A', { Users, Posts, ActivePosts }),
      Schema('B', { OverView }),
    );
    asserts.assertEquals(Object.keys(ok).length, 4);
  });

  it('mutual FKs via entity keys compose AND serialize (no cycles)', () => {
    // Reciprocal FKs: A→B is aliased 'B', B→A is aliased 'A'. Each FK's
    // DERIVED reverse is the bare source key, landing on the other entity
    // as 'A'/'B' — where it would collide with that entity's own FK alias
    // (FK aliases resolve first). use() now catches that, so name the
    // reverses explicitly; this stays a valid, instance-constructible schema.
    const A = Entity('alpha', {
      id: Column.integer(),
      bId: Column.integer().nullable(),
    }, {
      pk: ['id'],
      fk: { B: { model: 'B', on: { bId: 'id' }, reverseAs: 'Alphas' } },
    });
    const B = Entity('beta', {
      id: Column.integer(),
      aId: Column.integer().nullable(),
    }, {
      pk: ['id'],
      fk: { A: { model: 'A', on: { aId: 'id' }, reverseAs: 'Betas' } },
    });
    const db = use(Schema('Cyc', { A, B }));
    // An object-embedding design would throw on this stringify.
    const json = JSON.parse(JSON.stringify(db));
    asserts.assertEquals(json.A.foreignKeys.B.model, 'B');
    asserts.assertEquals(json.B.foreignKeys.A.model, 'A');
  });

  // ── Documentation emitters ────────────────────────────────────────

  it('toMermaidERD: entity blocks, FK edges, derives edges', () => {
    const Blog = Schema('Blog', { Users, Posts, Comments, ActivePosts });
    const erd = toMermaidERD(use(Blog, Schema('Stats', { VisitorStats })));

    asserts.assertStringIncludes(erd, 'erDiagram');
    asserts.assertStringIncludes(erd, 'users {');
    asserts.assertStringIncludes(erd, 'UUID id PK');
    asserts.assertStringIncludes(erd, 'stats_visitor_stats {');
    asserts.assertStringIncludes(erd, 'posts }o--|| users : "Author"');
    asserts.assertStringIncludes(erd, 'comments }o--|| posts : "Post"');
    asserts.assertStringIncludes(erd, 'active_posts ||..|| posts : "derives"');
    // Accepts a SchemaValue directly too.
    asserts.assertStringIncludes(toMermaidERD(Blog), 'erDiagram');
  });

  it('toPlantUML: @startuml block, PK/FK markers, FK + derives edges', () => {
    const Blog = Schema('Blog', { Users, Posts, Comments, ActivePosts });
    const puml = toPlantUML(use(Blog, Schema('Stats', { VisitorStats })));

    asserts.assertStringIncludes(puml, '@startuml');
    asserts.assertStringIncludes(puml, '@enduml');
    asserts.assertStringIncludes(puml, 'entity "users" as e_users {');
    asserts.assertStringIncludes(puml, '* id : UUID <<PK>>');
    asserts.assertStringIncludes(
      puml,
      'entity "stats.visitor_stats" as e_stats_visitor_stats {',
    );
    asserts.assertStringIncludes(puml, 'e_posts }o--|| e_users : Author');
    asserts.assertStringIncludes(puml, 'e_comments }o--|| e_posts : Post');
    asserts.assertStringIncludes(
      puml,
      'e_active_posts ||..|| e_posts : derives',
    );
    // Accepts a SchemaValue directly too.
    asserts.assertStringIncludes(toPlantUML(Blog), '@startuml');
  });

  it('toMarkdown: kinds, comments, constraints, keys, hooks', () => {
    const Hooked = Entity('hooked', {
      id: Column.integer().comment('surrogate key'),
      status: Column.varchar(16).lov(['on', 'off']),
      touched: Column.timestamp().defaultOnUpdate(() => new Date()),
    }, {
      pk: ['id'],
      comment: 'hook demo',
      hooks: { afterRead: (row) => row },
    });
    const md = toMarkdown(Schema('Docs', { Users, Posts, Hooked }));

    // GFM structure: blank lines separate heading / blockquote / table.
    asserts.assertStringIncludes(md, '## Users — `users` (TABLE)\n\n');
    asserts.assertStringIncludes(md, '> Registered accounts\n\n|');
    asserts.assertStringIncludes(md, 'encrypted+hash');
    // Pipes inside cells are escaped so the table never splits.
    asserts.assertStringIncludes(md, 'lov(active\\|banned)');
    asserts.assertStringIncludes(md, 'norm-owned'); // the hash sibling
    asserts.assertStringIncludes(md, '- **Primary key:** id');
    asserts.assertStringIncludes(
      md,
      '- **FK Author:** → Users (authorId → id)',
    );
    asserts.assertStringIncludes(md, 'surrogate key');
    asserts.assertStringIncludes(md, '- **Hooks:** afterRead');
    asserts.assertStringIncludes(md, 'expr:UUID');
    // Defaults stay positional: update-only ≠ insert-only.
    asserts.assertStringIncludes(md, '— / (generated)');
  });

  it('docs render VIEW logical FKs + reverse edges (M2M-via-view)', () => {
    // A view can carry LOGICAL join fks (never DDL) — the M2M-via-view
    // pattern. Docs must show them, not just physical TABLE fks.
    const PostsByAuthor = Entity('posts_by_author', {
      id: Column.integer(),
      authorId: Column.uuid(),
    }, {
      type: 'VIEW',
      query: {
        type: 'SELECT',
        table: 'posts',
        columns: ['id', 'authorId'],
        projection: { '@id': true, '@authorId': true },
      },
      fk: { Author: { model: 'Users', on: { authorId: 'id' } } },
    });
    const S = Schema('Blog', { Users, PostsByAuthor });

    const erd = toMermaidERD(S);
    // The view's FK column is marked, and its edge to the target renders.
    asserts.assertStringIncludes(erd, 'authorId FK');
    asserts.assertStringIncludes(
      erd,
      'posts_by_author }o--|| users : "Author"',
    );

    const md = toMarkdown(S);
    asserts.assertStringIncludes(md, '- **Reads from:** posts');
    asserts.assertStringIncludes(
      md,
      '- **FK Author:** → Users (authorId → id)',
    );
  });

  it('docs escape metacharacters (mermaid quotes, markdown pipes)', () => {
    const Q = Entity('quoted', {
      id: Column.integer().comment('the "answer" | id'),
    }, { pk: ['id'] });
    const erd = toMermaidERD({ Q });
    // Mermaid comment slots have no escape syntax — quotes substituted.
    asserts.assertStringIncludes(erd, `"the 'answer' | id"`);
    const md = toMarkdown({ Q });
    asserts.assertStringIncludes(md, 'the "answer" \\| id');
  });

  // ── snapshot() — the migration-diff export ────────────────────────

  it('snapshot(): DDL facts only — defaults/hooks/validators/QUERYs out', () => {
    const snap = snapshot(use(
      Schema('Blog', { Users, Posts, Comments, ActivePosts, RoleCounts }),
      Schema('Stats', { VisitorStats }),
    ));

    // QUERY entities have no DDL footprint.
    asserts.assertEquals('RoleCounts' in snap.entities, false);

    const users = snap.entities.Users!;
    asserts.assertEquals(users.kind, 'TABLE');
    // Defaults are SYSTEM-generated (Guardian .optional()), never
    // DDL — the expression default on id does not appear.
    asserts.assertEquals(users.columns.id, { type: 'UUID' });
    // lov is a Guardian concern, not a CHECK constraint.
    asserts.assertEquals(users.columns.status, {
      type: 'VARCHAR',
      length: 16,
    });
    // Storage-shaping flags DO appear.
    asserts.assertEquals(users.columns.email, {
      type: 'VARCHAR',
      length: 255,
      encrypt: true,
      hash: true,
    });

    // FK linkage stays on the ENTITY KEY (renames diff as ALTERs of
    // the target, never as linkage edits).
    asserts.assertEquals(
      snap.entities.Posts!.foreignKeys?.Author.model,
      'Users',
    );

    // Views carry their stored SELECT; dbSchema is preserved.
    asserts.assertEquals(snap.entities.ActivePosts!.kind, 'VIEW');
    asserts.assertEquals(snap.entities.VisitorStats!.dbSchema, 'stats');

    // Deterministic + JSON-clean: byte-equal across calls.
    const Blog = Schema('B2', { Users, Posts });
    asserts.assertEquals(
      JSON.stringify(snapshot(Blog)),
      JSON.stringify(snapshot(Blog)),
    );
  });
});
