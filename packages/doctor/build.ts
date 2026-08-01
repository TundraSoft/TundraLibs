/**
 * @fileoverview Dev-time codegen that scans `@Vial`-decorated classes and writes
 * a `VialRegistry` type augmentation, so `inject('ClassName')` is typed without
 * importing the class. Runs under Deno (uses `Deno.readDir`/`writeTextFile`).
 *
 * @module
 */

/** Options for {@link build}. */
export interface BuildOptions {
  /**
   * Directories or files to scan (recursively) for `@Vial` usages.
   * Declaration (`*.d.ts`), test (`*.test.ts`), and bench
   * (`*.bench.ts`) files are skipped — test-only vials must not leak
   * into a production registry.
   */
  roots: string[];
  /** Path of the registry file to (over)write. */
  out: string;
  /**
   * Module specifier to augment. Defaults to `'@tundralibs/doctor'`; set a
   * relative path when the registry file references the package by path.
   */
  module?: string;
}

/** One discovered `@Vial(...) class Name` registration. */
export interface VialSite {
  /** The token — equal to the class name. */
  token: string;
  /** The class name (used both as the token and the type). */
  className: string;
  /** Source file the class is declared in. */
  file: string;
}

// The scan stays textual (no TS parser), but in two hardened passes:
// comments and string contents are blanked first, then each `@Vial(`
// is matched against its balanced argument parens and a *bounded* gap
// to `class` — only whitespace, further decorators, and the `export` /
// `default` / `abstract` keywords may intervene. A `@Vial(` inside a
// comment, string, or unrelated expression therefore never registers.
const VIAL_OPEN_RE = /@Vial\(/g;
// Sticky (`y`) tokens for walking the bounded gap after `@Vial(...)`.
const GAP_WS_RE = /\s+/y;
const GAP_CLASS_RE = /class\s+([A-Za-z_$][\w$]*)/y;
const GAP_KEYWORD_RE = /(?:export|default|abstract)(?=\s)/y;
const GAP_DECORATOR_RE = /@[A-Za-z_$][\w$]*/y;

/**
 * Blank out line comments, block comments, and string-literal
 * contents so the scanner cannot match `@Vial(` written inside
 * either. Quotes and newlines survive (enclosed characters become
 * spaces), keeping the surrounding structure intact for the
 * positional scan.
 */
function sanitize(text: string): string {
  const out = text.split('');
  const blank = (from: number, to: number): void => {
    for (let j = from; j < to; j++) {
      if (out[j] !== '\n') out[j] = ' ';
    }
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '/' && next === '/') {
      const start = i;
      while (i < text.length && text[i] !== '\n') i++;
      blank(start, i);
    } else if (ch === '/' && next === '*') {
      const start = i;
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i = Math.min(i + 2, text.length);
      blank(start, i);
    } else if (ch === "'" || ch === '"' || ch === '`') {
      const start = ++i;
      while (i < text.length && text[i] !== ch) {
        if (text[i] === '\\') i++;
        else if (ch !== '`' && text[i] === '\n') break;
        i++;
      }
      blank(start, Math.min(i, text.length));
      if (i < text.length && text[i] === ch) i++;
    } else {
      i++;
    }
  }
  return out.join('');
}

/**
 * Given the index of an opening `(`, return the index just past its
 * matching `)`, or `-1` when the parens never balance.
 */
function skipBalanced(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i + 1;
  }
  return -1;
}

/**
 * From `from` (just past `@Vial(...)`'s closing paren), accept only
 * whitespace, further decorators, and `export` / `default` /
 * `abstract` before the `class` keyword. Returns the class name, or
 * `undefined` when anything else intervenes — meaning the `@Vial(`
 * belonged to unrelated code, not a decoration site.
 */
function matchClassName(text: string, from: number): string | undefined {
  let i = from;
  for (;;) {
    GAP_WS_RE.lastIndex = i;
    if (GAP_WS_RE.exec(text)) i = GAP_WS_RE.lastIndex;
    GAP_CLASS_RE.lastIndex = i;
    const cls = GAP_CLASS_RE.exec(text);
    if (cls) return cls[1];
    GAP_KEYWORD_RE.lastIndex = i;
    if (GAP_KEYWORD_RE.exec(text)) {
      i = GAP_KEYWORD_RE.lastIndex;
      continue;
    }
    GAP_DECORATOR_RE.lastIndex = i;
    if (GAP_DECORATOR_RE.exec(text)) {
      i = GAP_DECORATOR_RE.lastIndex;
      if (text[i] === '(') {
        const after = skipBalanced(text, i);
        if (after === -1) return undefined;
        i = after;
      }
      continue;
    }
    return undefined;
  }
}

