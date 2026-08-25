# Examples

Real-world patterns. Each example is self-contained and runnable.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browsers](https://img.shields.io/badge/Browsers-4285F4?logo=googlechrome&logoColor=white)

## Table of Contents

- [HTTP request body validation](#http-request-body-validation)
- [Query string + form data](#query-string--form-data)
- [Environment variable parsing](#environment-variable-parsing)
- [Config file loading](#config-file-loading)
- [Database row → domain object](#database-row--domain-object)
- [Multi-step forms](#multi-step-forms)
- [Polymorphic events](#polymorphic-events)
- [Pagination response wrapper](#pagination-response-wrapper)
- [User registration with cross-field validation](#user-registration-with-cross-field-validation)
- [PATCH endpoint with partial updates](#patch-endpoint-with-partial-updates)
- [Recursive types — trees and linked lists](#recursive-types--trees-and-linked-lists)
- [Set / Map at the boundary](#set--map-at-the-boundary)
- [Mixin via intersection](#mixin-via-intersection)
- [Branded IDs for API safety](#branded-ids-for-api-safety)
- [Per-field error rendering with `leafErrors()`](#per-field-error-rendering-with-leaferrors)
- [Pre-trim + catchall for partially-typed payloads](#pre-trim--catchall-for-partially-typed-payloads)

## HTTP request body validation

```typescript
import { Guardian } from '@tundralibs/guardian';

declare const db: { posts: { insert(row: unknown): Promise<unknown> } };

const CreatePostBody = Guardian.object({
  title: Guardian.string().minLength(1).maxLength(200),
  body: Guardian.string().minLength(1),
  tags: Guardian.array(Guardian.string().minLength(1)).maxLength(10).optional(),
  draft: Guardian.boolean().optional(false),
});

type CreatePostBody = Guardian.infer<typeof CreatePostBody>;

async function handleCreatePost(req: Request): Promise<Response> {
  const [err, body] = CreatePostBody.safeParse(await req.json());
  if (err) {
    return Response.json({ error: err.message, fields: err.listCauses() }, {
      status: 400,
    });
  }
  // `body` is `CreatePostBody` here.
  const post = await db.posts.insert(body);
  return Response.json(post, { status: 201 });
}
```

## Query string + form data

Both arrive as strings; coerce-by-default handles them transparently.

```typescript
import { Guardian } from '@tundralibs/guardian';

const ListParams = Guardian.object({
  page: Guardian.number().integer().min(1).optional(1),
  limit: Guardian.number().integer().min(1).max(100).optional(20),
  sort: Guardian.enum(['asc', 'desc']).optional('asc'),
  q: Guardian.string().optional(),
});

function parseQuery(url: URL) {
  return ListParams.parse(Object.fromEntries(url.searchParams));
}

// URL: /posts?page=3&limit=50&sort=desc
parseQuery(new URL('https://x/posts?page=3&limit=50&sort=desc'));
// → { page: 3, limit: 50, sort: 'desc', q: undefined }
```

## Environment variable parsing

```typescript
import { Guardian } from '@tundralibs/guardian';

const Env = Guardian.object({
  PORT: Guardian.number().integer().validPort().optional(8080),
  NODE_ENV: Guardian.enum(['development', 'production', 'test']).optional(
    'development',
  ),
  DATABASE_URL: Guardian.string().url(),
  LOG_LEVEL: Guardian.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).caseInsensitive()
    .optional('INFO'),
  DEBUG: Guardian.boolean().optional(false),
});

declare const env: Record<string, string>;
const config = Env.parse(env);
// PORT='3000' → config.port: 3000
// DEBUG='yes' → config.DEBUG: true
// LOG_LEVEL='debug' → config.LOG_LEVEL: 'DEBUG'  (canonical case)
```

## Config file loading

```typescript
import { Guardian } from '@tundralibs/guardian';

const RetryPolicy = Guardian.object({
  maxAttempts: Guardian.number().integer().min(1).max(10),
  initialDelayMs: Guardian.number().integer().min(0),
  backoffFactor: Guardian.number().min(1).max(10),
});

const Config = Guardian.object({
  appName: Guardian.string().minLength(1),
  serverPort: Guardian.number().integer().validPort(),
  database: Guardian.object({
    host: Guardian.string(),
    port: Guardian.number().integer().validPort(),
    pool: Guardian.object({
      min: Guardian.number().integer().min(0),
      max: Guardian.number().integer().min(1).max(100),
    }),
  }),
  features: Guardian.record(Guardian.boolean()),
  retryPolicy: RetryPolicy.optional(),
});

declare const contents: string;
const config = Config.parse(JSON.parse(contents));
```

## Database row → domain object

```typescript
import { Guardian } from '@tundralibs/guardian';

// Raw row from a typed driver (still has stringly-typed columns sometimes).
type Row = {
  id: number;
  email: string;
  created_at: string; // ISO string from JSON over the wire
  role: string;
  metadata: string | null;
};

const User = Guardian.object({
  id: Guardian.number().integer().positive(),
  email: Guardian.string().email(),
  created_at: Guardian.date(), // coerces ISO string
  role: Guardian.enum(['admin', 'user', 'guest']),
  metadata: Guardian.preprocess(
    (m) => (typeof m === 'string' ? JSON.parse(m) : m),
    Guardian.unknown().nullable(),
  ),
}).transform((d) => ({
  // Camel-case the column names + parse metadata JSON.
  id: d.id,
  email: d.email,
  createdAt: d.created_at,
  role: d.role,
  metadata: d.metadata,
}));

type User = Guardian.infer<typeof User>;

const u = User.parse({
  id: 1,
  email: 'ada@example.com',
  created_at: '2026-01-15T10:30:00Z',
  role: 'admin',
  metadata: '{"theme":"dark"}',
});
```

## Multi-step forms

```typescript
import { Guardian } from '@tundralibs/guardian';

declare const allFormData: unknown;

const Step1 = Guardian.object({
  email: Guardian.string().email(),
  password: Guardian.string().minLength(8),
});

const Step2 = Step1.extend({
  firstName: Guardian.string().minLength(1),
  lastName: Guardian.string().minLength(1),
});

const Step3 = Step2.extend({
  acceptedTerms: Guardian.boolean().true('You must accept the terms'),
  newsletter: Guardian.boolean().optional(false),
});

// Each step validates its own slice; final submission validates the full shape.
const registration = Step3.parse(allFormData);
```

## Polymorphic events

```typescript
import { Guardian } from '@tundralibs/guardian';

const Event = Guardian.discriminatedUnion('type', [
  Guardian.object({
    type: Guardian.literal('user.created'),
    userId: Guardian.string().uuid(),
    email: Guardian.string().email(),
    at: Guardian.date(),
  }),
  Guardian.object({
    type: Guardian.literal('user.updated'),
    userId: Guardian.string().uuid(),
    changes: Guardian.record(Guardian.unknown()),
    at: Guardian.date(),
  }),
  Guardian.object({
    type: Guardian.literal('user.deleted'),
    userId: Guardian.string().uuid(),
    at: Guardian.date(),
  }),
]);

type Event = Guardian.infer<typeof Event>;

declare function onCreated(e: Event): void;
declare function onUpdated(e: Event): void;
declare function onDeleted(e: Event): void;

function handle(raw: unknown) {
  const event = Event.parse(raw);
  switch (event.type) {
    case 'user.created':
      return onCreated(event); // narrowed
    case 'user.updated':
      return onUpdated(event);
    case 'user.deleted':
      return onDeleted(event);
  }
}
```

## Pagination response wrapper

```typescript
import { type FinishedGuardian, Guardian } from '@tundralibs/guardian';

declare function fetchPosts(): Promise<unknown>;

function paginated<T>(
  item: FinishedGuardian<T>,
) {
  return Guardian.object({
    data: Guardian.array(item),
    page: Guardian.number().integer().min(1),
    totalPages: Guardian.number().integer().min(0),
    totalItems: Guardian.number().integer().min(0),
  });
}

const PostListResponse = paginated(Guardian.object({
  id: Guardian.number(),
  title: Guardian.string(),
}));

const response = PostListResponse.parse(await fetchPosts());
```

## User registration with cross-field validation

Catch every problem on the form in one pass:

```typescript
import { Guardian } from '@tundralibs/guardian';

declare const formData: unknown;
declare function highlightField(path: string, message: string): void;

const Register = Guardian.object({
  username: Guardian.string().minLength(3).maxLength(20).pattern(
    /^[a-z][a-z0-9_]*$/i,
  ),
  email: Guardian.string().email(),
  password: Guardian.string().minLength(8),
  confirmPassword: Guardian.string(),
  age: Guardian.number().integer().min(13).max(120),
  acceptedTerms: Guardian.boolean().true('You must accept the terms'),
}).superRefine([
  {
    validator: (d) => d.password === d.confirmPassword,
    message: 'passwords do not match',
    path: 'confirmPassword',
  },
  {
    validator: (d) => !d.password.includes(d.username),
    message: 'password must not contain your username',
    path: 'password',
  },
  {
    validator: (d) => /[A-Z]/.test(d.password) && /[0-9]/.test(d.password),
    message:
      'password must contain at least one uppercase letter and one digit',
    path: 'password',
  },
]);

const [err, user] = Register.safeParse(formData);
if (err) {
  // err.context.cause is { confirmPassword: ..., password: ... } — render per-field.
  for (const [path, e] of Object.entries(err.context.cause ?? {})) {
    highlightField(path, e.message);
  }
}
```

## PATCH endpoint with partial updates

```typescript
import { Guardian } from '@tundralibs/guardian';

declare const db: {
  users: { update(id: number, patch: unknown): Promise<unknown> };
};

const User = Guardian.object({
  id: Guardian.number().integer().positive(),
  name: Guardian.string().minLength(1).maxLength(50),
  email: Guardian.string().email(),
  bio: Guardian.string().maxLength(500),
});

// PATCH body: any subset of the user fields.
const PatchBody = User.omit('id').partial();

type PatchBody = Guardian.infer<typeof PatchBody>;
// { name?: string; email?: string; bio?: string }

async function patchUser(id: number, raw: unknown) {
  const [err, patch] = PatchBody.safeParse(raw);
  if (err) return { status: 400, body: { error: err.message } };

  const updated = await db.users.update(id, patch);
  return { status: 200, body: updated };
}

// PATCH /users/1 { "email": "new@example.com" }   → updates email only
// PATCH /users/1 {}                                → no-op (still valid)
```

## Recursive types — trees and linked lists

`Guardian.lazy(thunk)` defers the resolution of an inner guardian to parse time, so a schema can reference itself before it's fully assigned:

```typescript
import { BaseGuardian, Guardian } from '@tundralibs/guardian';

type Category = {
  id: string;
  name: string;
  children: Category[];
};

const CategorySchema: BaseGuardian<Category> = Guardian.object({
  id: Guardian.string().uuid(),
  name: Guardian.string().minLength(1),
  children: Guardian.array(Guardian.lazy(() => CategorySchema)),
});

CategorySchema.parse({
  id: 'a1b2…',
  name: 'Root',
  children: [
    { id: 'c1d2…', name: 'Child', children: [] },
  ],
});
```

The `BaseGuardian<Category>` annotation is needed so the recursive type checks — TypeScript can't infer a self-referencing type from the literal alone. Schema emit produces `{ $ref: '#' }` on the recursive visit, so `.toJSONSchema()` and `.toOpenAPI()` stay finite.

A `lazy()`-wrapped guardian carries its resolved schema's async-ness up to its parent container, so an async step behind `lazy()` is treated like any other async chain: `parse()` refuses with the "use `parseAsync()`" error and `parseAsync()` awaits and enforces it (rather than silently passing a pending `Promise` through).

This holds for **forward-referenced and recursive** schemas too — the case above, where the container is built before the thunk's target exists. The container can't resolve the thunk at construction time, so its async verdict stays provisional and is re-probed on the next `metaData` read (at the latest, when you call `parse()` / `parseAsync()`), by which point the binding is assigned. Declaration order therefore doesn't change the outcome:

```typescript
import { Guardian } from '@tundralibs/guardian';

// Container FIRST, target after — the canonical `lazy()` arrangement.
const Wrap = Guardian.object({ x: Guardian.lazy(() => Inner) });
const Inner = Guardian.string().refine(async (v) => v.length > 3, 'too short');

Wrap.metaData?.isAsync; // true
Wrap.parse({ x: 'no' }); // throws — "Use parseAsync() instead."
await Wrap.parseAsync({ x: 'no' });
// rejects — 'Object validation failed with 1 error(s)', with
// err.context.cause.x.message === 'too short'
```

## Set / Map at the boundary

JSON has neither `Set` nor `Map`, so wire formats arrive as arrays or objects. Guardian validates them against your declared collection type:

```typescript
import { Guardian } from '@tundralibs/guardian';

const Tags = Guardian.set(Guardian.string().minLength(1));

Tags.parse(['guardian', 'validation', 'guardian']);
// → Set { 'guardian', 'validation' }   ← deduplicated

const Headers = Guardian.map(Guardian.string(), Guardian.string());

Headers.parse({ 'x-trace-id': 'abc', 'x-user-id': 'u1' });
// → Map { 'x-trace-id' => 'abc', 'x-user-id' => 'u1' }

const NumericLookup = Guardian.map(Guardian.number(), Guardian.string());
NumericLookup.parse([[1, 'one'], [2, 'two']]);
// → Map<number, string>   ← array-of-pairs form for non-string keys
```

## Mixin via intersection

Combine two independent schemas without restructuring either. Useful when shapes come from separate packages or domains:

```typescript
import { Guardian } from '@tundralibs/guardian';

const Identified = Guardian.object({
  id: Guardian.string().uuid(),
  createdAt: Guardian.date(),
});

const Named = Guardian.object({
  name: Guardian.string().minLength(1),
  description: Guardian.string().optional(),
});

const NamedEntity = Guardian.intersection(Identified, Named);

const user = NamedEntity.parse({
  id: crypto.randomUUID(),
  createdAt: new Date(),
  name: 'Ada',
});
// Right side wins on key conflicts — matches `extend()` semantics.
```

## Branded IDs for API safety

Wrap UUID-shaped string IDs in a nominal brand so mixing them up is a compile error:

```typescript ignore
const UserId = Guardian.string().uuid().brand<'UserId'>();
const OrderId = Guardian.string().uuid().brand<'OrderId'>();

type UserId = Guardian.infer<typeof UserId>;
type OrderId = Guardian.infer<typeof OrderId>;

async function loadUser(id: UserId): Promise<User> {/* … */}
async function loadOrder(id: OrderId): Promise<Order> {/* … */}

const u = UserId.parse(crypto.randomUUID());
const o = OrderId.parse(crypto.randomUUID());

loadUser(u); // ✅
loadUser(o); // ❌ compile error: OrderId not assignable to UserId
```

`.brand<B>()` is purely a type-level operation — the runtime cost is zero. Use it for IDs, currency codes, opaque tokens, or anywhere a primitive type is too forgiving.

## Per-field error rendering with `leafErrors()`

For form-style UIs, walk every leaf failure with its absolute path:

```typescript
import { Guardian } from '@tundralibs/guardian';

declare function highlightField(path: string, message: string): void;

const Order = Guardian.object({
  customer: Guardian.object({
    email: Guardian.string().email(),
    age: Guardian.number().integer().min(18),
  }),
  items: Guardian.array(
    Guardian.object({
      sku: Guardian.string().minLength(1),
      qty: Guardian.number().integer().min(1),
    }),
  ).minLength(1),
});

const [err] = Order.safeParse({
  customer: { email: 'not-an-email', age: 12 },
  items: [{ sku: '', qty: 0 }],
});

if (err) {
  for (const { path, error } of err.leafErrors()) {
    highlightField(path.join('.'), error.message);
  }
  // customer.email → Invalid email...
  // customer.age   → Number must be at least 18
  // items.0.sku    → String must be at least 1 characters long
  // items.0.qty    → Number must be at least 1
}
```

Numeric path segments (like `0` above) preserve the index — read `path` directly if you need to distinguish array indices from object keys.

## Pre-trim + catchall for partially-typed payloads

Normalise incoming strings with `Guardian.preprocess`, then accept extra metadata fields via `.catchall()`:

```typescript
import { Guardian } from '@tundralibs/guardian';

const Trimmed = Guardian.preprocess(
  (v) => typeof v === 'string' ? v.trim() : v,
  Guardian.string().minLength(1),
);

const FeatureFlag = Guardian.object({
  name: Trimmed,
  enabled: Guardian.boolean(),
}).catchall(Trimmed); // every extra key's value must also be a non-empty trimmed string

FeatureFlag.parse({
  name: '  beta-checkout  ',
  enabled: 'yes',
  rolloutCohort: '  internal  ',
  releaseTrain: 'q2-26',
});
// → { name: 'beta-checkout', enabled: true, rolloutCohort: 'internal', releaseTrain: 'q2-26' }
```

`catchall` is a fourth object-mode (alongside `strip`/`passthrough`/`strict`): unknown keys are kept, **but** every value must satisfy the catchall guardian. Useful for partially-typed bags like feature-flag payloads, tracing tags, or i18n message tables.

---

[← Back to Guardian](../README.md)
