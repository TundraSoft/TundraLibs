/**
 * @fileoverview `@Module` — metadata recording, prefix validation, and
 * the opt-in default (a class with no `@Module` reads `undefined`).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import type { RapidContextResponse } from '../types/mod.ts';
import { param } from './binders.ts';
import { GET } from './http.ts';
import { Module } from './module.ts';
import { moduleMetaOf } from './registry.ts';

describe('rapid.decorators.module', () => {
  it('records the prefix; the class itself is UNTOUCHED', () => {
    @Module({ prefix: '/users' })
    class Users {
      @GET('/:id:', { bind: [param('id')] })
      find(id: string): RapidContextResponse {
        return { content: { id } };
      }
    }
    asserts.assertEquals(moduleMetaOf(Users), { prefix: '/users' });
    // Metadata-only: construction and method dispatch are plain JS.
    asserts.assertEquals(new Users().find('7'), { content: { id: '7' } });
  });

  it('no options -> empty-string prefix, not undefined', () => {
    @Module()
    class Bare {}
    asserts.assertEquals(moduleMetaOf(Bare), { prefix: '' });
  });

  it('a class with no @Module at all reads undefined (opt-in)', () => {
    class Undecorated {
      @GET('/x')
      handler(): RapidContextResponse {
        return { content: 'x' };
      }
    }
    asserts.assertEquals(moduleMetaOf(Undecorated), undefined);
  });

  it('a non-empty prefix without a leading slash is rejected NOW, not at mount', () => {
    asserts.assertThrows(
      () => {
        @Module({ prefix: 'users' })
        class _Bad {}
      },
      Error,
      "must be empty or start with '/'",
    );
  });
});
