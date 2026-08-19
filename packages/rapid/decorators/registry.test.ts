/**
 * @fileoverview registry — side-table append semantics and the
 * decoration-time guards (legacy mode, wrong-kind, static, private).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { RapidError } from '../errors/mod.ts';
import {
  assertClassContext,
  assertMethodContext,
  decorationsOf,
  moduleMetaOf,
  recordDecoration,
  recordModule,
} from './registry.ts';

describe('rapid.decorators.registry', () => {
  it('records APPEND per method; undecorated reads undefined', () => {
    const method = () => {};
    asserts.assertEquals(decorationsOf(method), undefined);
    recordDecoration(method, {
      kind: 'SOCKET',
      command: 'a',
      binds: [],
      methodName: 'm',
    });
    recordDecoration(method, {
      kind: 'SOCKET',
      command: 'b',
      binds: [],
      methodName: 'm',
    });
    const entries = decorationsOf(method)!;
    asserts.assertEquals(entries.length, 2);
    asserts.assertEquals(
      entries.map((e) => e.kind === 'SOCKET' ? e.command : ''),
      ['a', 'b'],
    );
    // A DIFFERENT function is a different key:
    asserts.assertEquals(decorationsOf(() => {}), undefined);
  });

  it('LEGACY decorator compilation is a loud config error', () => {
    // Under experimentalDecorators a method decorator receives
    // (prototype, propertyName, descriptor) — context is a STRING.
    asserts.assertThrows(
      () => assertMethodContext('methodName', 'GET'),
      RapidError,
      'LEGACY decorator mode',
    );
    asserts.assertThrows(
      () => assertMethodContext(null, 'GET'),
      RapidError,
      'LEGACY decorator mode',
    );
  });

  it('rejects non-method kinds, static, and private placements', () => {
    asserts.assertThrows(
      () =>
        assertMethodContext(
          {
            kind: 'getter',
            name: 'g',
          } as unknown as ClassMethodDecoratorContext,
          'GET',
        ),
      RapidError,
      'only decorates METHODS',
    );
    asserts.assertThrows(
      () =>
        assertMethodContext(
          {
            kind: 'method',
            name: 's',
            static: true,
            private: false,
          } as unknown as ClassMethodDecoratorContext,
          'JOB',
        ),
      RapidError,
      'STATIC',
    );
    asserts.assertThrows(
      () =>
        assertMethodContext(
          {
            kind: 'method',
            name: 'p',
            static: false,
            private: true,
          } as unknown as ClassMethodDecoratorContext,
          'SOCKET',
        ),
      RapidError,
      'PRIVATE',
    );
  });

  it('module metadata: SET (not append) per constructor; undecorated reads undefined', () => {
    class Ctor {}
    asserts.assertEquals(moduleMetaOf(Ctor), undefined);
    recordModule(Ctor, { prefix: '/a' });
    asserts.assertEquals(moduleMetaOf(Ctor), { prefix: '/a' });
    // A second record on the SAME constructor overwrites, never appends:
    recordModule(Ctor, { prefix: '/b' });
    asserts.assertEquals(moduleMetaOf(Ctor), { prefix: '/b' });
    // A DIFFERENT constructor is a different key:
    class Other {}
    asserts.assertEquals(moduleMetaOf(Other), undefined);
  });

  it('assertClassContext: same legacy-mode and wrong-kind guards as assertMethodContext', () => {
    asserts.assertThrows(
      () => assertClassContext('ClassName', 'Module'),
      RapidError,
      'LEGACY decorator mode',
    );
    asserts.assertThrows(
      () => assertClassContext(null, 'Module'),
      RapidError,
      'LEGACY decorator mode',
    );
    asserts.assertThrows(
      () =>
        assertClassContext(
          { kind: 'method', name: 'm' } as unknown as ClassDecoratorContext,
          'Module',
        ),
      RapidError,
      'only decorates CLASSES',
    );
  });
});
