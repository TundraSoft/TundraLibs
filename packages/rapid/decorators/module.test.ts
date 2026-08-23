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
  it('records name/prefix; the class itself is UNTOUCHED', () => {
    @Module('Users', { prefix: '/users' })
    class Users {
      @GET('/:id:', { bind: [param('id')] })
      find(id: string): RapidContextResponse {
        return { content: { id } };
      }
    }
    asserts.assertEquals(moduleMetaOf(Users), {
      name: 'Users',
      prefix: '/users',
    });
    // Metadata-only: construction and method dispatch are plain JS.
    asserts.assertEquals(new Users().find('7'), { content: { id: '7' } });
  });

  it('records namespace and version alongside name/prefix', () => {
    @Module('Users', { namespace: 'users', prefix: '/users', version: 'v1' })
    class Users {}
    asserts.assertEquals(moduleMetaOf(Users), {
      name: 'Users',
      namespace: 'users',
      prefix: '/users',
      version: 'v1',
    });
  });

  it('records the OpenAPI grouping (description/tags/security) in both forms', () => {
    @Module('Users', {
      description: 'People',
      tags: ['Users', 'Directory'],
      security: ['bearerAuth'],
    })
    class Named {}
    asserts.assertEquals(moduleMetaOf(Named), {
      name: 'Users',
      prefix: '',
      description: 'People',
      tags: ['Users', 'Directory'],
      security: ['bearerAuth'],
    });
    // Options-only form (RapidModule subclasses): grouping allowed, identity not.
    @Module({ description: 'Roles', tags: [] })
    class OptionsOnly {}
    asserts.assertEquals(moduleMetaOf(OptionsOnly), {
      prefix: '',
      description: 'Roles',
      tags: [],
    });
  });

  it('no options -> empty-string prefix, no namespace/version', () => {
    @Module('Bare')
    class Bare {}
    asserts.assertEquals(moduleMetaOf(Bare), { name: 'Bare', prefix: '' });
  });

  it('an empty name is rejected NOW, not at mount', () => {
    asserts.assertThrows(
      () => {
        @Module('')
        class _Bad {}
      },
      Error,
      'name must be a non-empty string',
    );
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
        @Module('Bad', { prefix: 'users' })
        class _Bad {}
      },
      Error,
      "must be empty or start with '/'",
    );
  });
});
