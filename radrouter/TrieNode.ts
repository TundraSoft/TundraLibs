import { path } from '../dependencies.ts';
import type { HTTPMethods } from '../utils/mod.ts';
import { Middleware } from './types/mod.ts';

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

/**
 * A node in a Trie data structure, used for efficient path routing.
 */
export class TrieNode<F extends Middleware = Middleware> {
  private _path!: string;
  private _parent?: TrieNode<F>;
  private _children: Map<string, TrieNode<F>> = new Map();
  private _params: Map<string, ParamInfo> = new Map();
  private _handlers: Map<HTTPMethods, F[]> = new Map();

  /**
   * Gets the path of the current node.
   */
  get path(): string {
    return this._path;
  }

  /**
   * Sets the path of the current node.
   * @param path The new path for the node.
   */
  set path(path: string) {
    const { path: processedPath, params } = this.__processPath(path);
    this._path = processedPath;
    this._params = params;
    if (this._parent) {
      this._parent.updatePaths();
    }
  }

  /**
   * Gets the full path of the current node (including parent paths).
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
   * @param parent The new parent node for the current node.
   */
  set parent(parent: TrieNode<F> | undefined) {
    if (this._parent) {
      // Ask parent to delete this node
      this._parent.removeNode(this.path);
    }
    // Ensure this node is present as parent's child
    this._parent = parent;
  }

  /**
   * Creates a new TrieNode.
   * @param path The path for the new node.
   * @param parent The parent node for the new node.
   * @param children The child nodes for the new node.
   */
  constructor(path = '/', parent?: TrieNode<F>, children: TrieNode<F>[] = []) {
    this.path = path;
    this.parent = parent;
    if (children.length > 0) {
      children.forEach((child) => {
        this._children.set(child.path, child);
        // Ensure parent is correctly set
        child.parent = this;
      });
    }
  }

  /**
   * Adds a new node to the Trie. It intelligently handles splitting nodes and finding the best place to insert the new node.
   * @param path The path to add.
   * @returns TrieNode - The created node.
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

  /**
   * Removes the node which matches the specified path.
   * NOTE - Will remove all children of the node as well
   *
   * @param path The path to remove
   */
  public removeNode(path: string) {
    path = this.__cleanPath(path);
    // We need to find the node to remove
    if (path.startsWith(this.path)) {
      // check in children
      const remaining = path.slice(this.path.length);
      this._children.forEach((child, key) => {
        if (child.path === remaining) {
          this._children.delete(key);
          return;
        } else if (
          child.path.startsWith(remaining) ||
          remaining.startsWith(child.path)
        ) {
          child.removeNode(remaining);
        }
      });
    }
  }

  /**
   * Checks if a node with the given path exists.
   * @param path The path to check.
   * @returns True if the node exists, false otherwise.
   */
  public hasNode(path: string): boolean {
    path = this.__cleanPath(path);
    // We need to find the node to remove
    if (path === this.path) {
      return true;
    }
    if (path.startsWith(this.path)) {
      // check in children
      const remaining = this.__cleanPath(path.slice(this.path.length));
      for (const child of this._children.values()) {
        // this._children.forEach((child) => {
        if (child.path === remaining) {
          return true;
        } else if (
          child.path.startsWith(remaining) ||
          remaining.startsWith(child.path)
        ) {
          return child.hasNode(remaining);
        }
      }
    }
    return false;
  }

  /**
   * Ensures that the paths in the _children map are consistent.
   */
  public updatePaths() {
    this._children.forEach((child, key) => {
      if (child.path !== key) {
        this._children.delete(key);
        if (!this._children.has(child.path)) {
          this._children.set(child.path, child);
        }
      }
    });
  }

  /**
   * Creates a deep copy of the current node.
   * @returns A new TrieNode that is a deep copy of the current node.
   */
  public clone(): TrieNode<F> {
    const node = new TrieNode<F>(
      this.path,
      undefined,
      Array.from(this._children.values()),
    );
    this._handlers.forEach((handlers, method) => {
      node.addHandler(method, ...handlers);
    });
    return node;
  }

