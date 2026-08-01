/**
 * `RadRouter` — a compressed radix-tree HTTP router with parameter,
 * greedy, and version-aware matching.
 *
 * The trie is **path-compressed**: a static node stores a multi-character
 * label, not a single segment. Routes with shared prefixes
 * (e.g. /api/v1/users, /api/v1/posts) share that prefix as a single node
 * and split lazily on insert. Lookup walks the URL string with a single
 * integer cursor — no path.split('/') allocation, no Map.get() per hop.
 *
 * Matching priority at every node: static > param > greedy.
 * Handler resolution at every leaf (three-tier):
 *   exact requested version > configured defaultVersion > unversioned slot.
 *
 * Path matching is case-sensitive by default (RFC 3986). Pass
 * `caseSensitive: false` for forgiving matching.
 *
 * Slash handling: registration is lenient (`/api//users` → `/api/users`);
 * lookup is strict (a request for `/api//users` will NOT match a route
 * registered as `/api/users`).
 */

import type {
  ClearOptions,
  HTTPMethod,
  Middleware,
  RouteHandler,
  RouteMatch,
  RouteParams,
  RouterOptions,
} from './types/mod.ts';
import {
  DuplicateRouteError,
  MalformedPathError,
  RouteConflictError,
} from './errors/mod.ts';

const PARAM_NAME_PATTERN = /^[A-Za-z_]\w*$/;
const PARAM_TOKEN_PATTERN = /:[A-Za-z_]\w*:/g;

/**
 * Lowercase `s` for case-insensitive matching **without changing its
 * length**. `String.prototype.toLowerCase()` can expand a code point
 * (e.g. `İ` U+0130 → `i̇`, one UTF-16 unit becoming two); such an
 * expansion would desync the folded `matchUrl` from the original-case
 * `origUrl` that {@link RadRouter.__search} indexes with a single shared
 * cursor — the folded view for label comparison, the original for param
 * slicing — leaking a segment boundary into a captured value. Folding
 * each code point only when its lowercase form keeps the same UTF-16
 * length keeps the two views aligned; the rare expanding folds are left
 * as-is (matched case-sensitively).
 *
 * Unlike a naive ASCII-only gate, this also folds single-unit non-ASCII
 * uppercase (`Ü` → `ü`, `É` → `é`), so `caseSensitive: false` is no
 * longer silently ASCII-only. Returns the same string reference when
 * nothing folds, so the already-lowercase hot path allocates nothing.
 */
function foldCase(s: string): string {
  let out: string | null = null;
  let i = 0;
  for (const cp of s) {
    const lower = cp.toLowerCase();
    if (lower !== cp && lower.length === cp.length) {
      if (out === null) out = s.slice(0, i);
      out += lower;
    } else if (out !== null) {
      out += cp;
    }
    i += cp.length;
  }
  return out ?? s;
}

type NodeKind =
  | 'static'
  | 'param'
  | 'param_with_suffix'
  | 'greedy_suffix'
  | 'greedy_prefix';

type Chunk =
  | { kind: 'static'; value: string }
  | { kind: 'param'; paramName: string }
  | { kind: 'param_with_suffix'; paramName: string; suffix: string }
  | { kind: 'greedy_suffix'; paramName: string }
  | { kind: 'greedy_prefix'; paramName: string };

class RouteNode<M = Middleware> {
  public kind: NodeKind;
  public label: string;
  public paramName?: string;
  /** Literal suffix anchor — only meaningful when kind === 'param_with_suffix'. */
  public suffix?: string;
  public staticChildren: { [firstChar: string]: RouteNode<M> };
  public paramChild?: RouteNode<M>;
  /**
   * `:name:<literal>` siblings of paramChild. Tried before plain param
   * (more-specific wins) and ordered by suffix length descending so
   * `.tar.gz` is tested before `.gz`.
   */
  public paramSuffixChildren?: RouteNode<M>[];
  public greedyChild?: RouteNode<M>;
  public handlers: Map<string, RouteHandler<M>>;

  constructor(
    kind: NodeKind,
    label: string,
    paramName?: string,
    suffix?: string,
  ) {
    this.kind = kind;
    this.label = label;
    this.paramName = paramName;
    this.suffix = suffix;
    this.staticChildren = Object.create(null);
    this.handlers = new Map();
  }

  public addHandler(
    method: HTTPMethod,
    middlewares: M[],
    version?: string,
  ): void {
    const key = version ? `${method}:${version}` : method;
    this.handlers.set(key, { middlewares, method, version });
  }

