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

/** A `:name:` placeholder; capture group 1 is the name. */
const NAME = String.raw`(?<!:):([A-Za-z_]\w*):`;
const SINGLE = String.raw`'[^']*(?:''[^']*)*(?:'|$)`;
const SINGLE_BACKSLASH = String.raw`'[^'\\]*(?:(?:\\[\s\S]|'')[^'\\]*)*(?:'|$)`;
const DOUBLE = String.raw`"[^"]*(?:""[^"]*)*(?:"|$)`;
const DOUBLE_BACKSLASH = String.raw`"[^"\\]*(?:(?:\\[\s\S]|"")[^"\\]*)*(?:"|$)`;
const BACKTICK = '`[^`]*(?:``[^`]*)*(?:`|$)';
const BRACKET = String.raw`\[[^\]]*(?:\]|$)`;
const LINE_COMMENT = String.raw`--[^\n]*`;
const BLOCK_COMMENT = String.raw`\/\*[\s\S]*?(?:\*\/|$)`;
/**
 * Postgres `E'…'`: the `E` must not end an identifier. The match starts at the
 * quote, so the scan does not stop at every `e` in the statement.
 */
const ESCAPE_STRING = String.raw`(?<=(?<![\w$])[eE])` + SINGLE_BACKSLASH;
/**
 * Postgres `$$…$$` / `$tag$…$tag$`: the opening `$` must not end an identifier.
 * The tag is capture group 2, after {@link NAME}'s; a named group would make
 * every scan markedly slower.
 */
const DOLLAR_TAG = String.raw`[A-Za-z_\u0080-\uFFFF][\w\u0080-\uFFFF]*`;
const DOLLAR = String.raw`(?<![\w$])\$(${DOLLAR_TAG})?\$` +
  String.raw`[\s\S]*?(?:\$\2\$|$)`;
/** MariaDB comments: `#`, and `--` only when a space or control character follows. */
const MARIA_LINE_COMMENT = String.raw`(?:#|--(?=[\x00-\x20]|$))[^\n]*`;

const scanner = (...skip: string[]): RegExp =>
  new RegExp([NAME, ...skip].join('|'), 'g');

const SCANNERS: ReadonlyMap<string, RegExp> = new Map([
  [
    'postgres',
    scanner(
      ESCAPE_STRING,
      SINGLE,
      DOUBLE,
      DOLLAR,
      LINE_COMMENT,
      BLOCK_COMMENT,
    ),
  ],
  [
    'maria',
    scanner(
      SINGLE_BACKSLASH,
      DOUBLE_BACKSLASH,
      BACKTICK,
      MARIA_LINE_COMMENT,
      BLOCK_COMMENT,
    ),
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
 * Replaces every `:name:` placeholder outside quoted text and comments with
 * what `replace` returns for its name, calling `replace` once per occurrence,
 * left to right. The scanners are shared, so `replace` must not call back in.
 *
 * @param sql - The statement.
 * @param dialect - The engine's translator dialect; an unknown one gets the
 *   standard SQL quoting rules.
 * @param replace - Returns the text that stands in for one placeholder.
 * @returns The statement with every placeholder replaced.
 */
export function replacePlaceholders(
  sql: string,
  dialect: string,
  replace: (name: string) => string,
): string {
  const re = SCANNERS.get(dialect) ?? DEFAULT_SCANNER;
  re.lastIndex = 0;
  let out = '';
  let last = 0;
  for (let m = re.exec(sql); m !== null; m = re.exec(sql)) {
    if (m[1] === undefined) continue;
    out += sql.slice(last, m.index) + replace(m[1]);
    last = re.lastIndex;
  }
  return last === 0 ? sql : out + sql.slice(last);
}
