import { MockTest, server } from './fixtures/mockServer.ts';
import { getFreePort } from '../../utils/mod.ts';
import {
  RESTlerAuthFailure,
  RESTlerTimeoutError,
  RESTlerUnhandledError,
  RESTlerUnsupportedContentType,
} from '../mod.ts';
import { assert, assertEquals, assertRejects } from '../../dev.dependencies.ts';

Deno.test('RESTler:Mock', async (t) => {
  const port = getFreePort();
  const mockServer = server(port);
  const mock = new MockTest(port);
  await t.step('Should list name of class', () => {
    assertEquals(mock.name, 'mock');
  });

  await t.step('Should list users', async () => {
    const users = await mock.listUsers();
    assertEquals(users.length, 1);
  });

  await t.step('authentication must work', async () => {
    mock.doAuth = true;
    const user = await mock.createUser('test@example.com');
    assertEquals(user.email, 'test@example.com');
  });

  await t.step('should throw auth error', async () => {
    mock.doAuth = false;
    mock.authKey = undefined;
    await assertRejects(() => mock.createUser('sdfsdf'), RESTlerAuthFailure);
    try {
      await mock.createUser('sdfsdf');
    } catch (e) {
      assertEquals(e.message, 'Authentication failed');
      assert((e as RESTlerAuthFailure).url);
      // assert((e as RESTlerAuthFailure).vendor);
      // assert((e as RESTlerAuthFailure).version);
      assert((e as RESTlerAuthFailure).method);
      assert((e as RESTlerAuthFailure).toString());
    }
  });

  await t.step('should timeout', async () => {
    await assertRejects(() => mock.timeout(), RESTlerTimeoutError);
  });

  await t.step('should throw error on unknown content type', async () => {
    await assertRejects(() => mock.unknown(), RESTlerUnsupportedContentType);
  });

  await t.step('Unhandled error', async () => {
    await assertRejects(() => mock.unhandled(), RESTlerUnhandledError);
  });

  await mockServer.shutdown();
});