  public getHandler(
    method: HTTPMethod,
    version?: string,
  ): RouteHandler<M> | undefined {
    const key = version ? `${method}:${version}` : method;
    return this.handlers.get(key);
  }
}

export class RadRouter<M = Middleware> {
  private __root: RouteNode<M> = new RouteNode('static', '');
  private __globalMiddlewares: M[] = [];

  public readonly defaultVersion?: string;
  public readonly caseSensitive: boolean;

  /**
   * @param options - Optional {@link RouterOptions} controlling
   *   case sensitivity and the configured default version.
   */
  constructor(options?: RouterOptions) {
    this.defaultVersion = options?.defaultVersion;
    this.caseSensitive = options?.caseSensitive ?? true;
  }

  /**
   * Register a global middleware that runs on every successful
   * route lookup, before any route-specific middleware. Global
   * middlewares accumulate in registration order.
   *
   * @param middleware - A function matching the router's `M`
   *   parameter (the consumer-defined middleware shape). See
   *   {@link Middleware} for the default unconstrained signature.
   */
  public use(middleware: M): void {
    this.__globalMiddlewares.push(middleware);
  }

  // ---------- normalization ----------

  private __normalizePath(path: string, mergeSlashes: boolean): string {
    if (path === '') return '';

    let normalized: string;
    if (this.caseSensitive) {
      normalized = path;
    } else if (path.includes(':')) {
      // Fold only the static portions; parameter tokens (`:name:`) keep
      // their original case so param names stay stable identifiers.
      const parts: string[] = [];
      let lastIndex = 0;
      for (const match of path.matchAll(PARAM_TOKEN_PATTERN)) {
        const idx = match.index ?? 0;
        parts.push(foldCase(path.slice(lastIndex, idx)), match[0]);
        lastIndex = idx + match[0].length;
      }
      parts.push(foldCase(path.slice(lastIndex)));
      normalized = parts.join('');
    } else {
      normalized = foldCase(path);
    }

    if (mergeSlashes) {
      normalized = normalized.replaceAll(/\/+/g, '/');
    }
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  }

  /**
   * Lookup-time normalisation. Returns both the case-folded `matchUrl`
   * (used for label comparisons against the lowercased-on-insert trie)
   * and the `origUrl` (used to extract param values so their case is
   * preserved). When `caseSensitive` is true (or the URL is already
   * all-lowercase), the two strings are the same reference — no extra
   * allocation, no overhead in the common path.
   */
  private __normalizeForLookup(
    path: string,
  ): { matchUrl: string; origUrl: string } | undefined {
    if (path === '') return undefined;

    let orig = path;
    if (!orig.startsWith('/')) orig = '/' + orig;
    if (orig.length > 1 && orig.endsWith('/')) orig = orig.slice(0, -1);

    const matchUrl = this.caseSensitive ? orig : foldCase(orig);

    return { matchUrl, origUrl: orig };
  }

  // ---------- chunk parsing (insert-time only) ----------

  /**
   * @throws {MalformedPathError} When `name` doesn't match
   *   `[A-Za-z_]\\w*`. The original `segment` and the bad
   *   `paramName` are attached to `error.context`.
   */
  private __validateParamName(name: string, segment: string): void {
    if (!PARAM_NAME_PATTERN.test(name)) {
      throw new MalformedPathError(
        `Invalid parameter name "${name}" in segment "${segment}".`,
        { segment, paramName: name },
      );
    }
  }

