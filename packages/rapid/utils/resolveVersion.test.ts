/**
 * @fileoverview resolveVersion — the three versioning modes.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { resolveVersion } from './resolveVersion.ts';

const h = (init: Record<string, string> = {}) => new Headers(init);

describe('rapid.resolveVersion', () => {
  it('header mode reads the named header; absent → undefined', () => {
    const cfg = { mode: 'header' as const, identifier: 'x-api-version' };
    asserts.assertEquals(
      resolveVersion(h({ 'x-api-version': 'v2' }), '/users', cfg),
      { version: 'v2', pathname: '/users' },
    );
    asserts.assertEquals(resolveVersion(h(), '/users', cfg).version, undefined);
  });

  it('accept mode extracts the version from the vendor media type', () => {
    const cfg = { mode: 'accept' as const, identifier: 'example' };
    asserts.assertEquals(
      resolveVersion(
        h({ accept: 'application/vnd.example.v3+json' }),
        '/x',
        cfg,
      ).version,
      'v3',
    );
    asserts.assertEquals(
      resolveVersion(h({ accept: 'application/json' }), '/x', cfg).version,
      undefined,
    );
  });

  it('path mode captures the leading version and STRIPS it from the path', () => {
    const cfg = { mode: 'path' as const }; // default pattern ^/(v[0-9]+)
    asserts.assertEquals(
      resolveVersion(h(), '/v2/users/7', cfg),
      { version: 'v2', pathname: '/users/7' },
    );
    // a version-only path strips to '/'
    asserts.assertEquals(resolveVersion(h(), '/v2', cfg), {
      version: 'v2',
      pathname: '/',
    });
    // no version segment → path untouched
    asserts.assertEquals(resolveVersion(h(), '/users', cfg), {
      version: undefined,
      pathname: '/users',
    });
  });

  it('defaults to header mode with x-api-version when nothing is configured', () => {
    asserts.assertEquals(
      resolveVersion(h({ 'x-api-version': 'v1' }), '/x', {}).version,
      'v1',
    );
  });
});
