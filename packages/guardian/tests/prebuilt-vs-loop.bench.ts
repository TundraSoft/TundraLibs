// Pre-built schemas vs in-loop schemas — isolates build cost from parse cost.
// Both libraries are measured both ways for a fair head-to-head.

import { z } from 'npm:zod';
import { Guardian } from '../mod.ts';

const sampleObject = {
  id: 12345,
  name: 'John Doe',
  email: 'john.doe@example.com',
  age: 30,
  active: true,
  tags: ['developer', 'typescript', 'javascript'],
  metadata: {
    created: new Date('2023-01-01'),
    updated: new Date('2023-12-01'),
    version: 1.5,
  },
};
const sampleString = 'hello world';
const largeArray = Array.from({ length: 1000 }, (_, i) => i);

// Pre-built schemas — build once, reuse forever
const gStr = Guardian.string();
const zStr = z.string();

const gNum = Guardian.number();
const zNum = z.number();

const gObj = Guardian.object({
  id: Guardian.number().positive().integer(),
  name: Guardian.string().minLength(1).maxLength(100),
  email: Guardian.string().email(),
  age: Guardian.number().min(0).max(150).integer(),
  active: Guardian.boolean(),
  tags: Guardian.array(Guardian.string()),
  metadata: Guardian.object({
    created: Guardian.date(),
    updated: Guardian.date(),
    version: Guardian.number(),
  }),
});
const zObj = z.object({
  id: z.number().positive().int(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().min(0).max(150).int(),
  active: z.boolean(),
  tags: z.array(z.string()),
  metadata: z.object({
    created: z.date(),
    updated: z.date(),
    version: z.number(),
  }),
});

const gLargeArr = Guardian.array(Guardian.number());
const zLargeArr = z.array(z.number());

// ---------------------------------------------------------------------------
// Each group includes a `Baseline` run — the raw JS check that a validator
// _could not be faster than_. It puts Guardian/Zod numbers in context: a 4ns
// `String / Guardian` run is essentially indistinguishable from raw JS work,
// not a sign the framework is inefficient.
// ---------------------------------------------------------------------------

// String

Deno.bench('parse-only / String / Baseline (typeof)', {
  group: 'string',
  baseline: true,
}, () => {
  if (typeof sampleString !== 'string') throw new Error();
});
Deno.bench('parse-only / String / Guardian', { group: 'string' }, () => {
  gStr.parse(sampleString);
});
Deno.bench('parse-only / String / Zod', { group: 'string' }, () => {
  zStr.parse(sampleString);
});

// Number

Deno.bench('parse-only / Number / Baseline (typeof)', {
  group: 'number',
  baseline: true,
}, () => {
  if (typeof 42 !== 'number') throw new Error();
});
Deno.bench('parse-only / Number / Guardian', { group: 'number' }, () => {
  gNum.parse(42);
});
Deno.bench('parse-only / Number / Zod', { group: 'number' }, () => {
  zNum.parse(42);
});

// Object (the most representative real-world case)

Deno.bench(
  'parse-only / Object Complex / Baseline (manual)',
  { group: 'objComplex', baseline: true },
  () => {
    // Hand-rolled equivalent of `gObj` / `zObj`. Same set of checks, no
    // framework. This is the theoretical lower bound — every validator pays
    // overhead above this number.
    const o = sampleObject;
    if (typeof o.id !== 'number' || o.id <= 0 || !Number.isInteger(o.id)) {
      throw new Error();
    }
    if (
      typeof o.name !== 'string' || o.name.length < 1 || o.name.length > 100
    ) throw new Error();
    if (typeof o.email !== 'string' || !o.email.includes('@')) {
      throw new Error();
    }
    if (
      typeof o.age !== 'number' || o.age < 0 || o.age > 150 ||
      !Number.isInteger(o.age)
    ) throw new Error();
    if (typeof o.active !== 'boolean') throw new Error();
    if (!Array.isArray(o.tags)) throw new Error();
    for (const t of o.tags) if (typeof t !== 'string') throw new Error();
    if (typeof o.metadata !== 'object') throw new Error();
    if (!(o.metadata.created instanceof Date)) throw new Error();
    if (!(o.metadata.updated instanceof Date)) throw new Error();
    if (typeof o.metadata.version !== 'number') throw new Error();
  },
);
Deno.bench(
  'parse-only / Object Complex / Guardian',
  { group: 'objComplex' },
  () => {
    gObj.parse(sampleObject);
  },
);
Deno.bench('parse-only / Object Complex / Zod', { group: 'objComplex' }, () => {
  zObj.parse(sampleObject);
});

// Large array (1000 numbers)

Deno.bench(
  'parse-only / Large Array / Baseline (for-loop)',
  { group: 'largeArr', baseline: true },
  () => {
    if (!Array.isArray(largeArray)) throw new Error();
    for (const v of largeArray) if (typeof v !== 'number') throw new Error();
  },
);
Deno.bench('parse-only / Large Array / Guardian', { group: 'largeArr' }, () => {
  gLargeArr.parse(largeArray);
});
Deno.bench('parse-only / Large Array / Zod', { group: 'largeArr' }, () => {
  zLargeArr.parse(largeArray);
});

// Sanity: failure path with pre-built schemas

Deno.bench(
  'parse-only / Bad Type Throws / Baseline (typeof)',
  { group: 'bad', baseline: true },
  () => {
    try {
      if (typeof 'not a number' !== 'number') throw new Error();
    } catch { /* expected */ }
  },
);
Deno.bench('parse-only / Bad Type Throws / Guardian', { group: 'bad' }, () => {
  try {
    gNum.parse('not a number');
  } catch { /* expected */ }
});
Deno.bench('parse-only / Bad Type Throws / Zod', { group: 'bad' }, () => {
  try {
    zNum.parse('not a number');
  } catch { /* expected */ }
});

// safeParse failure (no throw)

Deno.bench(
  'parse-only / Bad Type safeParse / Baseline (typeof)',
  { group: 'safeBad', baseline: true },
  () => {
    // Mirrors `safeParse`'s contract — error tuple instead of a throw.
    const ok = typeof 'not a number' === 'number';
    const _result: [Error | null, unknown] = ok
      ? [null, 'not a number']
      : [new Error(), undefined];
  },
);
Deno.bench(
  'parse-only / Bad Type safeParse / Guardian',
  { group: 'safeBad' },
  () => {
    gNum.safeParse('not a number');
  },
);
Deno.bench(
  'parse-only / Bad Type safeParse / Zod',
  { group: 'safeBad' },
  () => {
    zNum.safeParse('not a number');
  },
);
