/**
 * @fileoverview The API reference page, rendered server-side from the
 * assembled OpenAPI document with rapid's own templates — no bundler, no
 * CDN, no JavaScript needed to read it. Exported as PARTS
 * ({@link DocsReference}, {@link DocsOperation}, {@link DocsSchemas},
 * {@link DocsAuth}) so an app composes its own page from them; the
 * default page ({@link DocsPage}) is what `docs()` renders.
 *
 * @module
 */
import { each, when } from '../../ui/flow.ts';
import { Html, html, htmlDocument, raw } from '../../ui/html.ts';
import type { RapidView } from '../../types/mod.ts';
import type { OpenApiSecurityScheme } from '../../utils/buildOpenApi.ts';

/** The slice of an OpenAPI 3.0 operation the reference renders. */
export type DocsOperationObject = {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: readonly string[];
  deprecated?: boolean;
  parameters?: readonly {
    name: string;
    in: string;
    required?: boolean;
    description?: string;
    schema?: unknown;
  }[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: unknown }>;
  };
  responses?: Record<
    string,
    { description?: string; content?: Record<string, { schema?: unknown }> }
  >;
  security?: readonly Record<string, readonly string[]>[];
  'x-version'?: string;
};

/** The slice of the assembled document the reference reads. */
export type DocsDocument = {
  info?: { title?: string; version?: string; description?: string };
  servers?: readonly { url: string; description?: string }[];
  tags?: readonly { name: string; description?: string }[];
  'x-tagGroups'?: readonly { name: string; tags: readonly string[] }[];
  'x-versions'?: readonly string[];
  paths: Record<string, Record<string, DocsOperationObject>>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, OpenApiSecurityScheme>;
  };
};

/** Options the parts share. */
export type DocsPartOptions = {
  /** Render the try-it form under each operation (needs the `tryIt` script). */
  tryIt?: boolean;
  /** The sign-in form `DocsAuth` adds — posts JSON to `path`, reads `token` back. */
  login?: {
    path: string;
    fields: readonly [identifier: string, password: string];
  };
};

/** What the default page template receives from the `docs()` handler. */
export type DocsPageData = {
  doc: DocsDocument;
  title: string;
  /** No core and no layout wrap the page — emit a full document. */
  standalone: boolean;
  tryIt: false | { login?: DocsPartOptions['login'] };
  /** The JSON document's URL, for the download link. */
  spec?: string;
  /** Where the try-it script is served. */
  scriptPath: string;
};

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The anchor id of one operation. */
export const operationId = (method: string, path: string): string =>
  `op-${method}-${slug(path) || 'root'}`;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** A JSON-Schema node → compact HTML: refs link, objects table, arrays nest. */
export function schemaHtml(schema: unknown, depth = 0): Html {
  if (!isRecord(schema)) return html`<code>${String(schema ?? 'any')}</code>`;
  const ref = schema.$ref;
  if (typeof ref === 'string') {
    const name = ref.slice(ref.lastIndexOf('/') + 1);
    return html`<a class="docs-ref" href="#schema-${slug(name)}">${name}</a>`;
  }
  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    const list = schema[key];
    if (Array.isArray(list)) {
      const joiner = key === 'allOf' ? ' & ' : ' | ';
      return html`<span class="docs-union">${
        each(list, (s, i) =>
          html`${i > 0 ? joiner : ''}${schemaHtml(s, depth + 1)}`)
      }</span>`;
    }
  }
  const type = typeof schema.type === 'string' ? schema.type : undefined;
  if (Array.isArray(schema.enum)) {
    return html`<code>${
      (schema.enum as unknown[]).map((v) => JSON.stringify(v)).join(' | ')
    }</code>`;
  }
  if (type === 'array') {
    return html`<span>array of ${schemaHtml(schema.items, depth + 1)}</span>`;
  }
  const props = isRecord(schema.properties) ? schema.properties : undefined;
  if (type === 'object' || props !== undefined) {
    if (props === undefined || depth > 4) return html`<code>object</code>`;
    const required = new Set(
      Array.isArray(schema.required) ? (schema.required as string[]) : [],
    );
    return html`
      <table class="docs-props">
        <tbody>${each(Object.entries(props), ([name, prop]) =>
          html`
            <tr>
              <td><code>${name}</code>${required.has(name)
                ? html`<span class="docs-req">required</span>`
                : ''}</td>
              <td>${schemaHtml(prop, depth + 1)}</td>
              <td>${isRecord(prop) && typeof prop.description === 'string'
                ? prop.description
                : ''}</td>
            </tr>
          `)}</tbody>
      </table>
    `;
  }
  const format = typeof schema.format === 'string' ? ` (${schema.format})` : '';
  if (type !== undefined) return html`<code>${type}${format}</code>`;
  return html`<pre class="docs-json">${JSON.stringify(schema, null, 2)}</pre>`;
}

