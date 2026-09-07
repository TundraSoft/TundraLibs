/**
 * @fileoverview The api-surface resolver: config normalisation (hosts,
 * prefix), the forwarded-host policy, prefix stripping, and the verdict.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { RapidError } from '../errors/mod.ts';
import {
  normalizeApiSurface,
  normalizeHostname,
  requestHostname,
  resolveSurface,
  stripApiPrefix,
} from './apiSurface.ts';

describe('rapid.utils.apiSurface', () => {
  describe('normalizeHostname', () => {
    it('lowercases, punycodes, drops one trailing dot and the port', () => {
      asserts.assertEquals(
        normalizeHostname('API.Example.COM'),
        'api.example.com',
      );
      asserts.assertEquals(
        normalizeHostname('bücher.example'),
        'xn--bcher-kva.example',
      );
      asserts.assertEquals(
        normalizeHostname('api.example.com.'),
        'api.example.com',
      );
      asserts.assertEquals(
        normalizeHostname('api.example.com:8080'),
        'api.example.com',
      );
      asserts.assertEquals(normalizeHostname(' [::1] '), '[::1]');
    });

    it('rejects anything that is not a bare host', () => {
      for (const bad of ['api.example.com/x', 'a?b', 'a#b', '', 'http://x']) {
        asserts.assertEquals(normalizeHostname(bad), undefined, bad);
      }
    });
  });

  describe('normalizeApiSurface', () => {
    it('is undefined when server.api is absent', () => {
      asserts.assertEquals(normalizeApiSurface(undefined), undefined);
    });

    it('normalises hosts and keeps the prefix', () => {
      const api = normalizeApiSurface({
        hosts: ['API.Example.com.', 'bücher.example'],
        prefix: '/api/v2',
      })!;
      asserts.assertEquals(
        [...api.hosts],
        ['api.example.com', 'xn--bcher-kva.example'],
      );
      asserts.assertEquals(api.prefix, '/api/v2');
      asserts.assertEquals(api.trustForwardedHost, false);
      asserts.assertEquals(
        normalizeApiSurface({ prefix: '/api', trustForwardedHost: true })!
          .trustForwardedHost,
        true,
      );
    });

    it('fails loudly on every malformed shape', () => {
      const cases: [unknown, string][] = [
        ['x', 'must be an object'],
        [[], 'must be an object'],
        [{ host: ['a'] }, "unknown option 'host'"],
        [{ prefix: '/api', trustForwardedHost: 'yes' }, 'must be a boolean'],
        [{ hosts: 'api.example.com' }, 'must be an array'],
        [{ hosts: ['http://api.example.com'] }, 'is not a hostname'],
        [{ hosts: [42] }, 'is not a hostname'],
        [{ prefix: 'api' }, 'leading slash'],
        [{ prefix: '/api/' }, 'leading slash'],
        [{ prefix: '/' }, 'leading slash'],
        [{ prefix: '/a?b' }, 'leading slash'],
        [{}, 'at least one of hosts / prefix'],
        [{ hosts: [] }, 'at least one of hosts / prefix'],
      ];
      for (const [raw, message] of cases) {
        asserts.assertThrows(
          () => normalizeApiSurface(raw),
          RapidError,
          message,
          JSON.stringify(raw),
        );
      }
    });
  });

  describe('requestHostname', () => {
    const url = new URL('http://Origin.Example.com./x');

    it('reads the URL host (already canonical) and drops a trailing dot', () => {
      asserts.assertEquals(
        requestHostname(url, new Headers(), false, true),
        'origin.example.com',
      );
    });

    it('ignores x-forwarded-host unless trustForwardedHost is on AND trustProxy admits a hop', () => {
      const headers = new Headers({ 'x-forwarded-host': 'api.example.com' });
      asserts.assertEquals(
        requestHostname(url, headers, false, true),
        'origin.example.com',
      );
      asserts.assertEquals(
        requestHostname(url, headers, 0, true),
        'origin.example.com',
      );
      // trustProxy alone is NOT enough — proxies commonly set XFF, not XFH.
      asserts.assertEquals(
        requestHostname(url, headers, true, false),
        'origin.example.com',
      );
      asserts.assertEquals(
        requestHostname(url, headers, true, true),
        'api.example.com',
      );
    });

    it('picks the entry the outermost TRUSTED proxy recorded (N from the end)', () => {
      const headers = new Headers({
        'x-forwarded-host': 'spoofed.example, edge.example, inner.example',
      });
      asserts.assertEquals(
        requestHostname(url, headers, 1, true),
        'inner.example',
      );
      asserts.assertEquals(
        requestHostname(url, headers, 2, true),
        'edge.example',
      );
      // More hops than entries clamps to the first — never past the list.
      asserts.assertEquals(
        requestHostname(url, headers, 9, true),
        'spoofed.example',
      );
    });

    it('falls back to the URL host on a malformed forwarded value', () => {
      const headers = new Headers({ 'x-forwarded-host': 'evil.example/path' });
      asserts.assertEquals(
        requestHostname(url, headers, true, true),
        'origin.example.com',
      );
    });
  });

  describe('stripApiPrefix', () => {
    it('matches whole segments only', () => {
      asserts.assertEquals(stripApiPrefix('/api', '/api'), '/');
      asserts.assertEquals(stripApiPrefix('/api/users', '/api'), '/users');
      asserts.assertEquals(stripApiPrefix('/apix/users', '/api'), undefined);
      asserts.assertEquals(stripApiPrefix('/API/users', '/api'), undefined);
      asserts.assertEquals(stripApiPrefix('/users', '/api'), undefined);
      asserts.assertEquals(stripApiPrefix('/users', undefined), undefined);
    });
  });

  describe('resolveSurface', () => {
    const api = normalizeApiSurface({
      hosts: ['api.example.com'],
      prefix: '/api',
    })!;

    it('host OR prefix makes the request api; the prefix is stripped either way', () => {
      asserts.assertEquals(
        resolveSurface('example.com', '/api/users', api, true),
        { surface: 'api', pathname: '/users', basePath: '/api' },
      );
      asserts.assertEquals(
        resolveSurface('api.example.com', '/users', api, true),
        { surface: 'api', pathname: '/users', basePath: '' },
      );
      asserts.assertEquals(
        resolveSurface('api.example.com', '/api/users', api, true),
        { surface: 'api', pathname: '/users', basePath: '/api' },
      );
      asserts.assertEquals(
        resolveSurface('example.com', '/users', api, true),
        { surface: 'ui', pathname: '/users', basePath: '' },
      );
    });

    it('ui.enabled: false makes every request api, prefix still stripped when present', () => {
      asserts.assertEquals(
        resolveSurface('example.com', '/users', undefined, false),
        { surface: 'api', pathname: '/users', basePath: '' },
      );
      asserts.assertEquals(
        resolveSurface('example.com', '/api/users', api, false),
        { surface: 'api', pathname: '/users', basePath: '/api' },
      );
    });
  });
});
