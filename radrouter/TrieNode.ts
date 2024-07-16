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

  /**
   * Gets the current node path
   */
  get path() {
    return this._path;
  }

  /**
   * Sets the current node path
   * This will also update the path in the parent node.
   */
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

  /**
   * Gets the full path of the node traversing up the route.
   */
  get fullPath(): string {
    return this._parent
      ? path.join(this._parent.fullPath, this.path)
      : this.path;
  }

  /**
   * Gets the parent node of the current node.
   */
  get parent(): TrieNode<F> | undefined {
    return this._parent;
  }

  /**
   * Sets the parent node of the current node.
   * This will remove this node from existing parent (if any)
   */
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

  /**
   * Gets the handlers for the current node.
   */
  get handlers(): Map<Methods, F[]> {
    return this._handlers;
  }

  /**
   * Gets the children of the current node.
   */
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

  /**
   * Finds a matching node in the trie based on the given URL and parameters.
   *
   * @param url - The URL to match against.
   * @param params - Optional parameters to be extracted from the URL.
   * @returns An object containing the matching node and extracted parameters, or undefined if no match is found.
   */
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
          const { paramName, isWildcard } = this.__processParam(
            match[0].slice(1, -1),
          );
          if (params[paramName] !== undefined) {
            part = part.replace(match[0], params[paramName]);
          } else if (isWildcard === true) {
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
  /**
   * Adds a new node to the trie.
   *
   * @param path - The path to add as a node.
   * @returns The newly added TrieNode.
   * @throws Error if the common root node cannot be found.
   */
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
      newNode.path = this.path.slice(commonPath.length);
      this.path = commonPath;
      if (remainingPath.length > 0) {
        return this.addNode(remainingPath);
      } else {
        return this;
      }
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

  /**
   * Removes a node from the trie based on the given path.
   *
   * @param path - The path of the node to be removed.
   * @returns `true` if the node was successfully removed, `false` otherwise.
   */
  public removeNode(path: string): boolean {
    const node = this.findNode(path);
    if (node !== undefined) {
      if (node.parent) {
        const children = node.parent.children;
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

  /**
   * Checks if a node exists at the specified path.
   *
   * @param path - The path to the node.
   * @returns `true` if a node exists at the specified path, `false` otherwise.
   */
  public hasNode(path: string): boolean {
    return this.findNode(path) !== undefined;
  }

  /**
   * Retrieves the TrieNode associated with the specified path.
   *
   * @param path - The path to search for.
   * @returns The TrieNode associated with the specified path, or undefined if not found.
   */
  public getNode(path: string): TrieNode<F> | undefined {
    return this.findNode(path);
  }

  /**
   * Prunes the trie node by removing any unnecessary child nodes.
   * This method recursively prunes all child nodes and merges any dangling nodes.
   */
  public prune(): void {
    this._children.forEach((child) => {
      child.prune();
      child.mergeDangling();
    });
  }

  /**
   * Merges the current TrieNode with its only child if certain conditions are met.
   * If the node has no children or both the parent and child have handlers, no merging is performed.
   * Otherwise, the child node is merged into the parent node by updating the path, children, and handlers.
   */
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

  /**
   * Creates a deep copy of the TrieNode instance.
   *
   * @returns A new TrieNode instance that is a clone of the current node.
   */
  public clone(): TrieNode<F> {
    const node = new TrieNode<F>(
      this.path,
      undefined,
    );
    node._children = new Map(this._children);
    node._handlers = new Map(this._handlers);
    return node;
  }

  /**
   * Synchronizes the TrieNode's children by updating their paths if necessary.
   * If a child's path does not match its key, the child is removed from the TrieNode's children
   * and re-added with the correct path.
   */
  public sync(): void {
    this._children.forEach((node, key) => {
      if (node.path !== key) {
        this._children.delete(key);
        this._children.set(node.path, node);
      }
    });
  }

  /**
   * Finds a node in the trie that matches the given path.
   *
   * @param path - The path to search for.
   * @returns The TrieNode that matches the given path, or undefined if not found.
   */
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

  public options(): Array<Methods> {
    // Get all methods for this and its child nodes
    return Array.from(this._handlers.keys());
  }
  //#endregion Node Management

  //#region Handler Management
  /**
   * Checks if the TrieNode has a handler for the specified HTTP method.
   *
   * @param method - The HTTP method to check.
   * @returns `true` if the TrieNode has a handler for the specified method, `false` otherwise.
   */
  public hasHandler(method: Methods): boolean {
    return this._handlers.has(method);
  }

  /**
   * Adds a handler function for the specified HTTP method.
   *
   * @param method - The HTTP method for which the handler is being added.
   * @param handlers - The handler functions to be added.
   */
  public addHandler(method: Methods, ...handlers: F[]): void {
    if (!this._handlers.has(method)) {
      this._handlers.set(method, []);
    }
    this._handlers.get(method)?.push(...handlers);
  }

  /**
   * Removes the specified handler(s) for the given HTTP method.
   * If no handler is provided, all handlers for the method will be removed.
   *
   * @param method - The HTTP method for which the handler(s) should be removed.
   * @param handler - The handler(s) to be removed. If not provided, all handlers for the method will be removed.
   */
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

  /**
   * Returns the handlers for a specific HTTP method. If none are found, it
   * will return an empty array
   *
   * @param method Method The HTTP Method for which to get the handlers
   * @returns F[] Array of handlers if any
   */
  public getHandlers(method: Methods): F[] {
    if (this._handlers.has(method)) {
      return this._handlers.get(method) ?? [];
    }
    return [];
  }
  //#endregion Handler Management

  /**
   * Cleans up the url or path. It basically removes leading and trailing
   * slashes and removes repeating slashes
   *
   * @param url URL or path to clean
   * @returns The cleaned url
   */
  private __cleanUrl(url: string): string {
    return url
      .replace(/^\/+|\/+$/g, '') // NOSONAR Remove leading and trailing slashes
      .replace(/\/{2,}/g, '/'); // Replace double slashes
  }

  /**
   * Cleans the path provided. It:
   * - Replaces leading and trailing slashes
   * - Replaces repeating slashes
   * - Converts all segments, except parameter names, to lowercase
   *
   * @param path The path to clean
   * @returns The cleaned path
   */
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

  /**
   * Processes the path and extracts parameters (if any)
   *
   * @param path The path to process
   * @returns { path: string, params: Map<string, ParamInfo> } The processed path
   */
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
      const { paramName, isWildcard } = this.__processParam(
        match[0].slice(1, -1),
      );
      params.set(paramName, {
        position: match.index,
        isWildcard: isWildcard,
      });
    }
    return { path, params };
  }

  /**
   * Compares the provided path with current node path and returns the
   * common segments if any. If none found, it will return empty string.
   *
   * @param path The path to process
   * @returns The common path
   */
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

  private __processParam(
    name: string,
  ): { paramName: string; isWildcard: boolean } {
    return {
      paramName: name.replace('*', '').trim(),
      isWildcard: name.endsWith('*'),
    };
  }
}