/** The security requirement badges of one operation (`public` for `[]`). */
function securityBadges(op: DocsOperationObject): Html {
  if (op.security === undefined) return html``;
  if (op.security.length === 0) {
    return html`<span class="docs-badge docs-public">public</span>`;
  }
  const names = [...new Set(op.security.flatMap((r) => Object.keys(r)))];
  return html`${
    each(names, (n) => html`<span class="docs-badge docs-secured">${n}</span>`)
  }`;
}

/** One operation: header, description, parameters, body, responses, try-it. */
export function DocsOperation(
  path: string,
  method: string,
  op: DocsOperationObject,
  options: DocsPartOptions = {},
): Html {
  const id = operationId(method, path);
  const params = op.parameters ?? [];
  const body = op.requestBody?.content?.['application/json']?.schema;
  const security = op.security === undefined
    ? ''
    : [...new Set(op.security.flatMap((r) => Object.keys(r)))].join(',');
  return html`<article class="docs-op" id="${id}">
  <h3><span class="docs-method docs-${method}">${method.toUpperCase()}</span> <code>${path}</code>${
    when(op['x-version'], (v) =>
      html`
        <span class="docs-badge">v${v}</span>
      `)
  }${
    op.deprecated
      ? html`
        <span class="docs-badge docs-deprecated">deprecated</span>
      `
      : ''
  } ${securityBadges(op)}</h3>
  ${when(op.summary, (s) => html`<p class="docs-summary">${s}</p>`)}
  ${when(op.description, (d) => html`<p>${d}</p>`)}
  ${
    when(params.length, () =>
      html`
        <h4>Parameters</h4>
        <table class="docs-params">
          <thead>
            <tr>
              <th>name</th>
              <th>in</th>
              <th>type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${each(params, (p) =>
            html`
              <tr>
                <td><code>${p.name}</code>${p.required
                  ? html`<span class="docs-req">required</span>`
                  : ''}</td>
                <td>${p.in}</td>
                <td>${schemaHtml(p.schema)}</td>
                <td>${p.description ?? ''}</td>
              </tr>
            `)}</tbody>
        </table>
      `)
  }
  ${when(body, (b) => html`<h4>Request body</h4>${schemaHtml(b)}`)}
  ${
    when(op.responses, (responses) =>
      html`
        <h4>Responses</h4>
        <dl class="docs-responses">${each(
          Object.entries(responses),
          ([status, r]) =>
            html`
              <dt><code>${status}</code> ${r.description ?? ''}</dt>
              <dd>${when(
                r.content?.['application/json']?.schema,
                (s) => schemaHtml(s),
              )}</dd>
            `,
        )}</dl>
      `)
  }
  ${
    when(options.tryIt, () =>
      html`
        <form class="docs-try" data-docs-try data-method="${method
          .toUpperCase()}"
          data-path="${path}" data-security="${security}">
            ${each(params, (p) =>
              html`<label>${p.name} <small>(${p.in})</small><input name="${p.name}" data-docs-param="${p.name}" data-docs-in="${p.in}"${
                p.required ? ' required' : ''
              }></label>`)}
            ${when(
              body,
              () =>
                html`<label>body<textarea data-docs-body rows="4">{}</textarea></label>`,
            )}
            <button type="submit">Try it</button>
            <pre class="docs-result" data-docs-result hidden></pre>
          </form>
      `)
  }
</article>`;
}

