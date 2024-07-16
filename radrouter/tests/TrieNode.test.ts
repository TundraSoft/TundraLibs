import { asserts } from '../../dev.dependencies.ts';
import { TrieNode } from '../mod.ts';

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
    const t = router.getNode('/users/{id}/');
    if (t) {
      asserts.assertEquals(
        t.handlers.has('GET'),
        true,
      );
      asserts.assertEquals(
        t.hasHandler('POST'),
        false,
      );
    }
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
    asserts.assertEquals(router.findNode('')?.path, '');
  });

  await t.step('Find', () => {
    const tmp = router.find('/users/123/posts/456');
    asserts.assert(tmp);
    asserts.assertEquals(tmp.params, { id: '123', pid: '456' });

    const tmp2 = router.find('/users/123/post/456');
    asserts.assertEquals(tmp2, undefined);
  });

  await t.step('Sceanrio - Split and add', () => {
    const t = new TrieNode('/users/{id}/posts/{pid}');
    const user = t.addNode('users/{id}');
    asserts.assertEquals(t.path, 'users/{id}');
    asserts.assertEquals(t, user);
  });

  await t.step('Handlers Testing', () => {
    const t = new TrieNode('/users/{id}/posts/{pid}');
    t.addHandler('GET', () => console.log('GET /users/{id}/posts/{pid}'));
    t.addHandler('POST', () => console.log('POST /users/{id}/posts/{pid}'));
    t.addHandler('PUT', () => console.log('PUT /users/{id}/posts/{pid}'));
    t.addHandler('DELETE', () => console.log('DELETE /users/{id}/posts/{pid}'));
    asserts.assertEquals(t.handlers.size, 4);
    t.addNode('/users/{id}/posts/{pid}/author/user_{id}').addHandler(
      'GET',
      () => console.log('GET /users/{id}/posts/{pid}/author/{id}'),
    );
    const fr = t.find('/users/123/posts/456/author/user_789');
    asserts.assertEquals(fr, undefined);
    const fr2 = t.find('/users/123/posts/456/author/user_123');
    asserts.assertEquals(fr2?.params, { id: '123', pid: '456' });
    asserts.assertEquals(fr2?.node.path, 'author/user_{id}');
  });
});
