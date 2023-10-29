import { RESTler, RESTlerOptions } from '../mod.ts';

type TestOptions = RESTlerOptions & {
  test: string;
};

type UserType = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  avatar: string;
};

class Test extends RESTler<TestOptions> {
  constructor() {
    super('test', {
      endpointURL: 'https://reqres.in/api',
      test: 'df',
      defaultHeaders: {
        'content-type': 'application/json',
      },
    });
  }

  async getUser(id: number): Promise<UserType> {
    const resp = await this._makeRequest<
      { data: UserType }
    >({
      endpoint: this._buildEndpoint('GET', `/users/${id}`),
    });
    console.log(resp.status);
    if (resp.body) {
      return resp.body.data;
    }
    throw new Error('No body');
  }
}

const a = new Test();
console.log(await a.getUser(2));
