/**
 * @fileoverview registry — name-keyed decorator-metadata records (append
 * semantics, per-class ownership, the missing-metadata tripwire) and the
 * decoration-time guards (legacy mode, wrong-kind, static, private).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { RapidError } from '../errors/mod.ts';
import { GET } from './http.ts';
import {
  assertClassContext,
  assertMethodContext,
  decoratedNamesOf,
  decorationsOf,
  moduleMetaOf,
  recordDecoration,
  recordModule,
} from './registry.ts';

/** A minimal decoration-time context over a fresh metadata object. */
const ctx = (
  name: string,
  metadata: object = Object.create(null),
): ClassMethodDecoratorContext =>
  ({
    kind: 'method',
    name,
    static: false,
    private: false,
    metadata,
  }) as unknown as ClassMethodDecoratorContext;

/** Read a record back through a stand-in class carrying `metadata`. */
const ownerOf = (metadata: object): object =>
  Object.defineProperty(function () {}, Symbol.metadata, { value: metadata });

describe('rapid.decorators.registry', () => {
  it('records APPEND per method name; undecorated reads undefined', () => {
    const metadata = Object.create(null);
    const owner = ownerOf(metadata);
    asserts.assertEquals(decorationsOf(owner, 'm'), undefined);
    recordDecoration(ctx('m', metadata), {
      kind: 'SOCKET',
      command: 'a',
      binds: [],
      methodName: 'm',
    });
    recordDecoration(ctx('m', metadata), {
      kind: 'SOCKET',
      command: 'b',
      binds: [],
      methodName: 'm',
    });
    const entries = decorationsOf(owner, 'm')!;
    asserts.assertEquals(entries.length, 2);
    asserts.assertEquals(
      entries.map((e) => e.kind === 'SOCKET' ? e.command : ''),
      ['a', 'b'],
    );
    asserts.assertEquals(decoratedNamesOf(owner), ['m']);
    // A DIFFERENT name is a different record:
    asserts.assertEquals(decorationsOf(owner, 'other'), undefined);
  });

  it('a transform that supplies NO context.metadata fails LOUDLY (never a silent drop)', () => {
    const err = asserts.assertThrows(
      () =>
        recordDecoration(
          {
            kind: 'method',
            name: 'm',
          } as unknown as ClassMethodDecoratorContext,
          { kind: 'SOCKET', command: 'x', binds: [], methodName: 'm' },
        ),
      RapidError,
      'did not supply context.metadata',
    );
    asserts.assertEquals(err.code, 'RAPID_CONFIG');
  });

  it("each class owns its OWN records — a subclass never sees or mutates the parent's", () => {
    class Base {
      @GET('/base')
      find() {
        return { content: 'base' };
      }
    }
    class Derived extends Base {
      @GET('/derived')
      other() {
        return { content: 'derived' };
      }
    }
    // Derived's metadata inherits from Base's (TC39), but rapid's bucket is
    // created OWN per class: Base's `find` is Base's, not Derived's.
    asserts.assertEquals(decoratedNamesOf(Base), ['find']);
    asserts.assertEquals(decoratedNamesOf(Derived), ['other']);
    asserts.assertEquals(decorationsOf(Derived, 'find'), undefined);
    asserts.assertEquals(decorationsOf(Base, 'find')!.length, 1);
    // …and decorating Derived did not append into Base's bucket.
    asserts.assertEquals(decorationsOf(Base, 'other'), undefined);
  });

  it('a WRAPPING decorator stacked ON TOP no longer loses the decoration', () => {
    // The exact case the old function-keyed side-table silently dropped.
    // A type-preserving wrapper (TS requires a method decorator to return
    // the method's own type); it counts calls so we can prove the function
    // installed under the name is the WRAPPER, not the original.
    let wrapped = 0;
    const measure = <F extends (...a: never[]) => unknown>(
      fn: F,
      _c: ClassMethodDecoratorContext,
    ): F =>
      (function (this: unknown, ...a: never[]) {
        wrapped++;
        return fn.apply(this, a);
      }) as unknown as F;
    class Svc {
      @measure
      @GET('/x')
      handler() {
        return { content: 'x' };
      }
    }
    asserts.assertEquals(decorationsOf(Svc, 'handler')!.length, 1);
    asserts.assertEquals(new Svc().handler(), { content: 'x' });
    asserts.assertEquals(wrapped, 1); // the installed function is the wrapper
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
    recordModule(Ctor, { name: 'Ctor', prefix: '/a' });
    asserts.assertEquals(moduleMetaOf(Ctor), { name: 'Ctor', prefix: '/a' });
    // A second record on the SAME constructor overwrites, never appends:
    recordModule(Ctor, { name: 'Ctor', prefix: '/b' });
    asserts.assertEquals(moduleMetaOf(Ctor), { name: 'Ctor', prefix: '/b' });
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