  /**
   * Split the normalized path into a sequence of chunks. Static
   * chunks include their surrounding "/" delimiters where
   * applicable, so that the resulting concatenation reconstructs
   * the original normalized path. Param/greedy chunks are points
   * of variable binding.
   *
   * @throws {MalformedPathError} When `path` is empty. An empty
   *   registration would attach a handler that no lookup can reach;
   *   register `"/"` for the root route instead.
   * @throws {MalformedPathError} When a segment containing `:`
   *   doesn't match one of the four pattern forms (`:name:`,
   *   `:name:<literal>`, `*-:name:`, `:name:-*`). The offending
   *   `segment` is attached to `error.context`.
   * @throws {MalformedPathError} (propagated from
   *   {@link __validateParamName}) when a parameter name fails the
   *   `[A-Za-z_]\\w*` rule.
   * @throws {MalformedPathError} When a greedy-suffix segment
   *   (`:name:-*`) is followed by further segments. It consumes the
   *   rest of the path, so it must be the last segment; a trailing
   *   chunk would register a silently unreachable route.
   */
  private __parsePath(path: string): Chunk[] {
    if (path === '') {
      throw new MalformedPathError(
        'Path must not be empty; register "/" for the root route.',
        { segment: '' },
      );
    }
    if (path === '/') {
      // Root path becomes a single "/" static chunk so the trie has an
      // explicit node that owns the root handler. Without this, lookup of
      // "/" would have nowhere to walk to.
      return [{ kind: 'static', value: '/' }];
    }

    const segments = path.slice(1).split('/');
    const chunks: Chunk[] = [];
    let staticBuffer = '';
    let greedySuffixSeg: string | undefined;

    for (const seg of segments) {
      // A greedy-suffix segment (`:name:-*`) consumes every remaining
      // segment, so nothing may follow it. Reaching another segment with
      // one already parsed means it wasn't last — reject here rather than
      // register a handler no lookup can reach (`__search` resolves the
      // greedy node directly and never descends into its children).
      if (greedySuffixSeg !== undefined) {
        throw new MalformedPathError(
          `Greedy-suffix segment "${greedySuffixSeg}" must be the last segment in path "${path}".`,
          { segment: greedySuffixSeg },
        );
      }

      if (!seg.includes(':')) {
        staticBuffer += '/' + seg;
        continue;
      }

      let chunk: Chunk | null = null;
      if (seg.startsWith('*-:') && seg.endsWith(':')) {
        const name = seg.slice(3, -1);
        this.__validateParamName(name, seg);
        chunk = { kind: 'greedy_prefix', paramName: name };
      } else if (seg.startsWith(':') && seg.endsWith(':-*')) {
        const name = seg.slice(1, -3);
        this.__validateParamName(name, seg);
        chunk = { kind: 'greedy_suffix', paramName: name };
        greedySuffixSeg = seg;
      } else if (seg.startsWith(':') && seg.endsWith(':')) {
        const name = seg.slice(1, -1);
        this.__validateParamName(name, seg);
        chunk = { kind: 'param', paramName: name };
      } else if (seg.startsWith(':')) {
        // Try `:name:<literal>` — single-segment param with a required
        // literal suffix anchor. The trailing ":" terminates the name;
        // anything after it (until segment end) is the literal suffix.
        const secondColon = seg.indexOf(':', 1);
        if (secondColon !== -1 && secondColon < seg.length - 1) {
          const name = seg.slice(1, secondColon);
          const suffix = seg.slice(secondColon + 1);
          this.__validateParamName(name, seg);
          chunk = { kind: 'param_with_suffix', paramName: name, suffix };
        }
      }

      if (!chunk) {
        throw new MalformedPathError(
          `Malformed path segment "${seg}". Segments containing ":" must match one of: ":name:", ":name:<literal>", "*-:name:", or ":name:-*".`,
          { segment: seg },
        );
      }

      // Close static buffer (with the trailing "/" before this param/greedy)
      staticBuffer += '/';
      if (staticBuffer.length > 0) {
        chunks.push({ kind: 'static', value: staticBuffer });
        staticBuffer = '';
      }
      chunks.push(chunk);
    }

    if (staticBuffer.length > 0) {
      chunks.push({ kind: 'static', value: staticBuffer });
    }

    return chunks;
  }

  // ---------- insert ----------

