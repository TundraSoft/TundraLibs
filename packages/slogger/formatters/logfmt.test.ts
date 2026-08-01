// deno-lint-ignore-file no-explicit-any
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { SyslogSeverities } from '@tundralibs/utils';
import { logfmtFormatter } from './logfmt.ts';
import type { SlogObject } from '../types/mod.ts';

const makeLog = (
  message: string,
  context: Record<string, unknown> = {},
): SlogObject => ({
  id: 'L1',
  appName: 'svc',
  hostname: 'h01',
  level: SyslogSeverities.INFO,
  levelName: 'INFO',
  context,
  message,
  date: new Date('2026-05-11T00:00:00Z'),
  isoDate: '2026-05-11T00:00:00.000Z',
  timestamp: 1778478400000,
});

describe('slogger.formatters.logfmt', () => {
  it('emits the default envelope in expected order', () => {
    const fmt = logfmtFormatter();
    const out = fmt(makeLog('hello'));
    asserts.assertEquals(
      out,
      'ts=2026-05-11T00:00:00.000Z level=info app=svc host=h01 msg=hello',
    );
  });

  it('quotes values containing space or `=` or `"`', () => {
    const fmt = logfmtFormatter();
    const out = fmt(makeLog('hello world = "test"'));
    // logfmt: quote the offending value, JSON-escape inner quotes
    asserts.assertStringIncludes(out, 'msg="hello world = \\"test\\""');
  });

  it('flattens nested context to dot-paths', () => {
    const fmt = logfmtFormatter();
    const out = fmt(makeLog('hi', {
      user: { id: 42, name: 'Alice' },
      ip: '10.0.0.1',
    }));
    asserts.assertStringIncludes(out, 'user.id=42');
    asserts.assertStringIncludes(out, 'user.name=Alice');
    asserts.assertStringIncludes(out, 'ip=10.0.0.1');
  });

  it('emits arrays as JSON literals', () => {
    const fmt = logfmtFormatter();
    const out = fmt(makeLog('hi', { tags: ['admin', 'beta'] }));
    asserts.assertStringIncludes(out, 'tags=["admin","beta"]');
  });

  it('handles null / undefined / empty', () => {
    const fmt = logfmtFormatter();
    const out = fmt(makeLog('hi', {
      a: null,
      b: '',
      c: undefined, // skipped
      d: 0,
      e: false,
    }));
    asserts.assertStringIncludes(out, 'a=null');
    asserts.assertStringIncludes(out, 'b=""');
    asserts.assert(!out.includes('c='), 'undefined should be skipped');
    asserts.assertStringIncludes(out, 'd=0');
    asserts.assertStringIncludes(out, 'e=false');
  });

  it('useNumericLevel option emits numeric severity', () => {
    const fmt = logfmtFormatter({ useNumericLevel: true });
    const out = fmt(makeLog('hi'));
    asserts.assertStringIncludes(out, 'level=6');
  });

  it('useEpochTimestamp option emits epoch ms', () => {
    const fmt = logfmtFormatter({ useEpochTimestamp: true });
    const out = fmt(makeLog('hi'));
    asserts.assertStringIncludes(out, 'ts=1778478400000');
  });

  it('respects custom envelopeOrder and includes `id` when listed', () => {
    const fmt = logfmtFormatter({
      envelopeOrder: ['id', 'level', 'msg'],
    });
    asserts.assertEquals(fmt(makeLog('hi')), 'id=L1 level=info msg=hi');
  });

  it('control characters in values trigger quoting + JSON escape', () => {
    const fmt = logfmtFormatter();
    const out = fmt(makeLog('hi', { weird: 'one\ntwo\ttab' }));
    asserts.assertStringIncludes(out, 'weird="one\\ntwo\\ttab"');
  });

  it('numbers, booleans, bigints round-trip unquoted', () => {
    const fmt = logfmtFormatter();
    const out = fmt(makeLog('hi', { n: 42, b: true, big: 1n }));
    asserts.assertStringIncludes(out, 'n=42');
    asserts.assertStringIncludes(out, 'b=true');
    asserts.assertStringIncludes(out, 'big=1');
  });

  it('quotes context keys that contain space / `=` / `"`', () => {
    const fmt = logfmtFormatter();
    const out = fmt(makeLog('hi', {
      'weird key': 1,
      'a=b': 2,
      'quo"te': 3,
    }));
    asserts.assertStringIncludes(out, '"weird key"=1');
    asserts.assertStringIncludes(out, '"a=b"=2');
    asserts.assertStringIncludes(out, '"quo\\"te"=3');
  });

  it('quotes context keys with control chars (line-splitting guard)', () => {
    const fmt = logfmtFormatter();
    // A newline in a key would otherwise split the logfmt line and let
    // an attacker forge a second log record (logfmt injection).
    const out = fmt(makeLog('hi', { 'inj\nected=evil': 'x' }));
    // The dangerous key must be quoted + escaped, not emitted raw.
    asserts.assertStringIncludes(out, '"inj\\nected=evil"=x');
    // And there must be no real newline in the rendered line.
    asserts.assert(
      !out.includes('\n'),
      'rendered line must not contain a newline',
    );
  });

  it('leaves safe dot-path keys unquoted', () => {
    const fmt = logfmtFormatter();
    const out = fmt(makeLog('hi', { user: { id: 7 } }));
    // `.` is a legitimate dot-path separator — must NOT trigger quoting.
    asserts.assertStringIncludes(out, 'user.id=7');
    asserts.assert(
      !out.includes('"user.id"'),
      'dot-path key must stay unquoted',
    );
  });

  it('Date values in context render as ISO strings', () => {
    const fmt = logfmtFormatter();
    const out = fmt(makeLog('hi', {
      whenStarted: new Date('2026-01-01T00:00:00Z'),
    }));
    asserts.assertStringIncludes(out, 'whenStarted=2026-01-01T00:00:00.000Z');
  });

  // Regression (round-3 finding 6/7): a circular context recursed
  // forever (RangeError) and a bigint threw (TypeError) — both swallowed
  // by Slogger.log(), silently dropping the whole record. The formatter
  // must never throw on these; jsonFormatter was hardened, this sibling
  // was not.
  it('renders a circular context as [Circular] instead of throwing', () => {
    const fmt = logfmtFormatter();
    const req: Record<string, unknown> = { id: 7 };
    req.self = req; // cycle
    let out = '';
    // Must not throw (RangeError: Maximum call stack size exceeded).
    out = fmt(makeLog('boom', { req }));
    asserts.assertStringIncludes(out, 'req.id=7');
    asserts.assertStringIncludes(out, 'req.self=[Circular]');
  });

  it('renders a circular array value without throwing', () => {
    const fmt = logfmtFormatter();
    const arr: unknown[] = [1, 2];
    arr.push(arr); // cyclic array reaches _value → JSON.stringify
    const out = fmt(makeLog('boom', { arr }));
    asserts.assertStringIncludes(out, 'arr=');
    asserts.assert(!out.includes('\n'), 'expected single line');
  });

  it('serializes a bigint context value instead of throwing', () => {
    const fmt = logfmtFormatter();
    // Top-level scalar bigint, nested-in-object, and in-array all threw
    // (or silently dropped) before hardening.
    const out = fmt(makeLog('ids', {
      scalar: 10n,
      ids: [1n, 2n],
      nested: { big: 3n },
    }));
    asserts.assertStringIncludes(out, 'scalar=10');
    asserts.assertStringIncludes(out, 'ids=');
    asserts.assertStringIncludes(out, '"1"');
    asserts.assertStringIncludes(out, 'nested.big=3');
  });
});
