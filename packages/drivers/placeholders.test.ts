/**
 * @fileoverview Tests for the shared `:name:` placeholder scanner.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { replacePlaceholders } from './placeholders.ts';

/** Rewrites every placeholder to `<name>` and returns the names seen, in order. */
const scan = (sql: string, dialect: string): [string, string[]] => {
  const names: string[] = [];
  const out = replacePlaceholders(sql, dialect, (name) => {
    names.push(name);
    return `<${name}>`;
  });
  return [out, names];
};

describe('drivers.replacePlaceholders', () => {
  it('replaces each occurrence in order, repeats included, and keeps casts', () => {
    asserts.assertEquals(
      scan('SELECT :a:, :b:::int, x::date::text, :a:', 'postgres'),
      ['SELECT <a>, <b>::int, x::date::text, <a>', ['a', 'b', 'a']],
    );
  });

  it('skips quoted text and comments every dialect shares', () => {
    const sql = `SELECT ':a:', 'it''s :a:', "x"":a:", :b: -- :a:\n` +
      `/* :a: */ , :c:`;
    const expected = `SELECT ':a:', 'it''s :a:', "x"":a:", <b> -- :a:\n` +
      `/* :a: */ , <c>`;
    for (const dialect of ['postgres', 'maria', 'sqlite', 'custom']) {
      asserts.assertEquals(scan(sql, dialect), [expected, ['b', 'c']], dialect);
    }
  });

  it('runs an unterminated quote or comment to the end of the statement', () => {
    asserts.assertEquals(scan(`SELECT :b:, ':a:`, 'sqlite'), [
      `SELECT <b>, ':a:`,
      ['b'],
    ]);
    asserts.assertEquals(scan(`SELECT :b: /* :a:`, 'sqlite'), [
      `SELECT <b> /* :a:`,
      ['b'],
    ]);
  });

  it('applies each dialect its own quoting rules', () => {
    const cases: Array<[string, string, string, string[]]> = [
      // Postgres: a backslash escapes only in E'…'; dollar quotes; no `#`.
      ['postgres', `'C:\\', :b:`, `'C:\\', <b>`, ['b']],
      ['postgres', `E'it\\'s :a:', :b:`, `E'it\\'s :a:', <b>`, ['b']],
      ['postgres', `name'x\\', :b:`, `name'x\\', <b>`, ['b']],
      [
        'postgres',
        '$$:a:$$, $fn$ :a: $$ $fn$, :b:',
        '$$:a:$$, $fn$ :a: $$ $fn$, <b>',
        ['b'],
      ],
      ['postgres', 'a$b$c, :b:, $1', 'a$b$c, <b>, $1', ['b']],
      ['postgres', '`:a:`, # :b:', '`<a>`, # <b>', ['a', 'b']],
      // MariaDB: backslash escapes in both quotes; backtick; `#`; `-- `.
      ['maria', `'C:\\', :b:, ':c:'`, `'C:\\', :b:, '<c>'`, ['c']],
      ['maria', `"say \\":a:\\"", :b:`, `"say \\":a:\\"", <b>`, ['b']],
      ['maria', '`:a:`, :b: # :c:', '`:a:`, <b> # :c:', ['b']],
      ['maria', '5--:b:, 5 -- :c:', '5--<b>, 5 -- :c:', ['b']],
      ['maria', '$$:a:$$', '$$<a>$$', ['a']],
      // SQLite: no backslash escape; backtick and bracket identifiers.
      ['sqlite', `'C:\\', :b:`, `'C:\\', <b>`, ['b']],
      ['sqlite', '`:a:`, [:a:], :b:', '`:a:`, [:a:], <b>', ['b']],
      // An unknown dialect: standard SQL quoting only.
      ['custom', '`:a:`, [:b:]', '`<a>`, [<b>]', ['a', 'b']],
    ];
    for (const [dialect, sql, expected, names] of cases) {
      asserts.assertEquals(scan(sql, dialect), [expected, names], sql);
    }
  });
});
