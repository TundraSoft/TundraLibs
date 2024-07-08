import { MockTest, server } from './fixtures/mockServer.ts';
import { getFreePort } from '../../utils/mod.ts';
import {
  RESTlerAuthFailure,
  RESTlerTimeoutError,
  RESTlerUnhandledError,
  RESTlerUnsupportedContentType,
} from '../mod.ts';
import { asserts } from '../../dev.dependencies.ts';

Deno.test('RESTler:Mock', async (t) => {
  const port = getFreePort();
  const mockServer = server(port);
  const mock = new MockTest(port);
  await t.step('Should list name of class', () => {
    asserts.assertEquals(mock.name, 'mock');
  });

  await t.step('Should list users', async () => {
    const users = await mock.listUsers();
    asserts.assertEquals(users.length, 1);
  });

  await t.step('authentication must work', async () => {
    mock.doAuth = true;
    const user = await mock.createUser('test@example.com');
    asserts.assertEquals(user.email, 'test@example.com');
  });

  await t.step('should throw auth error', async () => {
    mock.doAuth = false;
    mock.authKey = undefined;
    await asserts.assertRejects(
      () => mock.createUser('sdfsdf'),
      RESTlerAuthFailure,
    );
    try {
      await mock.createUser('sdfsdf');
    } catch (e) {
      asserts.assertEquals(e.message, 'Authentication failed');
      asserts.assert((e as RESTlerAuthFailure).url);
      // assert((e as RESTlerAuthFailure).vendor);
      // assert((e as RESTlerAuthFailure).version);
      asserts.assert((e as RESTlerAuthFailure).method);
      asserts.assert((e as RESTlerAuthFailure).toString());
    }
  });

  await t.step('should timeout', async () => {
    await asserts.assertRejects(() => mock.timeout(), RESTlerTimeoutError);
  });

  await t.step('should throw error on unknown content type', async () => {
    await asserts.assertRejects(
      () => mock.unknown(),
      RESTlerUnsupportedContentType,
    );
  });

  await t.step('Unhandled error', async () => {
    await asserts.assertRejects(() => mock.unhandled(), RESTlerUnhandledError);
  });

  await mockServer.shutdown();
});
