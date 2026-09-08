/**
 * @fileoverview `docs(app, options)` — the API reference page. Mounts a
 * templated route that renders the assembled OpenAPI document either with
 * rapid's own templates (the `rapid` viewer: server-side, no CDN, inside
 * the app's core/layout, composable from the exported parts, with a
 * generated credential box and try-it forms) or through a pinned
 * third-party viewer (`scalar` / `redoc` / `swagger`, SRI-checked). A
 * page, so it is `ui`-surface only; gated by `expose` like `openapi()`.
 *
 * @module
 */
import type { Application } from '../Application.ts';
import type { HTTPContext } from '../context/mod.ts';
import { RapidError } from '../errors/mod.ts';
import type {
  RapidContextState,
  RapidHTTPMiddleware,
  RapidTemplate,
  RapidView,
} from '../types/mod.ts';
import { type Html, html, htmlDocument } from '../ui/html.ts';
import { assertSecuritySchemes } from '../utils/buildOpenApi.ts';
import { assembleOpenApi, type OpenApiDocumentOptions } from './openapi.ts';
import {
  type DocsDocument,
  DocsPage,
  type DocsPageData,
  type DocsPartOptions,
} from './docs/render.ts';

export {
  DocsAuth,
  type DocsDocument,
  DocsOperation,
  type DocsOperationObject,
  type DocsPageData,
  type DocsPartOptions,
  DocsReference,
  DocsSchemas,
} from './docs/render.ts';

/** A third-party viewer: which one, and where its (SRI-pinned) assets come from. */
export type DocsViewerConfig = {
  kind: 'scalar' | 'redoc' | 'swagger';
  /** The viewer script — `integrity` is required (an unpinned CDN script is a supply-chain hole). */
  script: { src: string; integrity: string };
  /** A stylesheet the viewer needs (Swagger UI). */
  style?: { href: string; integrity: string };
};

/** Options for {@link docs} — the document options `openapi()` takes, plus the page's. */
export type DocsOptions = OpenApiDocumentOptions & {
  /**
   * Where the page is mounted.
   * @default '/docs'
   */
  path?: string;
  /**
   * `'rapid'` renders the reference server-side from rapid's templates;
   * `'scalar'` / `'redoc'` / `'swagger'` load a pinned viewer from jsDelivr
   * (versions and SRI hashes built in) — or give the assets yourself.
   * @default 'rapid'
   */
  viewer?: 'rapid' | 'scalar' | 'redoc' | 'swagger' | DocsViewerConfig;
  /**
   * The URL of the JSON document (`app.get('/openapi.json', openapi())`).
   * REQUIRED for a third-party viewer; the `rapid` viewer only links it.
   */
  spec?: string;
  /**
   * Page title.
   * @default `${app name} API`
   */
  title?: string;
  /** The module-tier layout for the page; `false` renders straight into the core. */
  layout?: RapidTemplate<{ body: Html; title?: string }> | false;
  /**
   * Replace the page BODY (rapid viewer only): compose from the exported
   * parts — `DocsAuth`, `DocsReference`, `DocsSchemas`, `DocsOperation`.
   */
  render?: (
    doc: DocsDocument,
    view: RapidView,
    options: DocsPartOptions,
  ) => Html;
  /**
   * Render the credential box and per-operation try-it forms (rapid
   * viewer), served by rapid's own script at `/__rapid/docs.js`. The
   * object form adds a sign-in form posting JSON to `login.path` and
   * reading `token` from the reply (a `pactAuth` `login()` route fits).
   * @default false
   */
  tryIt?: boolean | {
    login?: {
      path: string;
      /** @default ['identifier', 'password'] */
      fields?: readonly [identifier: string, password: string];
    };
  };
  /**
   * Which app modes serve the page — like `openapi()`.
   * @default 'DEVELOPMENT'
   */
  expose?: 'DEVELOPMENT' | 'PRODUCTION' | 'ALL';
  /** Route middleware run before the page (an `authorize()`). */
  guards?: readonly RapidHTTPMiddleware[];
};

