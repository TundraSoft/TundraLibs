/**
 * @fileoverview The signing template: the frozen key set per direction,
 * boot-time rejection of bad templates, rendering, and the RFC 9530
 * digest format.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  compileTemplate,
  contentDigest,
  REQUEST_TEMPLATE,
  RESPONSE_TEMPLATE,
} from './template.ts';
import { PactError } from '../errors/mod.ts';

function rejects(source: string, kind: 'request' | 'response', reason: string) {
  const error = asserts.assertThrows(
    () => compileTemplate(source, kind),
    PactError,
  );
  asserts.assertStrictEquals(error.code, 'INVALID_OPTION');
  asserts.assertStringIncludes(error.message, reason);
}

describe('compileTemplate', () => {
  it('should compile the defaults and keep literal text as separators', () => {
    const request = compileTemplate(REQUEST_TEMPLATE, 'request');
    asserts.assertEquals(request.keys, [
      '@method',
      '@path',
      '@query',
      'x-timestamp',
      'content-digest',
    ]);
    asserts.assertStrictEquals(
      request.render((key) => `<${key}>`),
      '<@method>\n<@path><@query>\n<x-timestamp>\n<content-digest>',
    );
    const response = compileTemplate(RESPONSE_TEMPLATE, 'response');
    asserts.assertEquals(response.keys, [
      '@status',
      'x-timestamp',
      'content-digest',
    ]);
    // Any other lowercase header is a request key; separators are free-form.
    const custom = compileTemplate(
      '${@method}&${@path}&${@target-uri}&${x-nonce}&${x-timestamp}&${x-tenant}&${content-digest}',
      'request',
    );
    asserts.assertEquals(custom.keys.slice(5), ['x-tenant', 'content-digest']);
  });

  it('should reject unknown, uppercase, misplaced, and missing keys at boot', () => {
    rejects(
      '${@method}${@path}${x-timestamp}',
      'request',
      "'${content-digest}'",
    );
    rejects('${@status}${content-digest}', 'response', "'${x-timestamp}'");
    rejects(
      '${@status}${@method}${@path}${x-timestamp}${content-digest}',
      'request',
      "unknown template key '${@status}'",
    );
    rejects(
      '${@status}${x-timestamp}${content-digest}${x-tenant}',
      'response',
      "unknown template key '${x-tenant}'",
    );
    rejects(
      '${@METHOD}${@path}${x-timestamp}${content-digest}',
      'request',
      'lowercase',
    );
    rejects('plain text', 'request', 'names no component');
    rejects(
      '${@method}${@path}${x-timestamp}${content digest}',
      'request',
      'invalid',
    );
  });
});

describe('contentDigest', () => {
  it('should produce sha-256=:base64: over the exact bytes, empty body included', async () => {
    asserts.assertStrictEquals(
      await contentDigest(null),
      'sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:',
    );
    const text = await contentDigest('{"hello": "world"}');
    // RFC 9530 §B.2 example digest.
    asserts.assertStrictEquals(
      text,
      'sha-256=:X48E9qOokqqrvdts8nOJRJN3OWDUoyWxBf7kbu9DBPE=:',
    );
    asserts.assertStrictEquals(
      await contentDigest(new TextEncoder().encode('{"hello": "world"}')),
      text,
    );
  });
});
