/**
 * @module
 *
 * The one `:name:` placeholder scanner every SQL engine rewrites through, so
 * the engines cannot drift apart on what counts as a placeholder.
 *
 * A placeholder is a colon, a letter or underscore, word characters, and a
 * closing colon. A colon that follows a colon never opens one, so a Postgres
 * cast chain such as `x::date::text` passes through. Placeholders are found
 * only outside quoted text and comments; what quotes and comments look like is
 * per dialect, and the per-dialect rules are listed in
 * `docs/Drivers-SQLEngine.md` under "Named parameters".
 */

/**
 * A `:name:` placeholder; capture group 1 is the name. No pattern here uses a
 * lookbehind, which Safari before 16.4 cannot parse: the character before a
 * match is checked in {@link replacePlaceholders}.
 */
const NAME = String.raw`:([A-Za-z_]\w*):`;
const SINGLE = String.raw`'[^']*(?:''[^']*)*(?:'|$)`;
const SINGLE_BACKSLASH = String.raw`'[^'\\]*(?:(?:\\[\s\S]|'')[^'\\]*)*(?:'|$)`;
const DOUBLE = String.raw`"[^"]*(?:""[^"]*)*(?:"|$)`;
const DOUBLE_BACKSLASH = String.raw`"[^"\\]*(?:(?:\\[\s\S]|"")[^"\\]*)*(?:"|$)`;
const BACKTICK = '`[^`]*(?:``[^`]*)*(?:`|$)';
const BRACKET = String.raw`\[[^\]]*(?:\]|$)`;
const LINE_COMMENT = String.raw`--[^\n]*`;
const BLOCK_COMMENT = String.raw`\/\*[\s\S]*?(?:\*\/|$)`;
/** The opener of a Postgres `$$…$$` / `$tag$…$tag$`, which its closer repeats. */
const DOLLAR_TAG = String.raw`[A-Za-z_\u0080-\uFFFF][\w\u0080-\uFFFF]*`;
const DOLLAR_OPEN = String.raw`\$(?:${DOLLAR_TAG})?\$`;
/** MariaDB comments: `#`, and `--` only when a space or control character follows. */
const MARIA_LINE_COMMENT = String.raw`(?:#|--(?=[\x00-\x20]|$))[^\n]*`;
/** Postgres `E'…'`, matched from its quote once the `E` is known to open it. */
const ESCAPE_STRING = new RegExp(SINGLE_BACKSLASH, 'y');
/** A character that can end an identifier, so a `$` or `E` after it is part of it. */
const IDENT_CHAR = /[\w$]/;

const scanner = (...skip: string[]): RegExp =>
  new RegExp([NAME, ...skip].join('|'), 'g');

const SCANNERS: ReadonlyMap<string, RegExp> = new Map([
  [
    'postgres',
    // Dollar quotes and block comments: the opener alone, the end found by
    // `postgresSkipEnd`.
    scanner(SINGLE, DOUBLE, DOLLAR_OPEN, LINE_COMMENT, String.raw`\/\*`),
  ],
  [
    'sqlite',
    scanner(
      SINGLE,
      DOUBLE,
      BACKTICK,
      BRACKET,
      LINE_COMMENT,
      BLOCK_COMMENT,
    ),
  ],
]);
const DEFAULT_SCANNER = scanner(SINGLE, DOUBLE, LINE_COMMENT, BLOCK_COMMENT);

/**
 * A MariaDB scanner for one reading of quoted text. `quoted` finds what can
 * hide the end of an executable comment: a quoted run or a line comment.
 */
const mariaScanner = (single: string, double: string) => ({
  statement: scanner(
    single,
    double,
    BACKTICK,
    MARIA_LINE_COMMENT,
    BLOCK_COMMENT,
  ),
  quoted: new RegExp(
    [single, double, BACKTICK, MARIA_LINE_COMMENT].join('|'),
    'g',
  ),
});
const MARIA = mariaScanner(SINGLE_BACKSLASH, DOUBLE_BACKSLASH);
/** `ANSI_QUOTES`: a `"…"` run is an identifier, where a backslash is text. */
const MARIA_ANSI_QUOTES = mariaScanner(SINGLE_BACKSLASH, DOUBLE);
/** `NO_BACKSLASH_ESCAPES`: a backslash is text in every quoted run. */
const MARIA_NO_BACKSLASH = mariaScanner(SINGLE, DOUBLE);

/**
 * Replaces every `:name:` placeholder outside quoted text and comments with
 * what `replace` returns for its name, calling `replace` once per occurrence,
 * left to right. The scanners are shared, so `replace` must not call back in.
 *
 * @param sql - The statement.
 * @param dialect - The engine's translator dialect; an unknown one gets the
 *   standard SQL quoting rules.
 * @param replace - Returns the text that stands in for one placeholder. Its
 *   second argument is true for a placeholder inside a MariaDB executable
 *   comment, which a server may run or skip.
 * @param quotes - The MariaDB session's `sql_mode` flags that change how
 *   quoted text reads; other dialects ignore them.
 * @returns The statement with every placeholder replaced.
 */
