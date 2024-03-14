import { MockTest, server } from './mockServer.ts';
import { getFreePort } from '../../utils/mod.ts';
import { RESTlerAuthFailure } from '../mod.ts';
import {
  afterAll,
  assertEquals,
  assertRejects,
  beforeAll,
  describe,
  it,
} from '../../dev.dependencies.ts';

export class S extends Error {}
describe('RESTler', () => {

  describe('Mock Sample', () => {
    let port: number;
    let mockServer: Deno.HttpServer,
      mock: MockTest;

    beforeAll(() => {
      port = getFreePort();
      mockServer = server(port);
      mock = new MockTest(port);
    });

    afterAll(async () => {
      await mockServer.shutdown();
    });

    it('Should list name of class', () => {
      assertEquals(mock.name, 'mock');
    });

    it('Should list users', async () => {
      const users = await mock.listUsers();
      assertEquals(users.length, 1);
    });

    it('authentication must work', async () => {
      mock.doAuth = true;
      const user = await mock.createUser('test@example.com');
      assertEquals(user.email, 'test@example.com');
    });

    it('should throw auth error', async () => {
      mock.doAuth = false;
      mock.authKey = undefined;
      await assertRejects(() => mock.createUser('sdfsdf'), RESTlerAuthFailure);
    });
  });
});
