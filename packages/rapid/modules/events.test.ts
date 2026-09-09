/**
 * @fileoverview Tests for events (and EventContext).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  event,
  EVENT_NAME_PATTERN,
  NAME_PATTERN,
  NAMESPACE_PATTERN,
} from './events.ts';
import { EventContext } from './EventContext.ts';

describe('rapid.modules.events', () => {
  it('event() returns one shared frozen marker for every declaration', () => {
    const a = event<{ id: string }>();
    const b = event<number>();
    // A pure type carrier — one frozen object reused across every call, so
    // declaring events allocates nothing at runtime.
    asserts.assertStrictEquals(a, b);
    asserts.assert(Object.isFrozen(a));
    asserts.assertEquals(Object.keys(a).length, 0);
  });

  it('NAMESPACE_PATTERN matches lower-kebab namespaces and rejects others', () => {
    for (const ok of ['posts', 'user-admin', 'a', 'a1-b2']) {
      asserts.assert(NAMESPACE_PATTERN.test(ok), ok);
    }
    for (const bad of ['Posts', '1posts', 'post_s', 'user:admin', '']) {
      asserts.assertEquals(NAMESPACE_PATTERN.test(bad), false, bad);
    }
  });

  it('NAME_PATTERN matches PascalCase Module/EventName segments and rejects others', () => {
    for (const ok of ['Posts', 'PostCreated', 'P', 'A1B2']) {
      asserts.assert(NAME_PATTERN.test(ok), ok);
    }
    for (const bad of ['posts', 'post-created', 'Post_Created', '1Post', '']) {
      asserts.assertEquals(NAME_PATTERN.test(bad), false, bad);
    }
  });

  it('EVENT_NAME_PATTERN matches the fully-qualified namespace:Module:EventName form', () => {
    for (
      const ok of ['posts:Posts:PostCreated', 'user-admin:User:LoggedIn']
    ) {
      asserts.assert(EVENT_NAME_PATTERN.test(ok), ok);
    }
    for (
      const bad of [
        'Posts:Posts:PostCreated', // namespace not lower-kebab
        'posts:posts:PostCreated', // module not PascalCase
        'posts:Posts:post', // event not PascalCase
        'posts:Posts', // missing the event segment
        'posts::PostCreated', // empty module segment
        '',
      ]
    ) {
      asserts.assertEquals(EVENT_NAME_PATTERN.test(bad), false, bad);
    }
  });
});

describe('rapid.modules.EventContext', () => {
  it('carries the EVENT discriminant and its init fields verbatim', () => {
    const ctx = new EventContext({
      requestId: 'req-1',
      action: 'event posts:Posts:PostCreated',
      event: 'posts:Posts:PostCreated',
    });
    asserts.assertEquals(ctx.type, 'EVENT');
    asserts.assertStrictEquals(ctx.requestId, 'req-1');
    asserts.assertStrictEquals(ctx.action, 'event posts:Posts:PostCreated');
    asserts.assertStrictEquals(ctx.event, 'posts:Posts:PostCreated');
  });
});
