/**
 * @fileoverview extractPathname — the alloc-free pathname scan used on
 * the routing hot path in place of `new URL(request.url).pathname`.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { extractPathname } from './extractPathname.ts';

describe('rapid.extractPathname', () => {
  it('equals new URL(request.url).pathname for the shapes a server sees', () => {
    // Drive through Request so each url is exactly what the transport
    // receives (absolute + normalized). The ORACLE is new URL().pathname:
    // if the scan ever diverges, this fails.
    const raws = [
      'http://localhost/',
      'http://localhost', // no path → '/'
      'http://localhost/users/42',
      'http://localhost/users/42?x=1&y=2', // query stripped
      'http://localhost/users/42#frag', // fragment stripped
      'http://localhost/a/../b', // dot-seg already resolved to /b
      'http://localhost/a/./b',
      'http://localhost//double//slash', // preserved verbatim
      'http://localhost/users/%20space%2Fslash', // percent-encoding kept
      'http://localhost/posts/:id:/comments', // radrouter grammar chars
      'http://localhost:8080/p/q?z', // explicit port
    ];
    for (const raw of raws) {
      const url = new Request(raw).url;
      asserts.assertEquals(
        extractPathname(url),
        new URL(url).pathname,
        `mismatch for ${url}`,
      );
    }
  });

  it('returns explicit paths (a failing scan would not produce these)', () => {
    asserts.assertEquals(extractPathname('http://localhost/'), '/');
    asserts.assertEquals(
      extractPathname('http://localhost/users/42?q=1'),
      '/users/42',
    );
    asserts.assertEquals(
      extractPathname('https://h:9/a/b/c#x'),
      '/a/b/c',
    );
  });

  it('no path component → "/"', () => {
    asserts.assertEquals(extractPathname('http://localhost'), '/');
    asserts.assertEquals(extractPathname('http://localhost?q=1'), '/');
  });

  it('does NOT decode percent-encoding (radrouter matches raw segments)', () => {
    asserts.assertEquals(
      extractPathname('http://localhost/a%2Fb'),
      '/a%2Fb',
    );
  });
});
