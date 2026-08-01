// deno-lint-ignore-file no-explicit-any
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { SyslogSeverities } from '@tundralibs/utils';
import { MemoryHandler } from './MemoryHandler.ts';
import type { SlogObject } from '../../types/SlogObject.ts';

const makeLog = (
  level: SyslogSeverities,
  message: string,
): SlogObject => ({
  id: `id-${message}`,
  appName: 'app',
  hostname: 'host',
  level,
  levelName: SyslogSeverities[level] as any,
  context: {},
  message,
  date: new Date('2026-05-11T00:00:00Z'),
  isoDate: '2026-05-11T00:00:00.000Z',
  timestamp: 0,
});

describe('slogger.handlers.MemoryHandler', () => {
  describe('constructor validation', () => {
    it('accepts a positive integer capacity', () => {
      const h = new MemoryHandler('m', {
        level: SyslogSeverities.DEBUG,
        capacity: 5,
      });
      asserts.assertEquals(h.capacity, 5);
    });

    it('defaults capacity to 100', () => {
      const h = new MemoryHandler('m', { level: SyslogSeverities.DEBUG });
      asserts.assertEquals(h.capacity, 100);
    });

    it('rejects zero / negative / non-integer capacity', () => {
      asserts.assertThrows(
        () =>
          new MemoryHandler('m', {
            level: SyslogSeverities.DEBUG,
            capacity: 0,
          }),
        Error,
        'positive integer',
      );
      asserts.assertThrows(
        () =>
          new MemoryHandler('m', {
            level: SyslogSeverities.DEBUG,
            capacity: -1,
          }),
        Error,
        'positive integer',
      );
      asserts.assertThrows(
        () =>
          new MemoryHandler('m', {
            level: SyslogSeverities.DEBUG,
            capacity: 1.5,
          }),
        Error,
        'positive integer',
      );
    });
  });

  describe('ring buffer behaviour', () => {
    it('records below capacity are stored in order', async () => {
      const h = new MemoryHandler('m', {
        level: SyslogSeverities.DEBUG,
        capacity: 5,
      });
      await h.handle(makeLog(SyslogSeverities.INFO, 'a'));
      await h.handle(makeLog(SyslogSeverities.INFO, 'b'));
      await h.handle(makeLog(SyslogSeverities.INFO, 'c'));
      const logs = h.getLogs();
      asserts.assertEquals(logs.length, 3);
      asserts.assertEquals(logs.map((l) => l.message), ['a', 'b', 'c']);
      asserts.assertEquals(h.size, 3);
    });

    it('oldest record is evicted once capacity is exceeded', async () => {
      const h = new MemoryHandler('m', {
        level: SyslogSeverities.DEBUG,
        capacity: 3,
      });
      await h.handle(makeLog(SyslogSeverities.INFO, 'a'));
      await h.handle(makeLog(SyslogSeverities.INFO, 'b'));
      await h.handle(makeLog(SyslogSeverities.INFO, 'c'));
      await h.handle(makeLog(SyslogSeverities.INFO, 'd')); // evicts 'a'
      await h.handle(makeLog(SyslogSeverities.INFO, 'e')); // evicts 'b'
      asserts.assertEquals(h.getLogs().map((l) => l.message), ['c', 'd', 'e']);
      asserts.assertEquals(h.size, 3);
    });

    it('continues evicting correctly when wrapping multiple times', async () => {
      const h = new MemoryHandler('m', {
        level: SyslogSeverities.DEBUG,
        capacity: 3,
      });
      for (let i = 0; i < 10; i++) {
        await h.handle(makeLog(SyslogSeverities.INFO, `m${i}`));
      }
      // After 10 pushes into a 3-slot ring: latest three are m7, m8, m9.
      asserts.assertEquals(h.getLogs().map((l) => l.message), [
        'm7',
        'm8',
        'm9',
      ]);
    });

    it('clear() empties the buffer', async () => {
      const h = new MemoryHandler('m', {
        level: SyslogSeverities.DEBUG,
        capacity: 3,
      });
      await h.handle(makeLog(SyslogSeverities.INFO, 'a'));
      h.clear();
      asserts.assertEquals(h.getLogs(), []);
      asserts.assertEquals(h.size, 0);
    });

    it('getLogs() returns a fresh array (mutation does not poison buffer)', async () => {
      const h = new MemoryHandler('m', {
        level: SyslogSeverities.DEBUG,
        capacity: 3,
      });
      await h.handle(makeLog(SyslogSeverities.INFO, 'a'));
      const snapshot = h.getLogs();
      snapshot.length = 0;
      asserts.assertEquals(h.size, 1);
      asserts.assertEquals(h.getLogs().length, 1);
    });
  });

  describe('level filtering and sampling', () => {
    it('drops records above the configured level', async () => {
      const h = new MemoryHandler('m', {
        level: SyslogSeverities.WARNING,
        capacity: 5,
      });
      await h.handle(makeLog(SyslogSeverities.INFO, 'info'));
      await h.handle(makeLog(SyslogSeverities.WARNING, 'warn'));
      await h.handle(makeLog(SyslogSeverities.ERROR, 'error'));
      asserts.assertEquals(h.getLogs().map((l) => l.message), [
        'warn',
        'error',
      ]);
    });

    it('respects sampling — sampleRate=0 drops everything below bypass level', async () => {
      const h = new MemoryHandler('m', {
        level: SyslogSeverities.DEBUG,
        capacity: 5,
        sampling: {
          sampleRate: 0, // drop everything that isn't bypassed
          bypassSamplingForLevel: SyslogSeverities.ERROR,
        },
      });
      await h.handle(makeLog(SyslogSeverities.INFO, 'sampled-out'));
      await h.handle(makeLog(SyslogSeverities.ERROR, 'kept'));
      asserts.assertEquals(h.getLogs().map((l) => l.message), ['kept']);
    });
  });

  describe('stores SlogObject, not formatted string', () => {
    it('preserves the original structured record', async () => {
      const h = new MemoryHandler('m', {
        level: SyslogSeverities.DEBUG,
        capacity: 3,
      });
      const log = makeLog(SyslogSeverities.INFO, 'structured');
      log.context = { reqId: 'abc', userId: 42 };
      await h.handle(log);
      const got = h.getLogs()[0]!;
      asserts.assertEquals(got.message, 'structured');
      asserts.assertEquals(got.context, { reqId: 'abc', userId: 42 });
      asserts.assertEquals(got.level, SyslogSeverities.INFO);
    });
  });
});