  /**
   * Insert a static label under `parent`, splitting existing children as
   * necessary so the radix tree stays minimal. Returns the node where the
   * label terminates.
   */
  private __insertStatic(parent: RouteNode<M>, label: string): RouteNode<M> {
    if (label.length === 0) return parent;

    let node = parent;
    let remaining = label;

    while (remaining.length > 0) {
      const firstChar = remaining[0]!;
      const child: RouteNode<M> | undefined = node.staticChildren[firstChar];

      if (!child) {
        const fresh = new RouteNode<M>('static', remaining);
        node.staticChildren[firstChar] = fresh;
        return fresh;
      }

      // Find longest common prefix between child.label and remaining,
      // compared one UTF-16 code unit at a time. The whole trie keys its
      // child buckets by a single UTF-16 unit — `remaining[0]` (line
      // above), `oldSuffix[0]`/`newSuffix[0]` on split, and `url[pos]` at
      // lookup — so the split point MUST land on a code-unit boundary.
      // `codePointAt` advances atomically over a surrogate pair, so two
      // sibling labels beginning with different non-BMP code points that
      // share one high surrogate (e.g. U+20000 `𠀀` vs U+20001 `𠀁`, or
      // 😀 vs 😁) would diverge *before* that shared high surrogate; both
      // suffixes would then bucket under the identical high-surrogate key
      // and the second insert would clobber the first, silently dropping a
      // registered route. `charCodeAt` keeps the LCP aligned with the
      // single-unit keys so surrogate-sharing siblings split correctly.
      const childLabel = child.label;
      const minLen = Math.min(childLabel.length, remaining.length);
      let common = 0;
      while (
        common < minLen &&
        childLabel.charCodeAt(common) === remaining.charCodeAt(common)
      ) {
        common++;
      }

      if (common === childLabel.length) {
        // Child's label is a complete prefix of remaining; descend into child.
        if (common === remaining.length) {
          return child;
        }
        node = child;
        remaining = remaining.slice(common);
        continue;
      }

      // Need to split child: extract the divergent tail of the child into a
      // new sibling node, and shrink the child to the common prefix. Every
      // descendant collection must move with the tail — otherwise routes
      // that hung off the original node become unreachable.
      const oldSuffix = childLabel.slice(common);
      const splitChild = new RouteNode<M>('static', oldSuffix);
      splitChild.staticChildren = child.staticChildren;
      splitChild.paramChild = child.paramChild;
      splitChild.paramSuffixChildren = child.paramSuffixChildren;
      splitChild.greedyChild = child.greedyChild;
      splitChild.handlers = child.handlers;

      child.label = childLabel.slice(0, common);
      child.staticChildren = Object.create(null);
      child.staticChildren[oldSuffix[0]!] = splitChild;
      child.paramChild = undefined;
      child.paramSuffixChildren = undefined;
      child.greedyChild = undefined;
      child.handlers = new Map();

      if (common === remaining.length) {
        return child;
      }

      const newSuffix = remaining.slice(common);
      const newBranch = new RouteNode<M>('static', newSuffix);
      child.staticChildren[newSuffix[0]!] = newBranch;
      return newBranch;
    }

    return node;
  }

  /**
   * Register a middleware chain for `method` + `path`, optionally
   * versioned. Path normalisation merges duplicate slashes and
   * strips a trailing slash; the registration is then walked into
   * the trie, splitting nodes as needed.
   *
   * @param method - HTTP method this chain handles. See
   *   {@link HTTPMethod}.
   * @param path - Pattern string. Supports `:name:`,
   *   `:name:<literal>`, `*-:name:`, and `:name:-*` segments — see
   *   `docs/RadRouter-Patterns.md` for full semantics.
   * @param middlewares - Chain to run on a successful lookup; runs
   *   after any {@link RadRouter.use} globals.
   * @param version - Optional version label. Omit to register the
   *   "unversioned" slot for the path.
   *
   * @throws {MalformedPathError} (propagated from
   *   {@link __parsePath}) when `path` is empty, contains a
   *   malformed segment or an invalid `:name:` identifier, or
   *   places a greedy-suffix segment (`:name:-*`) anywhere but
   *   last.
   * @throws {RouteConflictError} When a `:name:` (plain, suffix-
   *   anchored, or greedy) placement conflicts with an existing
   *   binding at the same trie position. `error.context` carries
   *   the existing and new parameter names plus the path.
   * @throws {DuplicateRouteError} When `method` + `path` +
   *   `version` matches an already-registered route. Different
   *   methods or versions on the same path compose normally; only
   *   exact duplicates throw.
   */
  public addRoute(
    method: HTTPMethod,
    path: string,
    middlewares: M[],
    version?: string,
  ): void {
    const normalized = this.__normalizePath(path, true);
    const chunks = this.__parsePath(normalized);

    let node = this.__root;
    for (const chunk of chunks) {
      switch (chunk.kind) {
        case 'static':
          node = this.__insertStatic(node, chunk.value);
          break;

        case 'param':
          if (!node.paramChild) {
            node.paramChild = new RouteNode<M>('param', '', chunk.paramName);
          } else if (node.paramChild.paramName !== chunk.paramName) {
            throw new RouteConflictError(
              `Parameter name conflict registering "${path}": existing parameter ":${node.paramChild.paramName}:" cannot coexist with ":${chunk.paramName}:".`,
              {
                path,
                existingParamName: node.paramChild.paramName,
                newParamName: chunk.paramName,
              },
            );
          }
          node = node.paramChild;
          break;

        case 'param_with_suffix': {
          node.paramSuffixChildren ??= [];
          // Reuse an existing node with the same suffix; throw if the
          // existing one binds a different parameter name (would silently
          // shadow the registration intent).
          let existing = node.paramSuffixChildren.find((c) =>
            c.suffix === chunk.suffix
          );
          if (existing) {
            if (existing.paramName !== chunk.paramName) {
              throw new RouteConflictError(
                `Parameter name conflict registering "${path}": existing ":${existing.paramName}:${existing.suffix}" cannot coexist with ":${chunk.paramName}:${chunk.suffix}" at the same trie position.`,
                {
                  path,
                  existingParamName: existing.paramName,
                  newParamName: chunk.paramName,
                  suffix: chunk.suffix,
                },
              );
            }
          } else {
            existing = new RouteNode<M>(
              'param_with_suffix',
              '',
              chunk.paramName,
              chunk.suffix,
            );
            node.paramSuffixChildren.push(existing);
            // Longer suffixes are more specific — try them first at lookup.
            node.paramSuffixChildren.sort((a, b) =>
              (b.suffix?.length ?? 0) - (a.suffix?.length ?? 0)
            );
          }
          node = existing;
          break;
        }

        case 'greedy_suffix':
        case 'greedy_prefix': {
          const wantKind: NodeKind = chunk.kind;
          if (!node.greedyChild) {
            node.greedyChild = new RouteNode<M>(wantKind, '', chunk.paramName);
          } else if (
            node.greedyChild.kind !== wantKind ||
            node.greedyChild.paramName !== chunk.paramName
          ) {
            throw new RouteConflictError(
              `Greedy parameter conflict registering "${path}".`,
              {
                path,
                existingParamName: node.greedyChild.paramName,
                newParamName: chunk.paramName,
              },
            );
          }
          node = node.greedyChild;
          break;
        }
      }
    }

    const handlerKey = version ? `${method}:${version}` : method;
    if (node.handlers.has(handlerKey)) {
      throw new DuplicateRouteError({ method, path, version });
    }
    node.addHandler(method, middlewares, version);
  }

