import { Methods, Middleware } from './types/mod.ts';
import { TrieNode } from './TrieNode.ts';

export class RadRouter<F extends Middleware = Middleware> {
  protected _routes: Map<string, TrieNode<F>> = new Map();
  protected _globalMiddleware: F[] = [];

  constructor() {
    this._routes.set('DEFAULT', new TrieNode('/'));
  }

  use(...handler: F[]) {
    this._globalMiddleware.push(...handler);
  }

  add(method: Methods, url: string, handler: F[], version: string = 'DEFAULT') {
    if (!this._routes.has(version)) {
      this._routes.set(version, new TrieNode('/'));
    }
    const node = this._routes.get(version)?.addNode(url);
    if (node !== undefined) {
      if (node.hasHandler(method)) {
        throw new Error(
          `Method ${method} already exists for path ${url} in version ${version}`,
        );
      }
      node.addHandler(method, ...handler);
    }
    return this; // Lets allow chaining
  }

  options(url: string, version: string = 'DEFAULT'): Methods[] {
    if (!this._routes.has(version)) {
      throw new Error(`No routes found for version ${version} and URL ${url}`);
    }
    const node = this._routes.get(version)?.findNode(url);
    if (node === undefined) {
      throw new Error(`No routes for version ${version} and URL ${url}`);
    }
    return node.options();
  }

  head(url: string, handler: F[], version: string = 'DEFAULT') {
    return this.add('HEAD', url, handler, version);
  }

  get(url: string, handler: F[], version: string = 'DEFAULT') {
    return this.add('GET', url, handler, version);
  }

  post(url: string, handler: F[], version: string = 'DEFAULT') {
    return this.add('POST', url, handler, version);
  }

  put(url: string, handler: F[], version: string = 'DEFAULT') {
    return this.add('PUT', url, handler, version);
  }

  patch(url: string, handler: F[], version: string = 'DEFAULT') {
    return this.add('PATCH', url, handler, version);
  }

  delete(url: string, handler: F[], version: string = 'DEFAULT') {
    return this.add('DELETE', url, handler, version);
  }

  handle(method: Methods, url: string, version: string = 'DEFAULT') {
    if (!this._routes.has(version) && version !== 'DEFAULT') {
      throw new Error(`No routes for version ${version}`);
    }
    const root = this._routes.get(version)!;
    const def = this._routes.get('DEFAULT')!;
    const search = root.find(url) || def.find(url);
    if (
      search === undefined || search.node === undefined ||
      search.node.hasHandler(method) === false
    ) {
      throw new Error(`No handler for ${method} ${url}`);
    }
    return {
      handler: this._buildMiddleware(search.node.getHandlers(method)),
      params: { ...search.params },
    };
  }

  protected _buildMiddleware(handlers: F[]): F[] {
    return this._globalMiddleware.concat(handlers);
  }
}