export function replacePlaceholders(
  sql: string,
  dialect: string,
  replace: (name: string, executable: boolean) => string,
  quotes: { noBackslashEscapes?: boolean; ansiQuotes?: boolean } = {},
): string {
  const maria = dialect !== 'maria'
    ? undefined
    : quotes.noBackslashEscapes
    ? MARIA_NO_BACKSLASH
    : quotes.ansiQuotes
    ? MARIA_ANSI_QUOTES
    : MARIA;
  const re = maria?.statement ?? SCANNERS.get(dialect) ?? DEFAULT_SCANNER;
  const postgres = dialect === 'postgres';
  re.lastIndex = 0;
  let out = '';
  let last = 0;
  let executableEnd = 0;
  for (let m = re.exec(sql); m !== null; m = re.exec(sql)) {
    const at = m.index;
    if (m[1] !== undefined) {
      // A colon that follows a colon never opens a placeholder.
      if (sql[at - 1] === ':') {
        re.lastIndex = at + 1;
        continue;
      }
      out += sql.slice(last, at) + replace(m[1], at < executableEnd);
      last = re.lastIndex;
    } else if (postgres && sql[at] !== '"') {
      // A quoted identifier, the commonest match in OQL's SQL, needs no more
      // work. The text is read from `sql`, not `m[0]`, which is slow on Bun.
      re.lastIndex = postgresSkipEnd(sql, at, re.lastIndex);
    } else if (maria && sql[at] === '/') {
      // `/*!` and `/*M!` open an executable comment, whose body is code.
      const mark = sql[at + 2] === 'M' ? at + 3 : at + 2;
      if (sql[mark] !== '!') continue;
      executableEnd = executableCommentEnd(sql, mark + 1, maria.quoted);
      if (executableEnd === -1) break;
      re.lastIndex = mark + 1;
    }
  }
  return last === 0 ? sql : out + sql.slice(last);
}

/**
 * The index of the `*` + `/` that closes a MariaDB executable comment whose
 * body starts at `from`, or -1 when it has no one end. A server that runs the
 * body reads it as code and one that skips it stops at the first `*` + `/`,
 * so the two disagree when the body never closes, holds a comment opener or a
 * line comment, or has a quoted run that reaches past that closer.
 */
function executableCommentEnd(
  sql: string,
  from: number,
  quoted: RegExp,
): number {
  const end = sql.indexOf('*/', from);
  const nested = sql.indexOf('/*', from);
  if (end === -1 || (nested !== -1 && nested < end)) return -1;
  quoted.lastIndex = from;
  for (
    let m = quoted.exec(sql);
    m !== null && m.index < end;
    m = quoted.exec(sql)
  ) {
    const c = sql[m.index];
    if (c === '#' || c === '-' || quoted.lastIndex > end) return -1;
  }
  return end;
}

/** Whether the character before `index` can end an identifier. */
const endsIdent = (sql: string, index: number): boolean =>
  index > 0 && IDENT_CHAR.test(sql[index - 1]!);

/**
 * Where scanning resumes after the Postgres quote, quote opener or comment
 * opener that the scanner regex matched from `at` to `end`.
 *
 * - A dollar quote ends at the next copy of its opener. A `$` that ends an
 *   identifier opens none, so `a$b$c` is left alone: resume one character
 *   on.
 * - A `'` after an `E` that does not end an identifier opens an `E'…'`
 *   string, where a backslash escapes.
 * - A block comment nests, so it ends at the `*` + `/` that closes its own
 *   opener.
 */
function postgresSkipEnd(
  sql: string,
  at: number,
  end: number,
): number {
  const c = sql[at];
  if (c === '$') {
    if (endsIdent(sql, at)) return at + 1;
    const close = sql.indexOf(sql.slice(at, end), end);
    return close === -1 ? sql.length : close + end - at;
  }
  if (c === "'") {
    const e = sql[at - 1];
    if ((e !== 'e' && e !== 'E') || endsIdent(sql, at - 1)) return end;
    ESCAPE_STRING.lastIndex = at;
    // No match only for a string left open after a trailing backslash.
    return ESCAPE_STRING.exec(sql) === null
      ? sql.length
      : ESCAPE_STRING.lastIndex;
  }
  if (c === '/') return nestedCommentEnd(sql, end);
  return end;
}

/**
 * The index after the `*` + `/` that closes a block comment whose opener ends
 * at `from`, counting the openers nested inside it; the statement's length
 * when it never closes.
 */
function nestedCommentEnd(sql: string, from: number): number {
  let depth = 1;
  for (let i = from; i < sql.length - 1; i++) {
    const c = sql[i];
    if (c === '/' && sql[i + 1] === '*') {
      depth++;
      i++;
    } else if (c === '*' && sql[i + 1] === '/') {
      if (--depth === 0) return i + 2;
      i++;
    }
  }
  return sql.length;
}
