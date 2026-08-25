/**
 * @fileoverview Tests for the HTTP-protocol helpers in http.ts — content
 * negotiation, RFC 7233 range parsing, and RFC 6265 cookie parse/serialize.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  type ByteRange,
  contentTypeFor,
  type CookieOptions,
  negotiate,
  parseCookies,
  parseRange,
  serializeCookie,
} from './http.ts';

describe('compat.http.negotiate', () => {
  it('picks the highest-q acceptable offer; most-specific Accept entry decides', () => {
    asserts.assertEquals(
      negotiate('text/html,application/json;q=0.9', [
        'application/json',
        'text/html',
      ]),
      'text/html',
    );
    asserts.assertEquals(
      negotiate('application/json;q=0.9, text/html;q=0.1', [
        'text/html',
        'application/json',
      ]),
      'application/json',
    );
  });

  it('honors type/* and */* wildcards by specificity', () => {
    asserts.assertEquals(
      negotiate('text/*', ['application/json', 'text/html']),
      'text/html',
    );
    asserts.assertEquals(
      negotiate('*/*', ['application/json']),
      'application/json',
    );
  });

  it('a missing / blank / unparseable Accept yields the first offer (server default)', () => {
    asserts.assertEquals(
      negotiate(null, ['application/json', 'text/html']),
      'application/json',
    );
    asserts.assertEquals(
      negotiate('   ', ['application/json']),
      'application/json',
    );
    asserts.assertEquals(
      negotiate('garbage', ['application/json']),
      'application/json',
    );
  });

  it('returns undefined when nothing offered is acceptable, or nothing is offered', () => {
    asserts.assertEquals(
      negotiate('image/png', ['application/json']),
      undefined,
    );
    asserts.assertEquals(negotiate('*/*', []), undefined);
    // q=0 explicitly refuses.
    asserts.assertEquals(
      negotiate('application/json;q=0', ['application/json']),
      undefined,
    );
  });

  it('ties resolve to the earliest offered (server preference)', () => {
    asserts.assertEquals(
      negotiate('*/*', ['text/html', 'application/json']),
      'text/html',
    );
  });
});

describe('compat.http.parseRange', () => {
  it('parses a closed range and clamps the end to size-1', () => {
    asserts.assertEquals(parseRange('bytes=0-99', 500), { start: 0, end: 99 });
    asserts.assertEquals(parseRange('bytes=10-99999', 500), {
      start: 10,
      end: 499,
    });
  });
  it('open-ended `a-` runs to the last byte', () => {
    asserts.assertEquals(parseRange('bytes=100-', 500), {
      start: 100,
      end: 499,
    });
  });
  it('suffix `-n` is the last n bytes (clamped at 0)', () => {
    asserts.assertEquals(parseRange('bytes=-100', 500), {
      start: 400,
      end: 499,
    });
    asserts.assertEquals(parseRange('bytes=-9999', 500), {
      start: 0,
      end: 499,
    });
  });
  it('unsatisfiable: start past the end, or a zero-length suffix', () => {
    asserts.assertEquals(parseRange('bytes=600-700', 500), 'unsatisfiable');
    asserts.assertEquals(parseRange('bytes=-0', 500), 'unsatisfiable');
  });
  it('undefined: no header, bad syntax, empty range, or a zero-size resource', () => {
    asserts.assertEquals(parseRange(null, 500), undefined);
    asserts.assertEquals(parseRange('items=0-9', 500), undefined);
    asserts.assertEquals(parseRange('bytes=-', 500), undefined);
    asserts.assertEquals(parseRange('bytes=0-9,20-29', 500), undefined); // multi-range → whole body
    asserts.assertEquals(parseRange('bytes=0-9', 0), undefined);
  });
  it('the resolved range typechecks as ByteRange', () => {
    const r = parseRange('bytes=0-9', 100);
    if (typeof r === 'object' && r !== undefined) {
      const range: ByteRange = r;
      asserts.assertEquals(range.start, 0);
    }
  });
});

describe('compat.http.cookies', () => {
  it('parseCookies: name→value map, percent-decoded, quotes stripped, malformed skipped', () => {
    asserts.assertEquals(
      parseCookies('sid=abc; theme=%22dark%22; q="quoted"; broken; =novalue'),
      { sid: 'abc', theme: '"dark"', q: 'quoted' },
    );
    asserts.assertEquals(parseCookies(null), {});
    asserts.assertEquals(parseCookies(''), {});
  });

  it('parseCookies keeps a raw value that is not valid percent-encoding', () => {
    asserts.assertEquals(parseCookies('x=%zz'), { x: '%zz' });
  });

  it('serializeCookie percent-encodes the value and appends attributes', () => {
    const opts: CookieOptions = {
      maxAge: 3600.9,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      domain: 'example.com',
    };
    asserts.assertEquals(
      serializeCookie('sid', 'a b;c', opts),
      'sid=a%20b%3Bc; Max-Age=3600; Domain=example.com; Path=/; Secure; HttpOnly; SameSite=Lax',
    );
  });

  it('serializeCookie renders Expires from a Date', () => {
    const c = serializeCookie('t', 'v', { expires: new Date(0) });
    asserts.assertStringIncludes(c, '; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });

  it('serializeCookie throws TypeError on an illegal cookie name', () => {
    asserts.assertThrows(() => serializeCookie('bad name', 'v'), TypeError);
    asserts.assertThrows(() => serializeCookie('a=b', 'v'), TypeError);
  });

  it('a serialized cookie round-trips through parse (value survives)', () => {
    const wire = serializeCookie('k', 'a b;c=d', {}).split(';')[0]!;
    asserts.assertEquals(parseCookies(wire), { k: 'a b;c=d' });
  });
});

describe('compat.http.contentTypeFor', () => {
  it('resolves common extensions with charset for text', () => {
    asserts.assertEquals(
      contentTypeFor('/a/b/page.html'),
      'text/html; charset=UTF-8',
    );
    asserts.assertEquals(
      contentTypeFor('data.json'),
      'application/json; charset=UTF-8',
    );
    asserts.assertStringIncludes(contentTypeFor('style.CSS'), 'text/css'); // case-insensitive
  });
  it('unknown / extension-less / dotfile → application/octet-stream', () => {
    asserts.assertEquals(
      contentTypeFor('archive.zzz'),
      'application/octet-stream',
    );
    asserts.assertEquals(contentTypeFor('README'), 'application/octet-stream');
    asserts.assertEquals(contentTypeFor('.env'), 'application/octet-stream'); // dotfile, not an ext
    asserts.assertEquals(
      contentTypeFor('/etc/hosts'),
      'application/octet-stream',
    );
  });
});
