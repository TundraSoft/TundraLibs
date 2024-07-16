import { path } from '../dependencies.ts';
import { Methods, Middleware } from './types/mod.ts';

/**
 * Represents information about a parameter in a path.
 */
type ParamInfo = {
  /**
   * The position of the parameter in the path.
   */
  position: number;
  /**
   * Whether the parameter is a wildcard (e.g., `:id*`).
   */
  isWildcard: boolean;
};

const paramRegex = new RegExp(/\{\w+\*?\}/g);

export class TrieNode<F extends Middleware = Middleware> {
  protected _parent?: TrieNode<F>;
  protected _path!: string;
  protected _params: Map<string, ParamInfo> = new Map();
  protected _children: Map<string, TrieNode<F>> = new Map();
  protected _handlers: Map<Methods, F[]> = new Map();

  get path() {
    return this._path;
  }

  set path(path: string) {
    const { path: cleanedPath, params } = this.__processPath(path);
    const oldVal = this._path;
    this._path = cleanedPath;
    this._params = params;
    // Update the path in parent
    if (this.parent && (oldVal !== undefined || oldVal !== cleanedPath)) {
      this.parent.sync();
    }
  }

  get fullPath(): string {
    return this._parent
      ? path.join(this._parent.fullPath, this.path)
      : this.path;
  }

  get parent(): TrieNode<F> | undefined {
    return this._parent;
  }

  set parent(parent: TrieNode<F> | undefined) {
    // Ensure the parent does not have a child starting with parameter
    if (parent && parent.children.size > 0) {
      const paramMatch = Array.from(parent.children.keys()).find((child) =>
        child.split('/')[0].includes('{')
      );
      if (paramMatch) {
        throw new Error(
          `Cannot set ${this.path} as child of ${parent.path} as it contains a node which starts with a parameter.`,
        );
      }
    }
    if (this._parent) {
      this._parent.removeNode(this.path);
    }
    this._parent = parent;
    // Ensure parent knows their kids
    if (parent !== undefined) {
      if (!parent.children.has(this.path)) {
        parent.children.set(this.path, this);
        parent.sync();
      }
    }
  }

  get handlers(): Map<Methods, F[]> {
    return this._handlers;
  }

  get children(): Map<string, TrieNode<F>> {
    return this._children;
  }

  constructor(
    path: string = '/',
    parent?: TrieNode<F>,
    // children?: TrieNode<F>[],
  ) {
    this.path = path;
    this.parent = parent;
  }

  find(
    url: string,
    params: Record<string, string> = {},
  ): { node: TrieNode<F>; params: Record<string, string> } | undefined {
    url = this.__cleanUrl(url);
    const paramMatchs: string[] = [];
    // Build the regexp
    const pathRegexp = new RegExp(
      '^' + this.path.split('/').map((part) => {
        while (true) {
          const match = paramRegex.exec(part);
          if (match === null) {
            break;
          }
          const paramName = match[0].slice(1, -1).replace('*', '');
          if (params[paramName] !== undefined) {
            part = part.replace(match[0], params[paramName]);
          } else if (this._params.get(paramName)!.isWildcard) {
            part = part.replace(match[0], '(.*)?');
            paramMatchs.push(paramName);
          } else {
            part = part.replace(match[0], '([^/]+)?');
            paramMatchs.push(paramName);
          }
        }
        return part;
      }).join('/'),
      'i',
    );
    const matches = pathRegexp.exec(url);
    if (matches) {
      // deno-lint-ignore no-this-alias
      const node: TrieNode<F> | undefined = this;
      paramMatchs.forEach((name, idx) => {
        params[name] = matches[idx + 1];
      });
      const remaining = this.__cleanUrl(url.slice(matches[0].length));
      if (remaining !== '') {
        for (const child of this._children.values()) {
          const res = child.find(remaining, params);
          if (res !== undefined) {
            return res;
          }
        }
        return undefined;
      }
      return { node, params };
    }
    return undefined;
  }

  //#region Node Management
  public addNode(path: string): TrieNode<F> {
    path = this.__cleanPath(path);
    if (path === this.path) {
      return this;
    }
    const commonPath = this.__getCommonPath(path);
    const remainingPath = this.__cleanPath(path.slice(commonPath.length));
    if (commonPath !== this.path) {
      if (commonPath === '') {
        if (this.parent !== undefined) {
          // Basically what has happened is, parent thought this would be the ideal child but looks like it's not
          throw new Error('Could not find common root node');
        }
      }
      // Split current node
      const newNode = this.clone();
      this._children = new Map();
      this._handlers = new Map();
      this._children.set(newNode.path, newNode);
      newNode.parent = this;
      this.path = commonPath;
      return this.addNode(remainingPath);
    }
    let bestMatch: TrieNode<F> | undefined;
    this._children.forEach((child) => {
      if (
        (child.path.startsWith(remainingPath) ||
          remainingPath.startsWith(child.path)) &&
        (!bestMatch || child.path.length > bestMatch.path.length)
      ) {
        bestMatch = child;
      }
    });
    if (bestMatch) {
      return bestMatch.addNode(remainingPath);
    }
    const newNode = new TrieNode(remainingPath, this);
    this._children.set(newNode.path, newNode);
    return newNode;
  }

