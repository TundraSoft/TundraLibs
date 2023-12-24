import type { HTTPMethods } from '../dependencies.ts';

type RouteHandler = () => void;
class RouterNode<T extends RouteHandler = RouteHandler> {
  protected _path: string;
  protected _params: string[] = [];
  protected _children: RouterNode[] = [];
  protected _parent: RouterNode | undefined = undefined;
  protected _handlers: Map<HTTPMethods, T[]> = new Map();

  constructor(path: string, parent: RouterNode | undefined = undefined) {
    const [cleanPath, params]: [string, string[]] = this._standardizePath(path);
    this._path = cleanPath;
    this._params = params;
    this._parent = parent;
  }

  get path() {
    return this._path;
  }

  set path(path: string) {
    this._path = path;
  }

  get params() {
    return this._params;
  }

  get fullPath(): string {
    return ((this._parent)
      ? `${this._parent.fullPath}${this._path}`
      : this._path).replace(/\/+/g, '/');
  }

  get parent() {
    return this._parent;
  }

  set parent(parent: RouterNode | undefined) {
    this._parent = parent;
  }

  get children() {
    return this._children;
  }

  add(path: string, method: HTTPMethods = 'GET', handler: T[]) {
    const [cleanPath, _params]: [string, string[]] = this._standardizePath(
      path,
    );
    // Find closes common match
    let bestMatch: string | undefined = undefined;
    let bestMatchNode: RouterNode | undefined = undefined;
    this._children.forEach((child) => {
      // Do a full check
      console.log('Comparing', child.path, cleanPath);
      if (child.path === cleanPath) {
        bestMatch = cleanPath;
        bestMatchNode = child;
        console.log('Found a full match');
        return;
      }
      // Ok now we have to compare the paths
      const commonPath = this._comparePaths(child.path, cleanPath);
      // console.log(`${commonPath.length} > 0 && ${commonPath.length} > ${bestMatch?.length}`)
      if (
        commonPath.length > 0 && commonPath.length > (bestMatch?.length || 0)
      ) {
        bestMatch = commonPath;
        bestMatchNode = child;
      }
    });
    // New Entry as no match found!
    if (bestMatch === undefined) {
      this._children.push(new RouterNode(cleanPath, this));
    } else {
      // Check if the child path is a full match
      if (bestMatch === (bestMatchNode as unknown as RouterNode).path) {
        (bestMatchNode as unknown as RouterNode).add(
          cleanPath.slice((bestMatch as string).length),
          method,
          handler,
        );
      } else {
        const remainingPath = cleanPath.slice((bestMatch as string).length);
        const newParent = new RouterNode(bestMatch, this);
        newParent._children.push(new RouterNode(remainingPath, newParent));
        (bestMatchNode as unknown as RouterNode).parent = newParent;
        (bestMatchNode as unknown as RouterNode).path =
          (bestMatchNode as unknown as RouterNode).path.slice(
            (bestMatch as string).length,
          );
        delete this
          ._children[
            this._children.indexOf(bestMatchNode as unknown as RouterNode)
          ];
        newParent.inject(bestMatchNode as unknown as RouterNode);
        this._children.push(newParent);
      }
    }
  }

  find(path: string): void {
    // clean the path
    const [cleanPath, _params]: [string, string[]] = this._standardizePath(
      path,
    );
    // ok now go through the children and find the best match
    console.log(`Attempting to find path ${cleanPath}`);
    this._children.forEach((child) => {
      const stPath = this._standardizePath(child.path)[0];
      if (this._comparePaths(stPath, cleanPath) === stPath) {
        // Found a match, till the params, now need to match params section
      }
      console.log(this._splitPath(child.path));
    });
  }

  inject(node: RouterNode) {
    this._children.push(node);
  }

  /**
   * Standardized the path (converting to lower case, checking for invalid characters) and extracts params
   *
   * @param path The path to strig
   * @returns [cleanPath, params] where cleanPath is the path which has been standardized (lowercase etc) and params is an array of params
   */
  protected _standardizePath(path: string): [string, string[]] {
    if (path === '/') return [path, []];
    // Convert all multiple slashes to single slash
    path = path.replace(/\/+/g, '/');
    // Convert all path items to lowercase unles it has : or *
    path = path.replace(/\/(\w+)/g, (_match, p1) => {
      return `/${p1.toLowerCase()}`;
    });
    path = path.replace(/\/$/, '').trim();

    const params: string[] = [];
    const paramRegex = /[:*](\w+)/g;
    const hasParams = paramRegex.test(path);

    if (hasParams) {
      console.log('Has params');

      path = path.replace(paramRegex, (_match, p1) => {
        params.push(p1);
        return `${_match}`;
      });

      console.log(params);
    }
    return [path, params];
  }

  protected _splitPath(path: string): string[] {
    // Split the path by params
    const paths = path.replace(/\/$/, '').split('/');
    const finalPath: string[] = [];
    let current: string[] = [];
    for (const p of paths) {
      if (p.includes(':') || p.includes('*')) {
        finalPath.push(current.join('/'));
        current = [];
        finalPath.push(p);
      } else {
        current.push(p);
      }
    }
    if (current.length > 0) {
      finalPath.push(current.join('/'));
    }
    return finalPath;
  }

  protected _comparePaths(path1: string, path2: string) {
    const path1Parts = path1.toLowerCase().split('/');
    const path2Parts = path2.toLowerCase().split('/');
    const len = Math.min(path1Parts.length, path2Parts.length);
    let i = 0;
    for (; i < len && path1Parts[i] === path2Parts[i]; i++);
    return path1Parts.slice(0, i).join('/');
  }

  debug(indent = 0) {
    const indentStr = ' '.repeat(indent);
    console.log(`${indentStr}Full path: ${this.fullPath}`);
    console.log(`${indentStr}Current node: ${this._path}`);
    console.log(`${indentStr}Parent: ${this._parent?._path}`);
    console.log(`${indentStr}Params: ${this._params.join(', ')}`);
    console.log(`${indentStr}Child count: ${this._children.length}`);
    this._children.forEach((child) => {
      console.log(`${indentStr}ChildPath: ${child.path}`);
      console.log(`${indentStr}Begin child info for ${child.path}`);
      child.debug(indent + 2);
      console.log(`${indentStr}End child info for ${child.path}`);
    });
  }
}

// const a = new RouterNode('');
// a.add('/a/b/c');
// a.add('/a/b/c/d');
// a.add('/a/b/e')
// a.add('/ded')
// console.log(a);
// console.log(new RouterNode('/a').path);
// console.log(new RouterNode('/a/').path);
// console.log(new RouterNode('/').path);
// console.log(new RouterNode('/a/b/c/:asdf/:asd').path);
// console.log(new RouterNode('/a/b/c/:asdf/:asd/:asdf').path);
// console.log(new RouterNode('/a/b/c/*a').path);
// console.log(new RouterNode('/A/B/C/DEW:A23/SDF/*ASFD/adf').path);

const a = new RouterNode('/');
a.add('/a/b/c', 'GET', [() => {}]);
a.add('/a/b/d', 'GET', [() => {}]);
a.add('/a/b/c/e', 'GET', [() => {}]);
a.add('/a/x', 'GET', [() => {}]);

// console.log(a.children[1].fullPath);
// console.log(`~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~`);
// console.log(a.debug());
// console.log(`~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~`);
// console.log(a._stripPath('/a/b/c/:PARAM1/xc/f/asd:PARAM2/:PARAM3/'));

console.log(a.find('/a/b/c'));