/**
 * Whether `path` is a scannable source file — `.ts`, excluding
 * declaration, test, and bench files.
 */
function isSource(path: string): boolean {
  return path.endsWith('.ts') && !path.endsWith('.d.ts') &&
    !path.endsWith('.test.ts') && !path.endsWith('.bench.ts');
}

async function* walk(path: string): AsyncGenerator<string> {
  const info = await Deno.stat(path);
  if (info.isFile) {
    if (isSource(path)) yield path;
    return;
  }
  for await (const entry of Deno.readDir(path)) {
    const child = `${path.replace(/\/$/, '')}/${entry.name}`;
    if (entry.isDirectory) {
      yield* walk(child);
    } else if (entry.isFile && isSource(child)) {
      yield child;
    }
  }
}

/** Compute a relative import specifier from `fromFile` to `toFile`. */
export function relativeImport(fromFile: string, toFile: string): string {
  const fromDir = fromFile.split('/').slice(0, -1);
  const to = toFile.split('/');
  let i = 0;
  while (i < fromDir.length && i < to.length - 1 && fromDir[i] === to[i]) i++;
  const ups = fromDir.slice(i).map(() => '..');
  const spec = [...ups, ...to.slice(i)].join('/');
  return spec.startsWith('.') ? spec : `./${spec}`;
}

/** Scan `roots` for `@Vial`-decorated classes. Exposed for testing. */
export async function scan(roots: string[], out?: string): Promise<VialSite[]> {
  const sites: VialSite[] = [];
  for (const root of roots) {
    for await (const file of walk(root)) {
      if (out && file === out) continue;
      const text = sanitize(await Deno.readTextFile(file));
      VIAL_OPEN_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = VIAL_OPEN_RE.exec(text)) !== null) {
        // `m.index + m[0].length - 1` is the decorator's opening `(`.
        const argsEnd = skipBalanced(text, m.index + m[0].length - 1);
        if (argsEnd === -1) break;
        const name = matchClassName(text, argsEnd);
        if (name !== undefined) {
          sites.push({ token: name, className: name, file });
        }
        VIAL_OPEN_RE.lastIndex = argsEnd;
      }
    }
  }
  return sites;
}

/** Render the registry source from discovered sites. Exposed for testing. */
export function render(
  sites: VialSite[],
  out: string,
  moduleSpec: string,
): string {
  // Dedupe by token (last wins) and sort for stable output.
  const byToken = new Map<string, VialSite>();
  for (const s of sites) byToken.set(s.token, s);
  const entries = [...byToken.values()].sort((a, b) =>
    a.token.localeCompare(b.token)
  );

  const imports = entries.map((e) =>
    `import type { ${e.className} } from '${relativeImport(out, e.file)}';`
  );
  const members = entries.map((e) => `    ${e.token}: ${e.className};`);

  return [
    '// AUTO-GENERATED by @tundralibs/doctor/build — do not edit by hand.',
    ...imports,
    '',
    `declare module '${moduleSpec}' {`,
    '  interface VialRegistry {',
    ...members,
    '  }',
    '}',
    '',
  ].join('\n');
}

/**
 * Scan `options.roots` for `@Vial`-decorated classes and write the generated
 * {@link VialRegistry} declaration to `options.out`.
 *
 * The token is the class name, so names must be unique and survive
 * minification; factory-registered vials (no `@Vial`) are not scanned and must
 * be added to the registry by hand.
 *
 * @returns The discovered sites (token → class → file).
 *
 * @example
 * ```ts
 * import { build } from '@tundralibs/doctor/build';
 * await build({ roots: ['./src'], out: './src/vial-registry.ts' });
 * ```
 */
export async function build(options: BuildOptions): Promise<VialSite[]> {
  const moduleSpec = options.module ?? '@tundralibs/doctor';
  const sites = await scan(options.roots, options.out);
  await Deno.writeTextFile(options.out, render(sites, options.out, moduleSpec));
  return sites;
}