  public removeNode(path: string): boolean {
    const node = this.findNode(path);
    if (node !== undefined) {
      if (node.parent) {
        const children = node.parent!.children;
        children.delete(node.path);
      } else {
        node.path = '';
        node._children = new Map();
        node._handlers = new Map();
      }
      return true;
    }
    return false;
  }

  public hasNode(path: string): boolean {
    return this.findNode(path) !== undefined;
  }

  public getNode(path: string): TrieNode<F> | undefined {
    return this.findNode(path);
  }

  public prune(): void {
    this._children.forEach((child) => {
      child.prune();
      child.mergeDangling();
    });
  }

  public mergeDangling(): void {
    if (this._children.size !== 1) {
      return; // Node has no children, no merging
    }

    const [childPath, childNode] = this._children.entries().next().value;

    if (this._handlers.size > 0 && childNode.handlers.size > 0) {
      return; // Parent and child has handlers, no merging
    }

    // Merge conditions met, proceed with merging
    this.path = path.join(this.path, childPath);
    this._children.delete(childPath);
    this._children = new Map(childNode.children);
    this._children.forEach((child) => {
      child.parent = this;
    });
    this._handlers = new Map(childNode.handlers);
  }

  public clone(): TrieNode<F> {
    const node = new TrieNode<F>(
      this.path,
      undefined,
    );
    node._children = new Map(this._children);
    node._handlers = new Map(this._handlers);
    return node;
  }

  public sync(): void {
    this._children.forEach((node, key) => {
      if (node.path !== key) {
        this._children.delete(key);
        this._children.set(node.path, node);
      }
    });
  }

  public findNode(path: string): TrieNode<F> | undefined {
    path = this.__cleanPath(path);
    if (path === this.path) {
      return this as TrieNode<F>;
    }
    if (path.startsWith(this.path)) {
      const remaining = this.__cleanPath(path.slice(this.path.length));
      for (const child of this._children.values()) {
        if (child.path === remaining) {
          return child;
        } else if (
          child.path.startsWith(remaining) ||
          remaining.startsWith(child.path)
        ) {
          return child.findNode(remaining);
        }
      }
    }
    return undefined;
  }

  public index(): Record<string, Methods[]> {
    const index: Record<string, Methods[]> = {
      [this.fullPath]: Array.from(this._handlers.keys()),
    };
    Object.assign(
      index,
      ...Array.from(this._children.values()).map((child) => child.index()),
    );
    return index;
  }
  //#endregion Node Management

  //#region Handler Management
  public hasHandler(method: Methods): boolean {
    return this._handlers.has(method);
  }

  public addHandler(method: Methods, ...handlers: F[]): void {
    if (!this._handlers.has(method)) {
      this._handlers.set(method, []);
    }
    this._handlers.get(method)?.push(...handlers);
  }

  public removeHandler(method: Methods, ...handler: F[]): void {
    if (this._handlers.has(method)) {
      const handlers = this._handlers.get(method)!;
      if (handler.length > 0) {
        handler.forEach((h) => {
          const idx = handlers.indexOf(h);
          if (idx > -1) {
            handlers.splice(idx, 1);
          }
        });
      } else {
        this._handlers.delete(method);
      }
    }
  }

  public getHandlers(method: Methods): F[] {
    if (this._handlers.has(method)) {
      return this._handlers.get(method) ?? [];
    }
    return [];
  }
  //#endregion Handler Management

  private __cleanUrl(url: string): string {
    return url
      .replace(/^\/+|\/+$/g, '') // Remove leading and trailing slashes
      .replace(/\/{2,}/g, '/'); // Replace double slashes
  }

  private __cleanPath(path: string): string {
    path = this.__cleanUrl(path);
    let lastPos = 0;
    while (true) {
      const match = paramRegex.exec(path);
      if (match === null) {
        break;
      }
      const pre = path.slice(lastPos, match.index);
      path = path.replace(pre, pre.toLowerCase());
      lastPos = match.index + match[0].length;
    }
    return path;
  }

  private __processPath(
    path: string,
  ): { path: string; params: Map<string, ParamInfo> } {
    path = this.__cleanPath(path);
    const params = new Map<string, ParamInfo>();
    while (true) {
      const match = paramRegex.exec(path);
      if (match === null) {
        break;
      }
      const paramName = match[0].slice(1, -1).replace('*', '');
      params.set(paramName, {
        position: match.index,
        isWildcard: match[0].slice(1, -1).endsWith('*'),
      });
    }
    return { path, params };
  }

  private __getCommonPath(path: string): string {
    path = this.__cleanPath(path);
    const parts = path.split('/');
    const thisParts = this.path.split('/');
    let commonParts: string = '';
    let minLen = Math.min(parts.length, thisParts.length);
    while (minLen > 0) {
      if (
        parts.slice(0, minLen).join('/') ===
          thisParts.slice(0, minLen).join('/')
      ) {
        commonParts = thisParts.slice(0, minLen).join('/');
        break;
      }
      minLen--;
    }
    return commonParts;
  }
}
