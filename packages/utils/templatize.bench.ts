import { bench } from '@tundralibs/compat/bench';
import { templatize } from './templatize.ts';

// ============================================================
// Compile cost — paid once at construction
// ============================================================
bench({
  name: 'utils.templatize / compile — 2 vars',
  group: 'compile',
}, () => {
  templatize('Hello, ${name}! Today is ${day}.');
});

bench({
  name: 'utils.templatize / compile — no vars (all-literal fast path)',
  group: 'compile',
}, () => {
  templatize('Static text with no variables at all');
});

bench({
  name: 'utils.templatize / compile — 10 vars',
  group: 'compile',
}, () => {
  templatize(
    '${a} ${b} ${c} ${d} ${e} ${f} ${g} ${h} ${i} ${j}',
  );
});

// ============================================================
// Render cost — paid per call after compile
// ============================================================
const t2 = templatize('Hello, ${name}! Today is ${day}.');
const tStatic = templatize('Static text with no variables at all');
const t10 = templatize(
  '${a} ${b} ${c} ${d} ${e} ${f} ${g} ${h} ${i} ${j}',
);
const tNested = templatize('${user.name} (${user.email}) ${msg}');
const tLiteral = templatize('${present}/${missing}', { onMissing: 'literal' });
const tEmpty = templatize('${present}/${missing}', { onMissing: 'empty' });

bench({
  name: 'utils.templatize / render — 2 vars',
  group: 'render',
}, () => {
  t2({ name: 'Alice', day: 'Monday' });
});

bench({
  name: 'utils.templatize / render — all-literal (constant function)',
  group: 'render',
}, () => {
  // deno-lint-ignore no-explicit-any
  tStatic({} as any);
});

bench({
  name: 'utils.templatize / render — 10 vars',
  group: 'render',
}, () => {
  t10({
    a: '1',
    b: '2',
    c: '3',
    d: '4',
    e: '5',
    f: '6',
    g: '7',
    h: '8',
    i: '9',
    j: '10',
  });
});

bench({
  name: 'utils.templatize / render — dot-path on nested values',
  group: 'render',
}, () => {
  // deno-lint-ignore no-explicit-any -- bench fixture; nested dot-path context
  const ctx: any = {
    user: { name: 'Bob', email: 'bob@example.com' },
    msg: 'hi',
  };
  tNested(ctx);
});

bench({
  name: 'utils.templatize / render — onMissing: "literal"',
  group: 'render',
}, () => {
  // deno-lint-ignore no-explicit-any
  tLiteral({ present: 'x' } as any);
});

bench({
  name: 'utils.templatize / render — onMissing: "empty"',
  group: 'render',
}, () => {
  // deno-lint-ignore no-explicit-any
  tEmpty({ present: 'x' } as any);
});
