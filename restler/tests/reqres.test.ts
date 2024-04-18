import { RESTler } from '../mod.ts';
import {
  assertEquals,
} from '../../dev.dependencies.ts';

Deno.test('RESTler.reqres', async (t) => {
  type UserType = {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    avatar: string;
  };

  type ReqResResponse<T> = {
    data: T;
    support: {
      url: string;
      text: string;
    };
  };

  class TestClass extends RESTler {
    constructor() {
      super('test', {
        endpointURL: 'https://reqres.in/api',
        defaultHeaders: {
          'content-type': 'application/json',
          'accept': 'application/json',
        },
      });
    }

    async getUser(id: number): Promise<UserType> {
      return (await this._makeRequest<ReqResResponse<UserType>>({
        endpoint: this._buildEndpoint('GET', `/users/${id}`),
      })).body?.data as UserType;
    }

    async getUsers(): Promise<UserType[]> {
      const users = await this._makeRequest<ReqResResponse<UserType[]>>({
        endpoint: this._buildEndpoint('GET', `/users`, { limit: '1' }),
      });
      // Do some check
      return users.body?.data as UserType[];
    }

    async createUser(user: Pick<UserType, 'email'>): Promise<UserType> {
      const res = await this._makeRequest<UserType>({
        endpoint: this._buildEndpoint('POST', `/users`),
        body: user,
      });
      if (res.status === 201) {
        return res.body as UserType;
      } else {
        throw new Error('Failed to create user');
      }
    }
  }

  await t.step('Test GET method (multiple data)', async () => {
    const test = new TestClass();
    const users = await test.getUsers();
    assertEquals(users.length, 6);
  });

  await t.step('Test GET method (single data)', async () => {
    const test = new TestClass();
    const user = await test.getUser(1);
    assertEquals(user.email, 'george.bluth@reqres.in');
  });

  await t.step('Test POST method', async () => {
    const test = new TestClass();
    const user = await test.createUser({ email: 'morpheus@matrix.com' });
    assertEquals(user.email, 'morpheus@matrix.com');
  });
});