/** Pinned third-party viewers (jsDelivr, SRI sha384). */
const VIEWERS: Record<'scalar' | 'redoc' | 'swagger', DocsViewerConfig> = {
  scalar: {
    kind: 'scalar',
    script: {
      src:
        'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.25.130/dist/browser/standalone.min.js',
      integrity:
        'sha384-oyL8y2b0EvVxYsvg2qNlT8xHcsvmySaljIklWvbATuTrccZSyvWnsPnmOunYQL2R',
    },
  },
  redoc: {
    kind: 'redoc',
    script: {
      src:
        'https://cdn.jsdelivr.net/npm/redoc@2.5.0/bundles/redoc.standalone.js',
      integrity:
        'sha384-4vOjrBu7SuDWXcAw1qFznVLA/sKL+0l4nn+J1HY8w7cpa6twQEYuh4b0Cwuo7CyX',
    },
  },
  swagger: {
    kind: 'swagger',
    script: {
      src:
        'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.29.0/swagger-ui-bundle.js',
      integrity:
        'sha384-fU7N0ipr7Rsi0J81QNqlN7WXb/tyAL8b16lEAJ2a01m7wdX+RU61ggqmxn8p3aJb',
    },
    style: {
      href:
        'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.29.0/swagger-ui.css',
      integrity:
        'sha384-++DMKo1369T5pxDNqojF1F91bYxYiT1N7b1M15a7oCzEodfljztKlApQoH6eQSKI',
    },
  },
};

/** Where the rapid-served scripts live. */
const TRYIT_PATH = '/__rapid/docs.js';
const SWAGGER_INIT_PATH = '/__rapid/docs-swagger.js';

const fail = (message: string, details?: Record<string, unknown>): never => {
  throw new RapidError('RAPID_CONFIG', {
    message: `docs(): ${message}`,
    details,
  });
};

/** The markup a third-party viewer needs: its mount node plus pinned assets. */
function viewerShell(
  viewer: DocsViewerConfig,
  spec: string,
  title: string,
): Html {
  const script = html`
    <script src="${viewer.script.src}" integrity="${viewer.script
      .integrity}" crossorigin="anonymous"
      defer></script>
  `;
  const style = viewer.style === undefined ? html`` : html`
    <link rel="stylesheet" href="${viewer.style.href}" integrity="${viewer.style
      .integrity}"
      crossorigin="anonymous">
  `;
  switch (viewer.kind) {
    case 'scalar':
      return html`
        ${style}<script id="api-reference" data-url="${spec}"
          data-configuration="${JSON.stringify({
            hideModels: false,
          })}"></script>${script}
      `;
    case 'redoc':
      return html`${style}<redoc spec-url="${spec}"></redoc>${script}`;
    case 'swagger':
      return html`
        ${style}<div id="swagger-ui" data-url="${spec}"
          title="${title}"></div>${script}<script src="${SWAGGER_INIT_PATH}" defer></script>
      `;
  }
}

/**
 * Mount the API reference page at `options.path`.
 *
 * @throws {RapidError} RAPID_CONFIG at mount for a path not starting with
 *   `/`, a third-party viewer without `spec` (or with unpinned assets),
 *   `render` on a third-party viewer, or an invalid security scheme.
 */
