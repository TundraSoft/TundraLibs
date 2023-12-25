type RouteHandler = () => void;
class RouteNode<T extends RouteHandler = RouteHandler> {
  path: string;
  handler?: T;
  children: Map<string, RouteNode<T>>;

  constructor(path = '/', handler?: T) {
    this.path = path;
    this.handler = handler;
    this.children = new Map();
  }
}

export class Router<T extends RouteHandler = RouteHandler> {
  root: RouteNode<T>;

  constructor() {
    this.root = new RouteNode();
  }

  add2(path: string, handler: T) {
    path = this._standardizePath(path);
    const segments = path.split('/');
    let node = this.root;
    for (const segment of segments) {
      if (segment === '') continue;
      if (!node.children.has(segment)) {
        node.children.set(segment, new RouteNode(segment));
      }
      node = node.children.get(segment)!;
    }
    node.handler = handler;
  }

  add(path: string, handler: T) {
    path = this._standardizePath(path);
    // Ok, lets search the node
    let node = this.root;
    // if(node.children.size === 0) {
    //   node.children.set(path, new RouteNode(path, handler));
    //   return;
    // }
    node.children.forEach((child) => {
      const cmp = this._comparePaths(path, child.path);
      if (cmp === child.path) {
        node = child;
      } else if (cmp.length > 0) {
        // Its a partial match
        console.log(`Partial match ${cmp}`);
      }
    });
    node.children.set(path, new RouteNode(path, handler));
  }

  find(path: string): T | undefined {
    path = this._standardizePath(path);
    const segments = path.split('/');
    let node = this.root;
    for (const segment of segments) {
      if (segment === '') continue;
      if (!node.children.has(segment)) return;
      node = node.children.get(segment)!;
    }
    return node.handler;
  }

  protected _standardizePath(path: string): string {
    path = `/${path}/`.trim();
    // Convert all multiple slashes to single slash
    path = path.replace(/\/+/g, '/');
    if (path === '/') return path;
    // Convert all path items to lowercase unles it has : or *
    path = path.replace(/\/(\w+)/g, (_match, p1) => {
      return `/${p1.toLowerCase()}`;
    });
    path = path.replace(/\/$/, '').trim();
    return path;
  }

  protected _comparePaths(path1: string, path2: string) {
    if (path1 === path2) return path1;
    const path1Parts = path1.toLowerCase().split('/');
    const path2Parts = path2.toLowerCase().split('/');
    const len = Math.min(path1Parts.length, path2Parts.length);
    let i = 0;
    for (; i < len && path1Parts[i] === path2Parts[i]; i++);
    return path1Parts.slice(0, i).join('/');
  }
}

const router = new Router();
router.add('/foos/:sDfGs', () => console.log('foo'));
router.add('/foo/bar', () => console.log('foo/bar'));
router.add('/foo/baz', () => console.log('foo/baz'));

console.log(router);

// router.find("/foo/:sDfGs")!();
