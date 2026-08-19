/**
 * @fileoverview JOB decorator — schedule validation at decoration
 * time, args recording, and the runtime legacy-mode tripwire.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { RapidError } from '../errors/mod.ts';
import type { RapidContextResponse } from '../types/mod.ts';
import { GET } from './http.ts';
import { JOB } from './job.ts';
import { decorationsOf } from './registry.ts';

describe('rapid.decorators.job', () => {
  it('records name/schedule/args', () => {
    class Nightly {
      @JOB('cleanup', '0 3 * * *', { args: { scope: 'expired' } })
      run(): RapidContextResponse {
        return { content: 'done' };
      }
    }
    const [entry] = decorationsOf(Nightly.prototype.run)!;
    asserts.assertEquals(entry.kind, 'JOB');
    if (entry.kind === 'JOB') {
      asserts.assertEquals(entry.name, 'cleanup');
      asserts.assertEquals(entry.schedule, '0 3 * * *');
      asserts.assertEquals(entry.args, { scope: 'expired' });
    }
  });

  it('an invalid schedule fails AT DECORATION TIME (import moment)', () => {
    asserts.assertThrows(
      () => JOB('bad', 'not a cron'),
      RapidError,
      'invalid schedule',
    );
  });

  it('legacy-mode compilation trips the runtime guard', () => {
    // Simulate what experimentalDecorators would pass at runtime:
    const factory = GET('/x');
    asserts.assertThrows(
      () =>
        (factory as unknown as (a: unknown, b: unknown) => void)(
          {},
          'methodName',
        ),
      RapidError,
      'LEGACY decorator mode',
    );
  });
});
