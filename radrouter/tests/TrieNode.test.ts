import { asserts } from '../../dev.dependencies.ts';
import { TrieNode } from '../TrieNode.ts';

Deno.test('RadRoute > TrieNode', async (t) => {
  const rootNode = new TrieNode('/');

  await t.step('addNode', () => {
    const n = rootNode.addNode('users/:id');

    asserts.assertEquals(n.path, 'users/:id');
    asserts.assertInstanceOf(n.parent, TrieNode);
  });
});

Deno.test('TrieNode - getHandlers', () => {
  const node = new TrieNode('/users/:id/');
  const middleware1 = () => {};
  const middleware2 = () => {};
  node.addHandler('GET', middleware1);
  node.addHandler('POST', middleware2);

  const handlers = node.getHandlers('GET');

  asserts.assertEquals(handlers.length, 1);
  asserts.assertStrictEquals(handlers[0], middleware1);
});

Deno.test('TrieNode - removeHandler', () => {
  const node = new TrieNode('/users/:id/');
  const middleware1 = () => {};
  const middleware2 = () => {};
  node.addHandler('GET', middleware1);
  node.addHandler('GET', middleware2);

  node.removeHandler('GET', middleware1);

  const handlers = node.getHandlers('GET');

  asserts.assertEquals(handlers.length, 1);
  asserts.assertStrictEquals(handlers[0], middleware2);
});

Deno.test('TrieNode - removeHandlers', () => {
  const node = new TrieNode('/users/:id/');
  const middleware1 = () => {};
  const middleware2 = () => {};
  node.addHandler('GET', middleware1);
  node.addHandler('POST', middleware2);

  node.removeHandlers('GET');

  const handlers = node.getHandlers('GET');

  asserts.assertEquals(handlers.length, 0);
});

Deno.test('TrieNode - hasNode', () => {
  const node = new TrieNode('/users/:id/');
  node.addNode('users/:id/posts/');
  node.addNode('users/:id/comments/');

  const hasNode1 = node.hasNode('users/:id/posts/');
  const hasNode2 = node.hasNode('users/:id/likes/');
  asserts.assertEquals(hasNode1, true);
  asserts.assertEquals(hasNode2, false);
});

Deno.test('TrieNode - updatePaths', () => {
  const node = new TrieNode('/users/:id/');
  const childNode = node.addNode('users/:id/posts/');
  childNode.path = 'users/:id/likes/';

  node.updatePaths();

  const hasChildNode = node.hasNode('users/:id/posts/');
  const hasUpdatedChildNode = node.hasNode('users/:id/likes/');
  console.log(hasChildNode);
  console.log(hasUpdatedChildNode);
  asserts.assert(!hasChildNode);
  asserts.assert(hasUpdatedChildNode);
});

Deno.test('TrieNode - clone', () => {
  const node = new TrieNode('/users/:id/');
  const childNode = node.addNode('users/:id/posts/');
  const middleware = () => {};
  childNode.addHandler('GET', middleware);

  const clonedNode = node.clone();

  asserts.assertEquals(clonedNode.path, node.path);
  asserts.assertEquals(clonedNode.getHandlers('GET').length, 1);
  asserts.assertStrictEquals(clonedNode.getHandlers('GET')[0], middleware);
});

Deno.test('TrieNode - cleanPath', () => {
  const node = new TrieNode();
  const path1 = '/users/:id/';
  const path2 = '/Users/:ID/';
  const path3 = '/users/:id/posts/';
  const path4 = '/users/:id/posts/:post_id/';

  const cleanedPath1 = node['_cleanPath'](path1);
  const cleanedPath2 = node['_cleanPath'](path2);
  const cleanedPath3 = node['_cleanPath'](path3);
  const cleanedPath4 = node['_cleanPath'](path4);

  asserts.assertEquals(cleanedPath1, 'users/:id');
  asserts.assertEquals(cleanedPath2, 'users/:id');
  asserts.assertEquals(cleanedPath3, 'users/:id/posts');
  asserts.assertEquals(cleanedPath4, 'users/:id/posts/:post_id');
});

Deno.test('TrieNode - processPath', () => {
  const node = new TrieNode();
  const path1 = '/users/:id/';
  const path2 = '/users/:id/posts/:post_id/';

  const { path: processedPath1, params: params1 } = node['_processPath'](path1);
  const { path: processedPath2, params: params2 } = node['_processPath'](path2);

  asserts.assertEquals(processedPath1, 'users/:id');
  asserts.assertEquals(params1.size, 1);
  asserts.assertEquals(params1.get('id')?.position, 1);
  asserts.assertEquals(params1.get('id')?.isWildcard, false);

  asserts.assertEquals(processedPath2, 'users/:id/posts/:post_id');
  asserts.assertEquals(params2.size, 2);
  asserts.assertEquals(params2.get('id')?.position, 1);
  asserts.assertEquals(params2.get('id')?.isWildcard, false);
  asserts.assertEquals(params2.get('post_id')?.position, 3);
  asserts.assertEquals(params2.get('post_id')?.isWildcard, false);
});

Deno.test('TrieNode - getCommonPath', () => {
  const node = new TrieNode('/users/:id/');
  const path1 = '/users/:id/posts/';
  const path2 = '/users/:id/comments/';
  const path3 = '/users/:id/posts/:post_id/';

  const commonPath1 = node['__getCommonPath'](path1);
  const commonPath2 = node['__getCommonPath'](path2);
  const commonPath3 = node['__getCommonPath'](path3);

  asserts.assertEquals(commonPath1, '/users/:id');
  asserts.assertEquals(commonPath2, '/users/:id');
  asserts.assertEquals(commonPath3, '/users/:id/posts');
});

Deno.test('TrieNode - mergeChild', () => {
  const node = new TrieNode('/users/:id/');
  const childNode = node.addNode('users/:id/posts/');
  const middleware = () => {};
  childNode.addHandler('GET', middleware);

  node.mergeChild();

  const mergedPath = node.path;
  const hasChildNode = node.hasNode('users/:id/posts/');
  const handlers = node.getHandlers('GET');

  asserts.assertEquals(mergedPath, '/users/:id/posts');
  asserts.assert(!hasChildNode);
  asserts.assertEquals(handlers.length, 1);
  asserts.assertStrictEquals(handlers[0], middleware);
});

Deno.test('TrieNode - prune', () => {
  const node = new TrieNode('/users/:id/');
  const childNode1 = node.addNode('users/:id/posts/');
  const _childNode2 = node.addNode('users/:id/comments/');
  const middleware = () => {};
  childNode1.addHandler('GET', middleware);

  node.prune();

  const hasChildNode1 = node.hasNode('users/:id/posts/');
  const hasChildNode2 = node.hasNode('users/:id/comments/');
  const handlers = node.getHandlers('GET');

  asserts.assert(!hasChildNode1);
  asserts.assert(hasChildNode2);
  asserts.assertEquals(handlers.length, 1);
  asserts.assertStrictEquals(handlers[0], middleware);
});
