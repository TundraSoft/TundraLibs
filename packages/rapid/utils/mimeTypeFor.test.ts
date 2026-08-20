/**
 * @fileoverview mimeTypeFor — extension → content-type for file serving.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { mimeTypeFor } from './mimeTypeFor.ts';

describe('rapid.mimeTypeFor', () => {
  it('maps common web extensions (case-insensitive)', () => {
    asserts.assertEquals(mimeTypeFor('index.html'), 'text/html; charset=utf-8');
    asserts.assertEquals(
      mimeTypeFor('a/b/app.JS'),
      'text/javascript; charset=utf-8',
    );
    asserts.assertEquals(mimeTypeFor('style.css'), 'text/css; charset=utf-8');
    asserts.assertEquals(mimeTypeFor('logo.svg'), 'image/svg+xml');
    asserts.assertEquals(mimeTypeFor('photo.JPEG'), 'image/jpeg');
    asserts.assertEquals(
      mimeTypeFor('/deep/path/data.json'),
      'application/json; charset=utf-8',
    );
  });

  it('falls back to octet-stream for unknown / extension-less names', () => {
    asserts.assertEquals(
      mimeTypeFor('file.unknownext'),
      'application/octet-stream',
    );
    asserts.assertEquals(mimeTypeFor('README'), 'application/octet-stream');
    asserts.assertEquals(
      mimeTypeFor('archive.tar.zzz'),
      'application/octet-stream',
    );
  });

  it('does not treat a leading-dot name as an extension', () => {
    // ".env" is a dotfile, not an ".env"-extensioned file.
    asserts.assertEquals(mimeTypeFor('.env'), 'application/octet-stream');
    asserts.assertEquals(
      mimeTypeFor('/etc/.gitignore'),
      'application/octet-stream',
    );
  });
});
