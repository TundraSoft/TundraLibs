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

  get fullPath() {
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
      if (bestMatch === bestMatchNode?.path) {
        bestMatchNode.add(cleanPath.slice(bestMatch.length), method, handler);
      } else {
        const remainingPath = cleanPath.slice(bestMatch.length);
        const newParent = new RouterNode(bestMatch, this);
        newParent._children.push(new RouterNode(remainingPath, newParent));
        bestMatchNode.parent = newParent;
        bestMatchNode.path = bestMatchNode.path.slice(bestMatch.length);
        delete this
          ._children[this._children.indexOf(bestMatchNode as RouterNode)];
        newParent.inject(bestMatchNode);
        this._children.push(newParent);
      }
    }
  }

  find(path: string): RouteHandler {
    const [cleanPath, _params]: [string, string[]] = this._standardizePath(
      path,
    );
    // We need to check if the path exists in this ones children or their children
    // Note - path can contain params (:param) or wildcards (*param). We will need to account for that
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

  _splitPath(path: string): string[] {
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
a.add('/a/b/c');
a.add('/a/b/d');
a.add('/a/b/c/e');
console.log(a.children[1].fullPath);
// console.log(a._stripPath('/a/b/c/:PARAM1/xc/f/asd:PARAM2/:PARAM3/'));
