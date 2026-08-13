/**
 * @fileoverview Tests for the package root barrel (`mod.ts`) and the
 * package-wide invariants consumers depend on.
 *
 * Guards that the headline API is re-exported as a runtime VALUE, not
 * type-only. A `type`-only re-export is erased at runtime, so consumers
 * doing `import { WebServer } from '@tundralibs/compat'` would receive
 * `undefined` and `new WebServer(...)` would throw "not a constructor".
 *
 * Also guards that no module reintroduces top-level await — see the
 * `no top-level await` suite for why that is load-bearing.
 *
 * @module
 */

import { describe, it } from './test.ts';
import * as asserts from '@std/asserts';
import { readDirSync, readTextFileSync } from './file.ts';
import { join } from './path.ts';
import { WebServer } from './mod.ts';
import * as compat from './mod.ts';

/** Package root — this file sits at `packages/compat/mod.test.ts`. */
const PACKAGE_DIR = import.meta.dirname!;

/**
 * Files exempt from the no-top-level-await rule. `test.ts` loads the
 * runtime's native test framework (`@std/testing/bdd`, `bun:test`,
 * `node:test`), none of which is a built-in reachable through
 * `process.getBuiltinModule`, so a dynamic import is the only option.
 * It is a test-only entry point and never lands in an application
 * bundle's module graph.
 */
const TLA_EXEMPT = new Set(['test.ts']);

/**
 * Blank out comments and string/template literals so the brace-depth
 * scan below can't be fooled by a brace or the word `await` inside one.
 * Newlines survive so reported line numbers stay accurate.
 */
const stripNonCode = (src: string): string => {
  const out: string[] = [];
  let i = 0;
  const keep = (ch: string) => (ch === '\n' ? '\n' : ' ');
  while (i < src.length) {
    const ch = src[i]!;
    const next = src[i + 1];
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') out.push(keep(src[i++]!));
    } else if (ch === '/' && next === '*') {
      out.push(' ', ' ');
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out.push(keep(src[i++]!));
      }
      out.push(' ', ' ');
      i += 2;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      out.push(' ');
      i++;
      while (i < src.length && src[i] !== ch) {
        if (src[i] === '\\') {
          out.push(' ', ' ');
          i += 2;
          continue;
        }
        out.push(keep(src[i++]!));
      }
      out.push(' ');
      i++;
    } else {
      out.push(ch);
      i++;
    }
  }
  return out.join('');
};

/**
 * Does the `{` at `braceIdx` open a function body rather than a block?
 *
 * Brace depth alone can't answer "is this await inside a function": the
 * shape this package had to remove — `if (isNode) { x = await import(…) }`
 * — sits one brace deep and is still top-level await. So a `{` counts as
 * a function body when it follows `=>`, or follows a parameter list (with
 * an optional return-type annotation) whose head is not a control-flow
 * keyword.
 */
const opensFunction = (code: string, braceIdx: number): boolean => {
  // Scans backwards over indices — slicing the prefix per brace would
  // make this quadratic on a file the size of `file.ts`.
  let i = braceIdx - 1;
  const skipSpace = () => {
    while (i >= 0 && /\s/.test(code[i]!)) i--;
  };
  skipSpace();
  if (code[i] === '>' && code[i - 1] === '=') return true;
  if (code[i] !== ')') {
    // Maybe a return-type annotation: `(): Promise<void> {`. Anything
    // structural before the `:` means this is a plain block.
    while (i >= 0 && !'(){};:'.includes(code[i]!)) i--;
    if (code[i] !== ':') return false;
    i--;
    skipSpace();
    if (code[i] !== ')') return false;
  }
  // Walk back to the `(` that opens the parameter list.
  let depth = 0;
  for (; i >= 0; i--) {
    if (code[i] === ')') depth++;
    else if (code[i] === '(') {
      depth--;
      if (depth === 0) break;
    }
  }
  i--;
  skipSpace();
  const end = i + 1;
  while (i >= 0 && /[\w$]/.test(code[i]!)) i--;
  const head = code.slice(i + 1, end);
  return !['if', 'for', 'while', 'switch', 'catch'].includes(head);
};

/**
 * Return the 1-based line numbers holding a module-scope `await` — i.e.
 * top-level await. Walks the comment- and string-stripped source keeping
 * a stack of open braces (function body vs. plain block); an `await`
 * counts unless some enclosing brace opened a function. Concise arrow
 * bodies carry no brace, so `=>` without one opens a function scope that
 * runs to the end of the statement.
 */
const findTopLevelAwait = (src: string): number[] => {
  const code = stripNonCode(src);
  const hits: number[] = [];
  const scopes: boolean[] = [];
  let conciseArrow = false;
  let line = 1;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!;
    if (ch === '\n') line++;
    else if (ch === '{') scopes.push(opensFunction(code, i));
    else if (ch === '}') scopes.pop();
    else if (ch === ';') conciseArrow = false;
    else if (ch === '=' && code[i + 1] === '>') {
      const rest = code.slice(i + 2).replace(/^\s+/, '');
      conciseArrow = !rest.startsWith('{');
      i++;
    } else if (/[\w$]/.test(ch)) {
      if (
        code.startsWith('await', i) && !/[.\w$]/.test(code[i - 1] ?? ' ') &&
        /[\s(]/.test(code[i + 5] ?? '')
      ) {
        if (!conciseArrow && !scopes.includes(true)) hits.push(line);
        i += 4;
      } else {
        while (i + 1 < code.length && /[\w$]/.test(code[i + 1]!)) i++;
      }
    }
  }
  return hits;
};