  /**
   * Checks if the current node has middleware functions for a specific HTTP method.
   * @param method The HTTP method to check for.
   * @returns True if the node has handlers for the specified method, false otherwise.
   */
  public hasHandler(method: HTTPMethods): boolean {
    return this._handlers.has(method);
  }

  /**
   * Adds middleware functions for a specific HTTP method.
   * @param method The HTTP method to add handlers for.
   * @param handlers The middleware functions to add.
   */
  public addHandler(method: HTTPMethods, ...handlers: F[]) {
    if (!this._handlers.has(method)) {
      this._handlers.set(method, []);
    }
    this._handlers.get(method)?.push(...handlers);
  }

  /**
   * Removes a specific middleware function.
   * @param method The HTTP method to remove the handler from.
   * @param handler The middleware function to remove.
   */
  public removeHandler(method: HTTPMethods, handler: F) {
    if (this._handlers.has(method)) {
      this._handlers
        .get(method)
        ?.splice(this._handlers.get(method)?.indexOf(handler) ?? 0, 1);
    }
  }

  /**
   * Removes all middleware functions for a specific method.
   * @param method The HTTP method to remove handlers from.
   */
  public removeHandlers(method: HTTPMethods) {
    if (this._handlers.has(method)) {
      this._handlers.delete(method);
    }
  }

  /**
   * Retrieves middleware functions for a specific method.
   * @param method The HTTP method to retrieve handlers for.
   * @returns An array of middleware functions for the specified method.
   */
  public getHandlers(method: HTTPMethods): F[] {
    if (this._handlers.has(method)) {
      return this._handlers.get(method) ?? [];
    }
    return [];
  }

  /**
   * Cleans up a path by removing leading/trailing slashes, replacing double slashes, and converting to lowercase.
   * @param path The path to clean.
   * @returns The cleaned path.
   */
  private __cleanPath(path: string): string {
    return path
      .replace(/^\/+|\/+$/g, '') // Remove leading and trailing slashes
      .replace(/\/\//g, '/') // Replace double slashes
      .split('/')
      .map((part) =>
        // Convert to lowercase
        part.includes(':')
          ? part
            .split(':')
            .map((p, i) => (i !== 1 ? p.toLowerCase() : p))
            .join(':')
          : part.toLowerCase()
      )
      .join('/'); // Join the parts back together
  }

  /**
   * Extracts parameters from a path and stores them in _params.
   * @param path The path to process.
   * @returns An object containing the processed path and a map of parameters.
   */
  private __processPath(
    path: string,
  ): { path: string; params: Map<string, ParamInfo> } {
    path = this.__cleanPath(path);
    const params = new Map<string, ParamInfo>();
    path.split('/').forEach((part, idx) => {
      if (part.includes(':')) {
        params.set(part.split(':')[1].trim(), {
          position: idx,
          isWildcard: part.includes('*'),
        });
      }
    });
    return { path, params };
  }

  /**
   * Finds the longest common prefix between two paths.
   * @param path The path to compare with the current node's path.
   * @returns The longest common prefix.
   */
  public __getCommonPath(path: string): string {
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

  /**
   * Merges a child node into the current node if the conditions are met.
   *
   * Conditions:
   * - The node has no handlers defined.
   * - The node has either no children or only one child.
   * - The child node has no handlers defined.
   *
   * If the conditions are met, the child node's path is appended to the current
   * node's path, and the child node is removed.
   */
  public mergeChild(): void {
    if (this._handlers.size > 0) {
      return; // Node has handlers, no merging
    }

    if (this._children.size === 0) {
      return; // Node has no children, no merging
    }

    if (this._children.size > 1) {
      return; // Node has more than one child, no merging
    }

    const [childPath, childNode] = this._children.entries().next().value;

    if (childNode._handlers.size > 0) {
      return; // Child node has handlers, no merging
    }

    // Merge conditions met, proceed with merging
    this.path = path.join(this.path, childPath);
    this._children.delete(childPath);
    this._children = new Map(childNode._children);
    this._children.forEach((child) => {
      child.parent = this;
    });
  }

  /**
   * Prunes the Trie by removing nodes that have no handlers and only one child.
   * This can help reduce the size of the Trie and improve performance.
   */
  public prune(): void {
    this._children.forEach((child) => {
      child.prune();
      child.mergeChild();
    });
  }
}
