import { RESTler } from '../mod.ts';
import { asserts } from '../../dev.dependencies.ts';

Deno.test('RESTler > Socket', async (t) => {
  class TestClass extends RESTler {
    constructor() {
      super('test', {
        endpointURL: '/var/run/docker.sock',
        isUnixSocket: true,
      });
    }

    async ping(): Promise<boolean> {
      try {
        await this._makeRequest({
          endpoint: this._buildEndpoint('GET', '/_ping'),
        });
        return true;
      } catch (_e) {
        return false;
      }
    }

    async listContainers() {
      const containers = await this._makeRequest({
        endpoint: this._buildEndpoint('GET', '/containers/json'),
      });
      return containers.body;
    }
  }
  const c = new TestClass();
  await t.step('Should connect to socket and run test', async () => {
    asserts.assertEquals(await c.ping(), true);
    asserts.assert(await c.listContainers());
  });
});