  /**
   * Shorthand for {@link RadRouter.addRoute} with `method: 'GET'`.
   * Inherits the same throw contract.
   */
  public get(
    path: string,
    middlewares: M[],
    version?: string,
  ): void {
    this.addRoute('GET', path, middlewares, version);
  }

  /**
   * Shorthand for {@link RadRouter.addRoute} with `method: 'POST'`.
   * Inherits the same throw contract.
   */
  public post(
    path: string,
    middlewares: M[],
    version?: string,
  ): void {
    this.addRoute('POST', path, middlewares, version);
  }

  /**
   * Shorthand for {@link RadRouter.addRoute} with `method: 'PUT'`.
   * Inherits the same throw contract.
   */
  public put(
    path: string,
    middlewares: M[],
    version?: string,
  ): void {
    this.addRoute('PUT', path, middlewares, version);
  }

  /**
   * Shorthand for {@link RadRouter.addRoute} with `method: 'DELETE'`.
   * Inherits the same throw contract.
   */
  public delete(
    path: string,
    middlewares: M[],
    version?: string,
  ): void {
    this.addRoute('DELETE', path, middlewares, version);
  }

  /**
   * Shorthand for {@link RadRouter.addRoute} with `method: 'PATCH'`.
   * Inherits the same throw contract.
   */
  public patch(
    path: string,
    middlewares: M[],
    version?: string,
  ): void {
    this.addRoute('PATCH', path, middlewares, version);
  }

  /**
   * Shorthand for {@link RadRouter.addRoute} with `method: 'HEAD'`.
   * Inherits the same throw contract.
   */
  public head(
    path: string,
    middlewares: M[],
    version?: string,
  ): void {
    this.addRoute('HEAD', path, middlewares, version);
  }

  /**
   * Shorthand for {@link RadRouter.addRoute} with
   * `method: 'OPTIONS'`. Inherits the same throw contract.
   */
  public options(
    path: string,
    middlewares: M[],
    version?: string,
  ): void {
    this.addRoute('OPTIONS', path, middlewares, version);
  }

  // ---------- lookup ----------

  /**
   * Three-tier handler resolution at a terminal node:
   *   1. Exact requested version (if specified).
   *   2. Configured default version (if set and different from requested).
   *   3. Unversioned slot (absolute fallback).
   */
  private __resolveHandler(
    node: RouteNode<M>,
    method: HTTPMethod,
    version: string | undefined,
  ): RouteHandler<M> | undefined {
    if (version !== undefined) {
      const exact = node.getHandler(method, version);
      if (exact) return exact;
    }
    if (this.defaultVersion !== undefined && this.defaultVersion !== version) {
      const def = node.getHandler(method, this.defaultVersion);
      if (def) return def;
    }
    return node.getHandler(method);
  }

