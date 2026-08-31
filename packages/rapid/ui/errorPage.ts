/**
 * @fileoverview `DefaultErrorPage` — the built-in error page: the
 * terminal fallback of the error-template registry, so an app that
 * configures the UI never shows a browser a raw JSON envelope. Renders
 * ONLY the disclosure payload it is handed (PRODUCTION-collapsed
 * upstream — nothing extra can leak from here), branching copy by
 * status class; inside a core it inherits the app's document and css.
 *
 * @module
 */

import type { RapidTemplate } from '../types/mod.ts';
import { type Html, html, template } from './html.ts';

/** The payload fields the page reads (all optional — render what's there). */
type ErrorData = Record<string, unknown> & {
  status?: number;
  code?: string;
  message?: string;
  requestId?: string;
  mode?: string;
  details?: Record<string, unknown>;
  debug?: Record<string, unknown>;
};

const heading = (status: number): string =>
  status === 404
    ? 'Not found'
    : status >= 500
    ? 'Something went wrong'
    : 'That request didn’t work';

/** `details`/`debug` as escaped rows — objects stringified, never rendered raw. */
const rows = (record: Record<string, unknown>): Html[] =>
  Object.entries(record).map(([key, value]) =>
    html`
      <tr>
        <th>${key}</th>
        <td>${typeof value === 'string' ? value : JSON.stringify(value)}</td>
      </tr>
    `
  );

/**
 * The built-in error page. Fallback resolution puts it after every
 * configured `errorTemplates` key; pass your own `default` (or
 * `errorTemplate`) to replace it. DEVELOPMENT payloads carry `details`/
 * `debug`, so the page shows them; PRODUCTION payloads arrived
 * collapsed, so it cannot.
 */
export const DefaultErrorPage: RapidTemplate<Record<string, unknown>> =
  template<ErrorData>((e) => {
    const status = typeof e.status === 'number' ? e.status : 500;
    return html`
      <main class="rapid-error"
        style="max-width:36rem;margin:15vh auto 0;padding:0 1.5rem;font:16px/1.5 system-ui,sans-serif">
        <p style="font-size:.8rem;letter-spacing:.1em;opacity:.6">${status}${e
            .code
          ? html`
            · ${e.code}
          `
          : ''}</p>
        <h1 style="margin:.2rem 0 .6rem;font-size:1.5rem">${heading(
          status,
        )}</h1>
        ${e.message ? html`<p>${e.message}</p>` : ''}
        ${e.details
          ? html`
            <table style="margin-top:1rem;border-collapse:collapse;font-size:.9rem">
              <tbody>${rows(e.details)}</tbody>
            </table>
          `
          : ''}
        ${e.debug
          ? html`
            <pre
              style="margin-top:1rem;padding:1rem;border-radius:8px;background:#450a0a;color:#fecaca;overflow:auto;font-size:.8rem">${JSON
                .stringify(e.debug, null, 2)}</pre>
          `
          : ''}
        ${e.requestId
          ? html`<p style="margin-top:1.5rem;font-size:.75rem;opacity:.5">request ${e.requestId}</p>`
          : ''}
      </main>
    `;
  }, 'DefaultErrorPage');
