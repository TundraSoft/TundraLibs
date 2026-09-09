/**
 * @fileoverview `when` / `each` — truthiness branching that never leaks
 * `0`/`''`, lazy branches, narrowed values, and list rendering with a
 * first-class empty state.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { each, when } from './flow.ts';
import { html, render } from './html.ts';

describe('rapid.ui.flow', () => {
  describe('when', () => {
    it('renders the then-branch for a truthy value and hands it over narrowed', () => {
      const user: { name: string } | undefined = { name: 'a<b' };
      const out = render(
        html`<p>${when(user, (u) => html`<b>${u.name}</b>`)}</p>`,
      );
      asserts.assertEquals(out, '<p><b>a&lt;b</b></p>'); // still escaped
    });

    it("renders NOTHING for 0 and '' — the values `&&` would leak as text", () => {
      for (const falsy of [0, '', false, null, undefined, 0n]) {
        asserts.assertEquals(
          render(html`<p>${when(falsy, () => html`<b>x</b>`)}</p>`),
          '<p></p>',
          `leaked for ${String(falsy)}`,
        );
      }
    });

    it('takes the otherwise-branch when falsy, and evaluates only the taken branch', () => {
      const out = render(
        html`${
          when(0, () => {
            throw new Error('then must not run');
          }, () => html`none`)
        }`,
      );
      asserts.assertEquals(out, 'none');
      asserts.assertEquals(
        render(html`${
          when(1, () => html`some`, () => {
            throw new Error('otherwise must not run');
          })
        }`),
        'some',
      );
    });
  });

  describe('each', () => {
    it('renders one row per item with its index, escaping item values', () => {
      const out = render(
        html`<ul>${
          each(['a<b', 'c'], (t, i) => html`<li data-i="${i}">${t}</li>`)
        }</ul>`,
      );
      asserts.assertEquals(
        out,
        '<ul><li data-i="0">a&lt;b</li><li data-i="1">c</li></ul>',
      );
    });

    it('renders the empty state for an empty list — and nothing without one', () => {
      asserts.assertEquals(
        render(each([], () => html`<li></li>`, () => html`<p>No items</p>`)),
        '<p>No items</p>',
      );
      asserts.assertEquals(render(each([], () => html`<li></li>`)), '');
    });

    it('accepts any iterable, not just arrays', () => {
      const out = render(each(new Set(['x', 'y']), (t) => html`<i>${t}</i>`));
      asserts.assertEquals(out, '<i>x</i><i>y</i>');
    });
  });
});
