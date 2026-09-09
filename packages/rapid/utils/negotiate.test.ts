/**
 * @fileoverview negotiate() — Accept-header content negotiation: default to the
 * first offer, honour q-values and specificity, resolve ties to server
 * preference, and return undefined when nothing is acceptable.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { negotiate } from './negotiate.ts';

describe('negotiate()', () => {
  it('no / blank Accept → the first offered (server default)', () => {
    asserts.assertEquals(
      negotiate(null, ['application/json', 'text/html']),
      'application/json',
    );
    asserts.assertEquals(negotiate('', ['text/html']), 'text/html');
    asserts.assertEquals(negotiate('   ', ['text/html']), 'text/html');
  });

  it('picks the offered the client prefers by q-value', () => {
    asserts.assertEquals(
      negotiate('text/html;q=0.9, application/json;q=1.0', [
        'application/json',
        'text/html',
      ]),
      'application/json',
    );
    asserts.assertEquals(
      negotiate('application/json;q=0.2, text/html;q=0.8', [
        'application/json',
        'text/html',
      ]),
      'text/html',
    );
  });

  it('a most-specific Accept entry decides an offer’s quality', () => {
    // */* at a lower q must not beat an exact match at a higher q.
    asserts.assertEquals(
      negotiate('*/*;q=0.1, application/json;q=0.9', [
        'text/html',
        'application/json',
      ]),
      'application/json',
    );
    // type/* matches when no exact entry exists.
    asserts.assertEquals(
      negotiate('text/*', ['application/json', 'text/html']),
      'text/html',
    );
  });

  it('ties resolve to the earliest offered (server preference)', () => {
    asserts.assertEquals(
      negotiate('*/*', ['application/json', 'text/html']),
      'application/json',
    );
  });

  it('returns undefined when the client accepts none of the offers', () => {
    asserts.assertEquals(
      negotiate('text/plain', ['application/json', 'text/html']),
      undefined,
    );
    // Explicitly refused (q=0) is not acceptable.
    asserts.assertEquals(
      negotiate('application/json;q=0', ['application/json']),
      undefined,
    );
  });

  it('no offers → undefined', () => {
    asserts.assertEquals(negotiate('*/*', []), undefined);
  });
});