/** Group the document's operations by tag (untagged under `Other`), tag groups first. */
function operationsByTag(doc: DocsDocument): {
  groups: { name?: string; tags: string[] }[];
  ops: Map<string, { path: string; method: string; op: DocsOperationObject }[]>;
} {
  const ops = new Map<
    string,
    { path: string; method: string; op: DocsOperationObject }[]
  >();
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of METHODS) {
      const op = item[method];
      if (op === undefined) continue;
      const tags = op.tags !== undefined && op.tags.length > 0
        ? op.tags
        : ['Other'];
      for (const tag of tags) {
        const list = ops.get(tag) ?? [];
        list.push({ path, method, op });
        ops.set(tag, list);
      }
    }
  }
  const grouped = new Set<string>();
  const groups: { name?: string; tags: string[] }[] = [];
  for (const g of doc['x-tagGroups'] ?? []) {
    const tags = g.tags.filter((t) => ops.has(t));
    if (tags.length === 0) continue;
    groups.push({ name: g.name, tags: [...tags] });
    for (const t of tags) grouped.add(t);
  }
  const rest = [...ops.keys()].filter((t) => !grouped.has(t));
  if (rest.length > 0) groups.push({ tags: rest });
  return { groups, ops };
}

/** The navigation plus every operation, grouped by tag. */
export function DocsReference(
  doc: DocsDocument,
  options: DocsPartOptions = {},
): Html {
  const { groups, ops } = operationsByTag(doc);
  const tagDoc = new Map((doc.tags ?? []).map((t) => [t.name, t.description]));
  return html`<div class="docs-reference">
  <nav class="docs-nav" aria-label="Operations">${
    each(groups, (g) =>
      html`${
        when(g.name, (n) => html`<h4>${n}</h4>`)
      }<ul>${
        each(g.tags, (tag) =>
          html`<li><a href="#tag-${slug(tag)}">${tag}</a><ul>${
            each(ops.get(tag) ?? [], ({ path, method }) =>
              html`<li><a href="#${
                operationId(method, path)
              }"><span class="docs-method docs-${method}">${method.toUpperCase()}</span> ${path}</a></li>`)
          }</ul></li>`)
      }</ul>`)
  }</nav>
  <div class="docs-body">${
    each(groups, (g) =>
      html`${
        each(g.tags, (tag) =>
          html`
            <section class="docs-tag"
              id="tag-${slug(tag)}"><h2>${tag}</h2>${when(
                tagDoc.get(tag),
                (d) => html`<p>${d}</p>`,
              )}${each(
                ops.get(tag) ?? [],
                ({ path, method, op }) =>
                  DocsOperation(path, method, op, options),
              )}</section>
          `)
      }`)
  }</div>
