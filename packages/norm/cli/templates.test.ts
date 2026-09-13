/**
 * @fileoverview Tests for {@link render} — the `{{token}}` substitution
 * helper the CLI's scaffold templates use.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { render } from './templates.ts';

describe('norm.cli render', () => {
  it('replaces every {{token}} from vars', () => {
    asserts.assertEquals(
      render('hello {{name}}, v{{version}}', { name: 'norm', version: '1' }),
      'hello norm, v1',
    );
  });

  it('replaces an unmatched token with an empty string', () => {
    asserts.assertEquals(render('{{missing}}x', {}), 'x');
  });
});