/** Every `.ts` source in the package, excluding tests and fixtures. */
const sourceFiles = (dir: string, found: string[] = []): string[] => {
  for (const entry of readDirSync(dir)) {
    if (entry.isDirectory) {
      if (entry.name === 'fixtures' || entry.name === 'docs') continue;
      sourceFiles(join(dir, entry.name), found);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      found.push(join(dir, entry.name));
    }
  }
  return found;
};

describe('compat.mod (root barrel)', () => {
  it('re-exports WebServer as a runtime value (not type-only)', () => {
    // A type-only re-export is erased at runtime -> `undefined`.
    asserts.assertEquals(
      typeof WebServer,
      'function',
      'WebServer must be re-exported as a value from the package root',
    );
    asserts.assert(
      compat.WebServer !== undefined,
      'compat.WebServer must be defined on the namespace import',
    );
    asserts.assertStrictEquals(compat.WebServer, WebServer);
  });

  it('allows `new WebServer(...)` from the package root', () => {
    const server = new WebServer('RootExportTest', {
      mode: 'TCP',
      port: 8080,
      handler: () => new Response('ok'),
    });
    asserts.assert(
      server instanceof WebServer,
      'construction from the root export must succeed',
    );
    asserts.assertEquals(server.name, 'RootExportTest');
    asserts.assertEquals(server.mode, 'TCP');
  });
});

// =============================================================================
// No top-level await
// -----------------------------------------------------------------------------
// One top-level await anywhere in a module graph makes esbuild (wrangler)
// and Rollup (Vite) lower EVERY module initializer in that graph to an
// async function. Circular imports that are legal ESM and work natively —
// guardian's StringGuardian <-> DateGuardian, slogger's Slogger <->
// LogManager — then deadlock: `await init_A()` awaits `await init_B()`
// which awaits `init_A()`. compat sits under all of them, so a single TLA
// reintroduced here hangs those consumers' builds on import, with no error
// message to trace it by. Node built-ins must come from
// `process.getBuiltinModule` (see `loadBuiltin`) and npm packages from a
// dynamic import inside an async function.
// =============================================================================

describe('compat.mod (no top-level await)', () => {
  it('the detector flags module-scope await', () => {
    // Pins the detector itself — a scan that can no longer fail would
    // silently stop protecting the invariant.
    asserts.assertEquals(
      findTopLevelAwait(`const os = await import('node:os');\n`),
      [1],
    );
    asserts.assertEquals(
      // The exact shape this package removed: guarded, one brace deep,
      // and still top-level await.
      findTopLevelAwait(`if (isNode) {\n  x = await import('node:os');\n}\n`),
      [2],
      'a guarded top-level await is still top-level await',
    );
    asserts.assertEquals(
      findTopLevelAwait(`for (const m of mods) {\n  await load(m);\n}\n`),
      [2],
      'a module-scope loop body is not a function scope',
    );
  });

  it('the detector ignores await inside functions', () => {
    asserts.assertEquals(
      findTopLevelAwait(
        `async function f() {\n  const os = await import('node:os');\n}\n`,
      ),
      [],
    );
    asserts.assertEquals(
      findTopLevelAwait(
        `async function f(): Promise<void> {\n  if (x) {\n    await g();\n  }\n}\n`,
      ),
      [],
      'a return-type annotation still ends a parameter list',
    );
    asserts.assertEquals(
      findTopLevelAwait(
        `class A {\n  async m() {\n    await g();\n  }\n}\n`,
      ),
      [],
      'methods are function scopes',
    );
    asserts.assertEquals(
      findTopLevelAwait(`const f = async () => await load();\n`),
      [],
      'a concise arrow body is a function scope even without braces',
    );
    asserts.assertEquals(
      findTopLevelAwait(`const f = async () => {\n  await load();\n};\n`),
      [],
    );
    asserts.assertEquals(
      findTopLevelAwait(`const x = awaited;\nconst y = a.await;\n`),
      [],
      'only the `await` operator counts, not lookalike identifiers',
    );
    asserts.assertEquals(
      findTopLevelAwait(`// const os = await import('node:os');\n`),
      [],
      'commentary about top-level await is not top-level await',
    );
    asserts.assertEquals(
      findTopLevelAwait("const s = `await import('x')`;\n"),
      [],
      'a string mentioning it is not it either',
    );
  });

  it('no source module uses top-level await', () => {
    const files = sourceFiles(PACKAGE_DIR);
    asserts.assert(files.length > 10, 'walk must find the package sources');

    const offenders: string[] = [];
    for (const file of files) {
      const name = file.slice(PACKAGE_DIR.length + 1);
      if (TLA_EXEMPT.has(name)) continue;
      for (const line of findTopLevelAwait(readTextFileSync(file))) {
        offenders.push(`${name}:${line}`);
      }
    }
    asserts.assertEquals(
      offenders,
      [],
      `top-level await found — this async-poisons consumer bundles: ${
        offenders.join(', ')
      }`,
    );
  });

  it('test.ts is the only exemption, and it is still exempt for cause', () => {
    // If test.ts ever stops using TLA the exemption should go with it.
    asserts.assert(
      findTopLevelAwait(readTextFileSync(join(PACKAGE_DIR, 'test.ts')))
        .length > 0,
      'test.ts no longer needs its exemption — drop it from TLA_EXEMPT',
    );
  });
});