</div>`;
}

/** `components.schemas`, each with an anchor the reference links to. */
export function DocsSchemas(doc: DocsDocument): Html {
  const schemas = Object.entries(doc.components?.schemas ?? {});
  return when(
    schemas.length,
    () =>
      html`<section class="docs-schemas" id="schemas"><h2>Schemas</h2>${
        each(schemas, ([name, schema]) =>
          html`
            <article
              id="schema-${slug(
                name,
              )}"><h3><code>${name}</code></h3>${schemaHtml(schema)}</article>
          `)
      }</section>`,
  );
}

/** The control(s) the credential box renders for one security scheme. */
function credentialControl(name: string, scheme: OpenApiSecurityScheme): Html {
  const common =
    html`data-docs-credential="${name}" data-docs-type="${scheme.type}"`;
  switch (scheme.type) {
    case 'http':
      if (scheme.scheme.toLowerCase() === 'basic') {
        return html`<label>${name} <small>(HTTP basic)</small>
  <input placeholder="user" autocomplete="username" data-docs-part="user" ${common} data-docs-scheme="basic">
  <input placeholder="password" type="password" autocomplete="current-password" data-docs-part="password" ${common} data-docs-scheme="basic"></label>`;
      }
      return html`<label>${name} <small>(HTTP ${scheme.scheme}${
        scheme.bearerFormat ? `, ${scheme.bearerFormat}` : ''
      })</small><input placeholder="token" autocomplete="off" ${common} data-docs-scheme="${scheme.scheme}"></label>`;
    case 'apiKey':
      return html`<label>${name} <small>(${scheme.in} <code>${scheme.name}</code>)</small><input placeholder="${scheme.name}" autocomplete="off" ${common} data-docs-in="${scheme.in}" data-docs-name="${scheme.name}"></label>`;
    case 'oauth2': {
      const url = Object.values(scheme.flows).find((f) => f?.authorizationUrl)
        ?.authorizationUrl;
      return html`<label>${name} <small>(OAuth 2.0${
        url
          ? html`
            — <a href="${url}" rel="noopener">authorize</a>
          `
          : ''
      })</small><input placeholder="access token" autocomplete="off" ${common} data-docs-scheme="bearer"></label>`;
    }
    case 'openIdConnect':
      return html`<label>${name} <small>(OpenID Connect — <a href="${scheme.openIdConnectUrl}" rel="noopener">discovery</a>)</small><input placeholder="id token" autocomplete="off" ${common} data-docs-scheme="bearer"></label>`;
  }
}

/**
 * The credential box: one control per declared security scheme, and the
 * sign-in form when `login` is configured. Values stay in the browser's
 * session storage and are applied by the try-it script; a custom box can
 * call `rapid.docs.setCredential(name, value)` instead.
 */
export function DocsAuth(
  doc: DocsDocument,
  options: DocsPartOptions = {},
): Html {
  const schemes = Object.entries(doc.components?.securitySchemes ?? {});
  return html`<section class="docs-auth" data-docs-auth>
  <h2>Credentials</h2>
  ${
    when(options.login, (login) =>
      html`
        <form class="docs-login" data-docs-login="${login.path}"
          data-docs-login-fields="${login.fields[0]},${login.fields[1]}">
            <label>${login.fields[0]}<input name="${login
              .fields[0]}" autocomplete="username" required></label>
            <label>${login.fields[1]}<input name="${login
              .fields[
                1
              ]}" type="password" autocomplete="current-password" required></label>
            <button type="submit">Sign in</button> <output data-docs-login-status></output>
          </form>
      `)
  }
  ${
    each(schemes, ([name, scheme]) =>
      credentialControl(name, scheme), () =>
      html`
        <p
          class="docs-muted">No security schemes are declared — <code>openapi({ securitySchemes })</code> adds them.</p>
      `)
  }
  <p class="docs-muted">Stored in this tab's session storage only; sent with "Try it" requests to this origin.</p>