export function docs<S extends RapidContextState = RapidContextState>(
  app: Application<S>,
  options: DocsOptions = {},
): void {
  const path = options.path ?? '/docs';
  if (!path.startsWith('/')) fail("path must start with '/'", { path });
  const viewer: 'rapid' | DocsViewerConfig = options.viewer === undefined ||
      options.viewer === 'rapid'
    ? 'rapid'
    : typeof options.viewer === 'string'
    ? VIEWERS[options.viewer]
    : options.viewer;
  if (viewer !== 'rapid') {
    if (options.spec === undefined) {
      fail(
        `the '${viewer.kind}' viewer needs the JSON document URL in \`spec\``,
      );
    }
    if (!viewer.script.integrity.startsWith('sha')) {
      fail('a third-party viewer script must carry an SRI `integrity` hash');
    }
    if (options.render !== undefined) {
      fail('`render` composes the rapid viewer only');
    }
  }
  if (options.securitySchemes !== undefined) {
    assertSecuritySchemes(options.securitySchemes, 'docs()');
  }
  const expose = options.expose ?? 'DEVELOPMENT';
  const title = options.title ?? `${app.option('name')} API`;
  const tryIt: DocsPageData['tryIt'] = options.tryIt === undefined ||
      options.tryIt === false || viewer !== 'rapid'
    ? false
    : options.tryIt === true
    ? {}
    : {
      ...(options.tryIt.login !== undefined
        ? {
          login: {
            path: options.tryIt.login.path,
            fields: options.tryIt.login.fields ?? ['identifier', 'password'],
          },
        }
        : {}),
    };
  const cache = new Map<string, Record<string, unknown>>();

  const render: RapidTemplate<unknown> = {
    name: 'RapidDocs',
    render(data, view) {
      const page = data as DocsPageData & {
        viewer: 'rapid' | DocsViewerConfig;
      };
      if (page.viewer !== 'rapid') {
        const body = viewerShell(page.viewer, options.spec!, page.title);
        return page.standalone
          ? htmlDocument({ title: page.title, body })
          : body;
      }
      if (options.render !== undefined) {
        const partOptions: DocsPartOptions = {
          tryIt: page.tryIt !== false,
          ...(page.tryIt !== false && page.tryIt.login
            ? { login: page.tryIt.login }
            : {}),
        };
        const body = html`${options.render(page.doc, view, partOptions)}${
          page.tryIt !== false
            ? html`<script src="${page.scriptPath}" defer></script>`
            : ''
        }`;
        return page.standalone
          ? htmlDocument({ title: page.title, body })
          : body;
      }
      return DocsPage(page, view);
    },
  };

  app.get(
    path,
    {
      template: {
        render,
        prefer: 'html',
        title,
        ...(options.layout !== undefined ? { layout: options.layout } : {}),
      },
    },
    ...(options.guards ?? []),
    (ctx: HTTPContext<S>) => {
      if (expose !== 'ALL' && expose !== ctx.app.mode) {
        throw new RapidError('RAPID_NOT_FOUND');
      }
      const version = new URL(ctx.request.url).searchParams.get('version') ??
        '';
      const doc = assembleOpenApi(
        ctx.app,
        options,
        cache,
        version,
      ) as unknown as DocsDocument;
      const ui = ctx.app.uiOptions;
      const layout = options.layout !== undefined ? options.layout : ui?.layout;
      const data: DocsPageData & { viewer: 'rapid' | DocsViewerConfig } = {
        doc,
        title,
        standalone: ui?.core === undefined &&
          (layout === undefined || layout === false),
        tryIt,
        ...(options.spec !== undefined ? { spec: options.spec } : {}),
        scriptPath: TRYIT_PATH,
        viewer,
      };
      return { content: data as unknown as Record<string, unknown> };
    },
  );
  // UI infrastructure, like the runtime scripts: the reference must not
  // list itself, and the page has no api-surface existence anyway.
  app.routes[app.routes.length - 1]!.uiOnly = true;

  const has = (p: string) => app.routes.some((r) => r.path === p);
  if (tryIt !== false && !has(TRYIT_PATH)) {
    app._scriptRoute(
      TRYIT_PATH,
      () =>
        import('./docs/tryit.ts').then((
          m,
        ) => [m.DOCS_TRYIT, m.DOCS_TRYIT_ETAG]),
    );
  }
  if (
    viewer !== 'rapid' && viewer.kind === 'swagger' && !has(SWAGGER_INIT_PATH)
  ) {
    app._scriptRoute(
      SWAGGER_INIT_PATH,
      () =>
        import('./docs/tryit.ts').then((
          m,
        ) => [m.DOCS_SWAGGER_INIT, m.DOCS_SWAGGER_INIT_ETAG]),
    );
  }
}
