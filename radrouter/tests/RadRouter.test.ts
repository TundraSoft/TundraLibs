import { asserts } from '../../dev.dependencies.ts';
import { RadRouter } from '../RadRouter.ts';

Deno.test('RadRouter', async (t) => {
  await t.step('Add route', () => {
    const router = new RadRouter();

    router.get('/users', [() => {}]);

    const options = router.options('/users');
    asserts.assertEquals(options, ['GET']);
  });

  await t.step('Add route with version', () => {
    const router = new RadRouter();

    router.get('/users', [() => {}], 'v1');

    const options = router.options('/users', 'v1');
    asserts.assertEquals(options, ['GET']);
  });

  await t.step('Add duplicate route', () => {
    const router = new RadRouter();

    router.get('/users', [() => {}]);

    try {
      router.get('/users', [() => {}]);
    } catch (error) {
      asserts.assertEquals(
        error.message,
        'Method GET already exists for path /users in version DEFAULT',
      );
    }
  });

  await t.step('Handle route', () => {
    const router = new RadRouter();

    const handler = () => {};

    router.get('/users', [handler]);

    const { handler: resolvedHandler, params } = router.handle('GET', '/users');
    asserts.assertEquals(resolvedHandler, [handler]);
    asserts.assertEquals(params, {});
  });

  await t.step('Handle route with version', () => {
    const router = new RadRouter();

    const handler = () => {};

    router.get('/users', [handler], 'v1');

    const { handler: resolvedHandler, params } = router.handle(
      'GET',
      '/users',
      'v1',
    );
    asserts.assertEquals(resolvedHandler, [handler]);
    asserts.assertEquals(params, {});
  });

  await t.step('Handle route with parameters', () => {
    const router = new RadRouter();

    const handler = () => {};

    router.get('/users/{id}', [handler]);

    const { handler: resolvedHandler, params } = router.handle(
      'GET',
      '/users/123',
    );
    asserts.assertEquals(resolvedHandler, [handler]);
    asserts.assertEquals(params, { id: '123' });
  });

  await t.step('Handle route with global middleware', () => {
    const router = new RadRouter();

    const globalMiddleware = () => {};
    const routeMiddleware = () => {};

    router.use(globalMiddleware);
    router.get('/users', [routeMiddleware]);

    const { handler: resolvedHandler } = router.handle('GET', '/users');
    asserts.assertEquals(resolvedHandler, [globalMiddleware, routeMiddleware]);
  });
});
