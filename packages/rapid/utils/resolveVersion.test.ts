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

  it('path mode only matches a WHOLE leading segment (no partial /v1abc)', () => {
    const cfg = { mode: 'path' as const };
    // `/v1abc` is not the segment `v1` — must NOT be read as v1, must NOT
    // strip to `/abc` (the pre-fix bug matched `/v1` inside `/v1abc`).
    asserts.assertEquals(resolveVersion(h(), '/v1abc/users', cfg), {
      version: undefined,
      pathname: '/v1abc/users',
    });
    // `/v2users` likewise is one non-version segment — untouched.
    asserts.assertEquals(resolveVersion(h(), '/v2users', cfg), {
      version: undefined,
      pathname: '/v2users',
    });
  });

  it('path mode strips from the match INDEX, not position 0', () => {
    // A non-anchored custom identifier matching mid-path must slice from the
    // match's own start (pre-fix: slice(match[0].length) produced garbage
    // like `pi/v2/users`).
    const cfg = { mode: 'path' as const, identifier: '(v[0-9]+)' };
    const out = resolveVersion(h(), '/api/v2/users', cfg);
    asserts.assertEquals(out.version, 'v2');
    // The matched span (and the prefix before it) is removed cleanly, and
    // the result is a valid rooted path — never a mangled `pi/...`.
    asserts.assert(out.pathname.startsWith('/'));
    asserts.assertEquals(out.pathname, '/users');
  });

  it('accept mode with no identifier configured yields no version', () => {
    asserts.assertEquals(
      resolveVersion(
        h({ accept: 'application/vnd.example.v3+json' }),
        '/x',
        { mode: 'accept' as const },
      ).version,
      undefined,
    );
  });

  it('defaults to header mode with x-api-version when nothing is configured', () => {
    asserts.assertEquals(
      resolveVersion(h({ 'x-api-version': 'v1' }), '/x', {}).version,
      'v1',
    );
  });
});