  /**
   * Percent-decode a captured param value.
   *
   * Every value captured by a `:param:`, suffixed, or greedy segment
   * is run through `decodeURIComponent` before it reaches the caller,
   * so `/users/a%2Fb` yields `params.id === 'a/b'` and
   * `/users/john%20doe` yields `params.name === 'john doe'`. Decoding
   * at capture time closes the classic "decode-after-check" bypass:
   * a downstream guard that decodes the value itself can no longer be
   * fooled by encoded `..` (`%2e%2e`) or `/` (`%2F`) sequences that
   * slipped past it raw.
   *
   * A malformed percent-escape (e.g. a lone `%` or `%zz`) makes
   * `decodeURIComponent` throw; rather than surfacing a 500, that case
   * is treated as a non-match for the branch — `undefined` is returned
   * and the caller moves on to the next alternative (ultimately a
   * lookup miss / `undefined` from {@link RadRouter.find}).
   *
   * @param raw - The raw substring sliced from the original URL.
   * @returns The decoded value, or `undefined` if `raw` contains a
   *   malformed percent-escape.
   */
  private __decodeParam(raw: string): string | undefined {
    try {
      return decodeURIComponent(raw);
    } catch {
      // Malformed URI sequence — treat the capture as a miss.
      return undefined;
    }
  }

