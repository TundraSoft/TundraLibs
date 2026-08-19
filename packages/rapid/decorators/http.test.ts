/**
 * @fileoverview http decorators — metadata-only recording, stacking
 * and aliasing, method untouched, and the compile-time contract
 * (return envelope + bind-driven arity) pinned via @ts-expect-error.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import type { RapidContextResponse } from '../types/mod.ts';
import { param } from './binders.ts';
import { DELETE, GET, POST } from './http.ts';
import { decorationsOf } from './registry.ts';
import { JOB } from './job.ts';
import { SOCKET } from './socket.ts';

describe('rapid.decorators.http', () => {
  it('records metadata; the method itself is UNTOUCHED', () => {
    class Users {
      @GET('/users/:id:', { bind: [param('id')] })
      find(id: string): RapidContextResponse {
        return { content: { id } };
      }
    }
    const entries = decorationsOf(Users.prototype.find)!;
    asserts.assertEquals(entries.length, 1);
    asserts.assertEquals(entries[0], {
      kind: 'HTTP',
      method: 'GET',
      path: '/users/:id:',
      binds: [{ source: 'param', name: 'id', validate: undefined }],
      methodName: 'find',
    });
    // Metadata-only: calling the method is plain method dispatch.
    asserts.assertEquals(new Users().find('7'), { content: { id: '7' } });
  });

  it('aliases (same factory twice) and multi-transport stacks all record', () => {
    class Reports {
      @GET('/reports/:id:', { bind: [param('id')] })
      @POST('/reports/:id:/refresh', { bind: [param('id')] })
      @SOCKET('reports.get', { bind: [param('id')] })
      @JOB('daily-report', '0 6 * * *', {
        args: { id: 'latest' },
        bind: [param('id')],
      })
      fetch(id: string): RapidContextResponse {
        return { content: { id } };
      }
    }
    const entries = decorationsOf(Reports.prototype.fetch)!;
    // TC39: decorators APPLY bottom-up — recording order documents it.
    asserts.assertEquals(entries.map((e) => e.kind), [
      'JOB',
      'SOCKET',
      'HTTP',
      'HTTP',
    ]);
    const verbs = entries.flatMap((e) => e.kind === 'HTTP' ? [e.method] : []);
    asserts.assertEquals(verbs, ['POST', 'GET']);
  });

  it('binds default to empty; DELETE et al share the builder', () => {
    class Things {
      @DELETE('/things')
      clear(): RapidContextResponse {
        return { content: 'gone' };
      }
    }
    const [entry] = decorationsOf(Things.prototype.clear)!;
    asserts.assertEquals(
      entry.kind === 'HTTP' ? entry.method : '',
      'DELETE',
    );
    asserts.assertEquals(entry.binds, []);
  });

  it('COMPILE CONTRACT: envelope return and bind-driven params', () => {
    class Contract {
      // A validator's output type drives the parameter type:
      @GET('/n/:n:', { bind: [param('n', (v) => Number(v))] })
      typed(n: number): RapidContextResponse {
        return { content: { n } };
      }

      // @ts-expect-error — method must return the reply envelope
      @GET('/bad-return')
      badReturn(): string {
        return 'nope';
      }

      // @ts-expect-error — one bind cannot feed two parameters
      @GET('/overflow/:id:', { bind: [param('id')] })
      overflow(id: string, extra: number): RapidContextResponse {
        return { content: { id, extra } };
      }

      // @ts-expect-error — bind produces string, parameter wants number
      @GET('/mismatch/:id:', { bind: [param('id')] })
      mismatch(id: number): RapidContextResponse {
        return { content: { id } };
      }

      // R2-M6: NO bind at all. Previously `A` inferred from the method
      // and every check vanished — a param declared here would silently
      // receive `undefined` at mount. Now the no-bind overload pins
      // `A` to `[]`, so declaring a parameter is a compile error.
      // @ts-expect-error — no bind, so the method must take no params
      @GET('/no-bind/:id:')
      noBind(id: string): RapidContextResponse {
        return { content: { id } };
      }

      // ...and the zero-parameter form still compiles clean.
      @GET('/health')
      health(): RapidContextResponse {
        return { content: 'ok' };
      }
    }
    // The decorated-but-type-erroring methods still exist at runtime
    // (the contract is compile-time; runtime re-checks live in the
    // mount tier):
    asserts.assertEquals(new Contract().typed(2), { content: { n: 2 } });
    asserts.assertEquals(
      decorationsOf(Contract.prototype.badReturn)!.length,
      1,
    );
  });
});
