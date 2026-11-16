/**
 * @fileoverview Tests for the shared `:name:` placeholder scanner.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { replacePlaceholders } from './placeholders.ts';

/**
 * Rewrites every placeholder to `<name>`, or `<name!>` inside an executable
 * comment, and returns the names seen, in order.
 */
const scan = (
  sql: string,
  dialect: string,
  quotes?: Parameters<typeof replacePlaceholders>[3],
): [string, string[]] => {
  const names: string[] = [];
  const out = replacePlaceholders(sql, dialect, (name, executable) => {
    names.push(name);
    return executable ? `<${name}!>` : `<${name}>`;
  }, quotes);
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
      // Postgres block comments nest; the others end at the first close.
      [
        'postgres',
        `/* a /* :a: */ :a: ' */ :b:`,
        `/* a /* :a: */ :a: ' */ <b>`,
        ['b'],
      ],
      ['postgres', `:b:, E'x\\`, `<b>, E'x\\`, ['b']],
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
      ['sqlite', '/* /* :a: */ :b: */', '/* /* :a: */ <b> */', ['b']],
      ['maria', '/* /* :a: */ :b: */', '/* /* :a: */ <b> */', ['b']],
      // An unknown dialect: standard SQL quoting only.
      ['custom', '`:a:`, [:b:]', '`<a>`, [<b>]', ['a', 'b']],
    ];
    for (const [dialect, sql, expected, names] of cases) {
      asserts.assertEquals(scan(sql, dialect), [expected, names], sql);
    }
  });

  it('reads MariaDB quoted text by the session sql_mode', () => {
    const single = `'C:\\', :b:, ':c:'`;
    const double = `"C:\\", :b:, ":c:"`;
    const cases: Array<[string, Parameters<typeof scan>[2], string[]]> = [
      [single, {}, ['c']],
      [single, { ansiQuotes: true }, ['c']],
      [single, { noBackslashEscapes: true }, ['b']],
      [double, {}, ['c']],
      [double, { ansiQuotes: true }, ['b']],
      [double, { noBackslashEscapes: true }, ['b']],
    ];
    for (const [sql, quotes, names] of cases) {
      asserts.assertEquals(scan(sql, 'maria', quotes)[1], names, sql);
    }
    // The flags are MariaDB's: another dialect reads the text as before.
    asserts.assertEquals(
      scan(single, 'sqlite', { noBackslashEscapes: true }),
      scan(single, 'sqlite'),
    );
  });

  it('reads a MariaDB executable comment as code', () => {
    const cases: Array<[string, string]> = [
      ['1 /*! + :a: */ + :b: /* :c: */', '1 /*! + <a!> */ + <b> /* :c: */'],
      ['/*M!100000 :a: */, :b:', '/*M!100000 <a!> */, <b>'],
      [`/*!999999 ':x:' \`:y:\` :a: */`, `/*!999999 ':x:' \`:y:\` <a!> */`],
      // `/*M` without the `!` is an ordinary comment.
      ['/*M :a: */ :b:', '/*M :a: */ <b>'],
      // A body with no one end stops the scan: nothing from it on is bound.
      [':z: /*! :a:', '<z> /*! :a:'],
      [`:z: /*! 'x*/' :a: */ :b:`, `<z> /*! 'x*/' :a: */ :b:`],
      [':z: /*! :a: /* x */ */ :b:', '<z> /*! :a: /* x */ */ :b:'],
      [':z: /*! :a: # x\n */ :b:', '<z> /*! :a: # x\n */ :b:'],
      [':z: /*! :a: -- x\n */ :b:', '<z> /*! :a: -- x\n */ :b:'],
    ];
    for (const [sql, expected] of cases) {
      asserts.assertEquals(scan(sql, 'maria')[0], expected, sql);
    }
    // The body's quoted text follows the session too.
    const body = `/*! 'C:\\' :a: */`;
    asserts.assertEquals(scan(body, 'maria')[1], []);
    asserts.assertEquals(scan(body, 'maria', { noBackslashEscapes: true })[1], [
      'a',
    ]);
    // Only MariaDB has them.
    asserts.assertEquals(scan('/*! :a: */', 'sqlite')[1], []);
  });
});