</section>`;
}

/** The stylesheet the default page carries (inline — scoped by the `docs-` prefix). */
export const DOCS_CSS = `
.docs{font:15px/1.5 system-ui,sans-serif;color:#1f2328;max-width:72rem;margin:0 auto;padding:1.5rem}
.docs h1{margin:0 0 .25rem}.docs h2{margin:2rem 0 .5rem;border-bottom:1px solid #d0d7de;padding-bottom:.25rem}
.docs h3{margin:1.25rem 0 .25rem;font-weight:600}.docs h4{margin:.75rem 0 .25rem;font-size:.85rem;text-transform:uppercase;color:#57606a}
.docs code{font:.9em ui-monospace,monospace;background:#f6f8fa;padding:.1em .3em;border-radius:4px}
.docs-reference{display:grid;grid-template-columns:16rem 1fr;gap:2rem}
.docs-nav ul{list-style:none;padding-left:.75rem;margin:.25rem 0}.docs-nav a{text-decoration:none;color:inherit}.docs-nav a:hover{text-decoration:underline}
.docs-method{display:inline-block;min-width:3.5rem;text-align:center;font:600 .7rem ui-monospace,monospace;padding:.15rem .3rem;border-radius:4px;color:#fff;background:#57606a}
.docs-get{background:#1a7f37}.docs-post{background:#0969da}.docs-put{background:#9a6700}.docs-patch{background:#8250df}.docs-delete{background:#cf222e}
.docs-badge{display:inline-block;font-size:.7rem;padding:.1rem .4rem;border-radius:999px;background:#eaeef2;color:#57606a;margin-left:.25rem}
.docs-secured{background:#fff8c5;color:#7d4e00}.docs-public{background:#dafbe1;color:#1a7f37}.docs-deprecated{background:#ffebe9;color:#cf222e}
.docs-req{font-size:.7rem;color:#cf222e;margin-left:.3rem}
.docs table{border-collapse:collapse;width:100%;font-size:.9rem}.docs td,.docs th{text-align:left;padding:.3rem .5rem;border-bottom:1px solid #eaeef2;vertical-align:top}
.docs-op{padding:1rem 0;border-bottom:1px solid #eaeef2}.docs-summary{font-weight:500}
.docs-json,.docs-result{background:#f6f8fa;padding:.75rem;border-radius:6px;overflow:auto;font-size:.85rem}
.docs-try,.docs-auth,.docs-login{display:grid;gap:.5rem;margin:.75rem 0;padding:.75rem;background:#f6f8fa;border-radius:6px}
.docs-try label,.docs-auth label,.docs-login label{display:grid;gap:.2rem;font-size:.85rem}
.docs input,.docs textarea{font:inherit;padding:.35rem .5rem;border:1px solid #d0d7de;border-radius:4px}
.docs button{font:inherit;padding:.4rem .9rem;border:0;border-radius:6px;background:#0969da;color:#fff;cursor:pointer;justify-self:start}
.docs-muted{color:#57606a;font-size:.85rem}
@media (max-width:48rem){.docs-reference{grid-template-columns:1fr}}
`;

/**
 * The default page: header (title, version, download link), the
 * credential box when try-it is on, the reference, the schemas, and the
 * try-it script tag. Rendered inside the app's core/layout when there is
 * one; a full document otherwise.
 */
export function DocsPage(data: DocsPageData, view: RapidView): Html {
  const { doc } = data;
  const tryIt = data.tryIt !== false;
  const body = html`<div class="docs">
  <header>
    <h1>${data.title}</h1>
    <p class="docs-muted">${
    when(doc.info?.version, (v) =>
      html`
        version ${v} ·
      `)
  }${
    when(data.spec, (s) => html`<a href="${view.asset(s)}">OpenAPI JSON</a>`)
  }${
    when(doc['x-versions']?.length, () =>
      html`
        · API versions: ${(doc['x-versions'] ?? []).join(', ')}
      `)
  }</p>
    ${when(doc.info?.description, (d) => html`<p>${d}</p>`)}
  </header>
  ${
    when(tryIt, () =>
      DocsAuth(doc, data.tryIt === false ? {} : { login: data.tryIt.login }))
  }
  ${DocsReference(doc, { tryIt })}
  ${DocsSchemas(doc)}
  ${when(tryIt, () => html`<script src="${data.scriptPath}" defer></script>`)}
</div>`;
  const style = html`<style>${raw(DOCS_CSS)}</style>`;
  return data.standalone
    ? htmlDocument({ title: data.title, head: style, body })
    : html`${style}${body}`;
}
