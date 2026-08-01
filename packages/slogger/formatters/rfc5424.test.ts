// deno-lint-ignore-file no-explicit-any
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { SyslogFacilities, SyslogSeverities } from '@tundralibs/utils';
import { rfc5424Formatter } from './rfc5424.ts';
import type { SlogObject } from '../types/mod.ts';

const makeLog = (
  message: string,
  context: Record<string, unknown> = {},
): SlogObject => ({
  id: 'R1',
  appName: 'app',
  hostname: 'web01',
  level: SyslogSeverities.WARNING,
  levelName: SyslogSeverities[SyslogSeverities.WARNING] as any,
  context,
  message,
  date: new Date('2026-05-11T00:00:00Z'),
  isoDate: '2026-05-11T00:00:00.000Z',
  timestamp: 0,
});

describe('slogger.formatters.rfc5424', () => {
  it('emits a single-line frame for an ordinary message', () => {
    const fmt = rfc5424Formatter({ facility: SyslogFacilities.LOCAL0 });
    const out = fmt(makeLog('user logged in'));
    asserts.assert(!out.includes('\n'), 'frame must be single-line');
    asserts.assertStringIncludes(out, 'user logged in');
  });

  // Regression (round-3 finding 8): the MSG part was concatenated raw,
  // so a newline in an attacker-controlled log message terminated the
  // record under 'lf' framing and injected a fully forged syslog line
  // (log forging). The formatter must neutralise framing-breaking
  // control bytes in MSG.
  it('strips newlines from MSG so a forged record cannot be injected', () => {
    const fmt = rfc5424Formatter();
    const forged =
      'login failed for x\n<86>1 2026-07-23T00:00:00Z web01 sshd 1 - - Accepted password for root';
    const out = fmt(makeLog(forged));
    // The whole frame stays on ONE line — no embedded newline that a
    // daemon under lf framing would parse as a second record.
    asserts.assert(
      !out.includes('\n'),
      'MSG newline must be sanitised: ' + JSON.stringify(out),
    );
    asserts.assertEquals(out.split('\n').length, 1);
    // The forged PRI/text is now inert content inside the single MSG.
    asserts.assertStringIncludes(out, 'login failed for x');
  });

  it('strips control bytes from appended context output too', () => {
    const fmt = rfc5424Formatter({
      appendContext: (ctx) => String(ctx.tail),
    });
    const out = fmt(makeLog('ok', { tail: 'a\nb\rc\x00d' }));
    asserts.assert(!out.includes('\n'), 'no LF');
    asserts.assert(!out.includes('\r'), 'no CR');
    asserts.assert(!out.includes('\x00'), 'no NUL');
  });

  it('preserves TAB and ordinary spaces in MSG', () => {
    const fmt = rfc5424Formatter();
    const out = fmt(makeLog('col1\tcol2 value'));
    asserts.assertStringIncludes(out, 'col1\tcol2 value');
  });
});