  /**
   * Walk the URL against `node`'s subtree starting at `pos`. Two URL
   * views are threaded through:
   *
   * - `url` is the case-folded view used for static-label comparison
   *   (trie labels are stored lowercase under `caseSensitive: false`).
   * - `origUrl` preserves the request's original case and is used for
   *   param-value extraction so callers see `params.id === 'AbC123'`
   *   instead of a lowercased ghost.
   *
   * When the router is case-sensitive (or the URL has no uppercase
   * chars), the two arguments are the same string reference — no
   * extra cost in the hot path.
   *
   * Captured param values are percent-decoded via
   * {@link RadRouter.__decodeParam}; a value whose percent-escapes are
   * malformed makes that branch a non-match.
   *
   * Mutates `params` on the way down and restores prior values on
   * backtrack.
   */
  private __search(
    node: RouteNode<M>,
    url: string,
    origUrl: string,
    pos: number,
    method: HTTPMethod,
    version: string | undefined,
    params: RouteParams,
  ): RouteHandler<M> | undefined {
    if (pos >= url.length) {
      return this.__resolveHandler(node, method, version);
    }

    // 1. Static child (highest priority).
    const ch = url[pos]!;
    const child = node.staticChildren[ch];
    if (child !== undefined) {
      const labelLen = child.label.length;
      if (pos + labelLen <= url.length && url.startsWith(child.label, pos)) {
        const result = this.__search(
          child,
          url,
          origUrl,
          pos + labelLen,
          method,
          version,
          params,
        );
        if (result) return result;
      }
    }

    // 2. Param-with-suffix children (more specific than plain param).
    //    Sorted by suffix length descending; try each in order.
    const suffixed = node.paramSuffixChildren;
    if (suffixed) {
      let segEnd = url.indexOf('/', pos);
      if (segEnd === -1) segEnd = url.length;
      for (const sc of suffixed) {
        const suffix = sc.suffix!;
        const paramName = sc.paramName!;
        const valueEnd = segEnd - suffix.length;
        // valueEnd > pos rejects empty captures (the `.jpeg` edge case).
        if (valueEnd > pos && url.startsWith(suffix, valueEnd)) {
          const value = this.__decodeParam(origUrl.slice(pos, valueEnd));
          // Malformed percent-encoding (e.g. a stray `%`) — treat this
          // capture as a miss and let other alternatives try.
          if (value === undefined) continue;
          const prev = params[paramName];
          params[paramName] = value;
          const result = this.__search(
            sc,
            url,
            origUrl,
            segEnd,
            method,
            version,
            params,
          );
          if (result) return result;
          if (prev === undefined) delete params[paramName];
          else params[paramName] = prev;
        }
      }
    }

    // 3. Plain param child (catch-all when no suffix variant matches).
    if (node.paramChild?.paramName) {
      let end = url.indexOf('/', pos);
      if (end === -1) end = url.length;
      if (end > pos) {
        const value = this.__decodeParam(origUrl.slice(pos, end));
        // Malformed percent-encoding — treat as a miss for this branch.
        if (value !== undefined) {
          const paramName = node.paramChild.paramName;
          const prev = params[paramName];
          params[paramName] = value;
          const result = this.__search(
            node.paramChild,
            url,
            origUrl,
            end,
            method,
            version,
            params,
          );
          if (result) return result;
          if (prev === undefined) delete params[paramName];
          else params[paramName] = prev;
        }
      }
    }

    // 4. Greedy child.
    const greedy = node.greedyChild;
    if (greedy?.paramName) {
      if (greedy.kind === 'greedy_suffix') {
        const raw = origUrl.slice(pos);
        const value = raw.length > 0 ? this.__decodeParam(raw) : undefined;
        // Empty or malformed percent-encoding — no greedy capture.
        if (value !== undefined) {
          const paramName = greedy.paramName;
          const prev = params[paramName];
          params[paramName] = value;
          const handler = this.__resolveHandler(greedy, method, version);
          if (handler) return handler;
          if (prev === undefined) delete params[paramName];
          else params[paramName] = prev;
        }
      } else if (greedy.kind === 'greedy_prefix') {
        // URL-greedy: the `*` may span slashes; `:name:` is captured
        // **after** the dash as a single segment ending at the next `/`
        // (or URL end). The rightmost dash is tried first (greedy), then
        // earlier dashes, so patterns like `/*-:name:/data` cope with a
        // dash both inside the captured segment and in the static-anchor
        // suffix.
        //
        // This is a single right-to-left pass over the greedy region —
        // O(url length), not O(dashes × url length). The naive form
        // (`indexOf('/')` per dash) is a quadratic CPU-DoS: an all-dash
        // path with no following `/` re-scans to the end for every dash
        // (~n²/2 char comparisons for n dashes). Three facts collapse it:
        //   1. `:name:` always ends at `end`, the next `/` after the dash
        //      (or URL end). Walking right-to-left and remembering the
        //      nearest `/` seen (`nextSlash`) yields `end` for the current
        //      dash in O(1) — no forward re-scan.
        //   2. Every dash inside one inter-slash gap shares the same `end`
        //      and recurses from the same position, so the recursion
        //      result is identical for all of them; the *rightmost*
        //      non-empty dash is the greedy winner. So each gap is probed
        //      once (deduped via `lastEnd`) at that dash, preserving the
        //      original rightmost-first priority and captured value.
        //   3. A left dash's capture *ends with* the rightmost dash's
        //      capture (same `end`), so if the rightmost non-empty capture
        //      decodes malformed, every earlier dash in the gap is
        //      malformed too — the gap is settled either way, no re-decode.
        // Empty captures (a dash immediately before `end`) don't settle
        // the gap: fall through to the earlier, non-empty dash.
        //
        // Short-circuit: a greedy-prefix capture requires at least one
        // `-` in the greedy region `[pos, len)` — the `*` and `:name:`
        // are split by that dash, so a dash-free region can never seat.
        // A single native `indexOf('-', pos)` scan skips the whole
        // right-to-left walk on the common dash-free miss path, restoring
        // the `lastIndexOf('-')` early-out the O(n²)→O(n) rewrite dropped
        // (which otherwise char-steps the entire region in JS before
        // missing). The DoS-safe single pass below is unchanged and runs
        // only when a dash is present.
        if (url.indexOf('-', pos) !== -1) {
          let nextSlash = url.length;
          let lastEnd = -1;
          for (let i = url.length - 1; i >= pos; i--) {
            const c = url[i];
            if (c === '/') {
              nextSlash = i;
              continue;
            }
            if (c !== '-') continue;
            const end = nextSlash;
            if (end === lastEnd) continue; // gap already settled
            if (end <= i + 1) continue; // empty capture — try earlier dash
            // Rightmost non-empty dash of this gap: it settles the gap
            // whatever happens (valid → same recursion for all; malformed →
            // all earlier captures share the malformed suffix).
            lastEnd = end;
            const value = this.__decodeParam(origUrl.slice(i + 1, end));
            if (value === undefined) continue; // malformed — whole gap misses
            const paramName = greedy.paramName;
            const prev = params[paramName];
            params[paramName] = value;
            const result = this.__search(
              greedy,
              url,
              origUrl,
              end,
              method,
              version,
              params,
            );
            if (result) return result;
            if (prev === undefined) delete params[paramName];
            else params[paramName] = prev;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Look up a route for `method` + `path`, optionally constrained
   * to `version`. Returns a {@link RouteMatch} carrying the merged
   * middleware chain (globals + route-specific) and captured
   * {@link RouteParams}, or `undefined` on miss.
   *
   * Version resolution follows a three-tier fallback at every
   * terminal node: exact requested version → configured
   * `defaultVersion` → unversioned slot.
   *
   * Captured param values are percent-decoded before they are returned
   * in {@link RouteParams}, so `/users/a%2Fb` yields `id: 'a/b'` and
   * `/users/john%20doe` yields `name: 'john doe'`. A value carrying a
   * malformed percent-escape (e.g. a stray `%`) is treated as a miss
   * for that branch rather than throwing.
   *
   * **`params` is a null-prototype object** (`Object.create(null)`), not
   * a plain `{}`. This is a deliberate safety property — a route may name
   * a param after an `Object.prototype` member (`constructor`,
   * `hasOwnProperty`, `__proto__`, …; all valid under `[A-Za-z_]\w*`), and
   * a null prototype keeps such a capture a plain own string entry instead
   * of shadowing a builtin or being swallowed by the `__proto__` setter.
   * The trade-off: `params` inherits **no** `Object.prototype` methods, so
   * `params.hasOwnProperty(k)`, `params.toString()`, `String(params)`, and
   * `` `${params}` `` all throw `TypeError`, and `params.constructor` is
   * `undefined`. Read it as data: `params.id`, `k in params`,
   * `Object.keys(params)`, `Object.entries(params)`, `JSON.stringify(params)`,
   * and `Object.prototype.hasOwnProperty.call(params, k)` all work.
   *
   * Never throws — lookup failures (including malformed encoding)
   * return `undefined`.
   *
   * @param method - HTTP method to dispatch on. See
   *   {@link HTTPMethod}.
   * @param path - Request path (with or without leading slash).
   *   Strict slash semantics: doubled slashes are NOT collapsed at
   *   lookup time.
   * @param version - Optional version label; see the fallback
   *   note above.
   */
  public find(
    method: HTTPMethod,
    path: string,
    version?: string,
  ): RouteMatch<M> | undefined {
    const normalized = this.__normalizeForLookup(path);
    if (!normalized) return undefined;

    // Null-proto bag: a param named after an `Object.prototype` member
    // (`constructor`, `toString`, `valueOf`, `hasOwnProperty`, … — all
    // valid under the `[A-Za-z_]\w*` rule) must probe as `undefined`
    // during the backtrack-restore idiom (`const prev = params[name]`).
    // On a plain `{}` that probe returns the inherited *function*, so the
    // `prev === undefined` delete branch never fires and the function is
    // written back as an own enumerable property — leaking a `Function`
    // into `RouteParams` (whose contract is `{ [key: string]: string }`).
    // The trie's `staticChildren` buckets are null-proto for the same
    // reason; the params bag was simply missed.
    const params: RouteParams = Object.create(null);
    const handler = this.__search(
      this.__root,
      normalized.matchUrl,
      normalized.origUrl,
      0,
      method,
      version,
      params,
    );

    if (!handler) return undefined;

    return {
      middlewares: [...this.__globalMiddlewares, ...handler.middlewares],
      params,
    };
  }

  // ---------- maintenance ----------

  /**
   * Snapshot the trie's size. Useful for inspecting whether the
   * radix structure is compressing prefixes effectively or
   * blowing up under your workload.
   *
   * @returns `totalRoutes` — sum of every `(method, version)` slot
   *   across the tree; `totalNodes` — the number of `RouteNode`s
   *   the trie holds.
   */
  public getStats(): { totalRoutes: number; totalNodes: number } {
    let totalRoutes = 0;
    let totalNodes = 0;

    const traverse = (node: RouteNode<M>): void => {
      totalNodes++;
      totalRoutes += node.handlers.size;
      for (const key in node.staticChildren) {
        traverse(node.staticChildren[key]!);
      }
      if (node.paramChild) traverse(node.paramChild);
      if (node.paramSuffixChildren) {
        for (const sc of node.paramSuffixChildren) traverse(sc);
      }
      if (node.greedyChild) traverse(node.greedyChild);
    };

    traverse(this.__root);
    return { totalRoutes, totalNodes };
  }

  /**
   * Discard every registered route, dropping the trie back to a
   * fresh root node. Useful in long-lived processes that reload
   * configuration without restarting.
   *
   * @param options - Optional {@link ClearOptions}. Pass
   *   `{ keepGlobalMiddlewares: true }` to retain anything
   *   registered via {@link RadRouter.use}; otherwise globals are
   *   discarded too.
   */
  public clear(options?: ClearOptions): void {
    this.__root = new RouteNode('static', '');
    if (!options?.keepGlobalMiddlewares) {
      this.__globalMiddlewares = [];
    }
  }
}
