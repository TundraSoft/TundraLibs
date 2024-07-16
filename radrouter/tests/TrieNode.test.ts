import { asserts } from '../../dev.dependencies.ts';
import { TrieNode } from '../TrieNode.ts';

Deno.test('RadRouter > TrieNode', async (t) => {
  const router = new TrieNode();

  await t.step('Must add node', () => {
    const tmp = router.addNode('/users/{id}');
    asserts.assertEquals(tmp.path, 'users/{id}');
    asserts.assertEquals(tmp.parent?.path, '');
  });

  await t.step('Add Nested Routes', () => {
    router.addNode('/users/{id}/posts');
    const tmp = router.addNode('/users//{id}/posts/{pid}');
    router.addNode('/users//{id}/posts/{pid}/comments');
    const cs = router.addNode('/uSerS//{id}/comments/{cid}');
    // Ensure double slashes are removed
    asserts.assertEquals(tmp.path, '{pid}');
    if (tmp.parent) {
      asserts.assertEquals(tmp.parent.path, 'posts');
    }
    asserts.assertEquals(cs.fullPath, 'users/{id}/comments/{cid}');
  });

  await t.step('Check if a node exists', () => {
    asserts.assertEquals(router.hasNode('/users/{id}/posts'), true);
    asserts.assertEquals(router.hasNode('users/{id}/posts/{pid}'), true);
    asserts.assertEquals(
      router.hasNode('/users/{id}/posts/{pid}/comments/{cid}'),
      false,
    );
  });

  await t.step('Fetch a specific node', () => {
    asserts.assertEquals(router.getNode('/users/{id}/postd'), undefined);
    asserts.assertEquals(router.getNode('/users/'), undefined);
    asserts.assertInstanceOf(router.getNode('/users/{id}/posts'), TrieNode);
    asserts.assertInstanceOf(
      router.getNode('/users/{id}/posts/{pid}'),
      TrieNode,
    );
  });

  await t.step('Remove Node', () => {
    router.addNode('/users/{id}/group');
    asserts.assertEquals(router.hasNode('/users/{id}/group'), true);
    router.removeNode('/users/{id}/group');
    asserts.assertEquals(router.hasNode('/users/{id}/group'), false);
  });

  await t.step('Handlers', () => {
    router.addNode('/users/{id}').addHandler(
      'GET',
      () => console.log('GET /users/{id}'),
    );
    router.addNode('/users/{id}/posts/{pid}').addHandler(
      'GET',
      () => console.log('GET /users/{id}/posts/{pid}'),
    );
    router.addNode('/users/{id}/posts/{pid}/comments').addHandler(
      'GET',
      () => console.log('GET /users/{id}/posts/{pid}/comments'),
    );
    router.addNode('/users/{id}/comments/{cid}').addHandler(
      'GET',
      () => console.log('GET /users/{id}/comments/{cid}'),
    );
    asserts.assertEquals(
      router.getNode('/users/{id}')!.handlers.has('GET'),
      true,
    ); // NOSONAR
    // asserts.assertEquals(router.getNode('/users/{id}/posts')!.handlers.has('GET'), true);
    asserts.assertEquals(
      router.getNode('/users/{id}/posts/{pid}')!.hasHandler('POST'),
      false,
    ); // NOSONAR
  });

  await t.step('Index', () => {
    asserts.assertEquals(router.index(), {
      '': [],
      'users/{id}': ['GET'],
      'users/{id}/posts': [],
      'users/{id}/posts/{pid}': ['GET'],
      'users/{id}/posts/{pid}/comments': ['GET'],
      'users/{id}/comments/{cid}': ['GET'],
    });
  });

  await t.step('Prune & Compat', () => {
    router.prune();
    asserts.assertEquals(router.index(), {
      '': [],
      'users/{id}': ['GET'],
      'users/{id}/comments/{cid}': ['GET'],
      'users/{id}/posts/{pid}': ['GET'],
      'users/{id}/posts/{pid}/comments': ['GET'],
    });
  });
});
