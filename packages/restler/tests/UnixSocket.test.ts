/**
 * Unix Socket Tests for RESTler
 *
 * These tests cover the Unix-socket request path. With the new architecture
 * the Unix-socket transport is handled by compat's `fetch` (via `init.unix`),
 * so these tests configure a `socketPath` and exercise request/response
 * handling by stubbing the instance's `_fetch` seam.
 *
 * Note: These tests only run on Linux/macOS where Unix sockets are supported.
 */

import { describe, it } from '@tundralibs/compat/test';
import { makeTempDir, remove, writeTextFile } from '@tundralibs/compat';
import * as asserts from '@std/asserts';
import { RESTler } from '../mod.ts';
import { RESTlerTimeoutError } from '../errors/mod.ts';
import type { RESTlerOptions } from '../types/mod.ts';

// Test implementation of RESTler
class TestSocketAPI extends RESTler {
  public readonly vendor = 'TestSocket';

  constructor(socketPath: string, options?: Partial<RESTlerOptions>) {
    super({
      baseURL: 'http://localhost',
      socketPath,
      ...options,
    });
  }

  // Override the `_fetch` seam so tests can substitute a stub without
  // reassigning the global `fetch` (which compat captures at import).
  public setFetch(fn: typeof fetch) {
    this._fetch = fn;
  }

  public async testGet(path: string) {
    return this._makeRequest({ path, method: 'GET' });
  }

  public async testPost(path: string, payload: Record<string, unknown>) {
    return this._makeRequest({
      path,
      method: 'POST',
      contentType: 'JSON',
      payload,
    });
  }

  public async testPostXML(path: string, payload: Record<string, unknown>) {
    return this._makeRequest({
      path,
      method: 'POST',
      contentType: 'XML',
      payload,
    });
  }

  public async testPostForm(path: string, payload: FormData) {
    return this._makeRequest({
      path,
      method: 'POST',
      contentType: 'FORM',
      payload,
    });
  }

  public async testPostText(path: string, payload: string) {
    return this._makeRequest({
      path,
      method: 'POST',
      contentType: 'TEXT',
      payload,
    });
  }

  public async testPut(path: string, payload: Record<string, unknown>) {
    return this._makeRequest({
      path,
      method: 'PUT',
      contentType: 'JSON',
      payload,
    });
  }

  public async testDelete(path: string) {
    return this._makeRequest({ path, method: 'DELETE' });
  }

  public async testWithHeaders(
    path: string,
    headers: Record<string, string>,
  ) {
    return this._makeRequest({ path, method: 'GET', headers });
  }
}

// Build a stub `fetch` that always returns the given response.
function mockFetch(
  body: string,
  status = 200,
  headers: Record<string, string> = {},
): typeof fetch {
  // 204/205/304 are null-body statuses — `new Response('', {status})` throws.
  const nullBody = status === 204 || status === 205 || status === 304;
  return (_input: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(new Response(nullBody ? null : body, { status, headers }));
}

// Helper to create a temporary socket file
async function createTempSocketPath(): Promise<string> {
  const tempDir = await makeTempDir({ prefix: 'restler_test_' });
  const socketPath = `${tempDir}/test.sock`;
  // Create an empty file to simulate a socket file
  await writeTextFile(socketPath, '');
  return socketPath;
}

// Helper to cleanup temp directory
async function cleanupTempSocket(socketPath: string) {
  try {
    const tempDir = socketPath.substring(0, socketPath.lastIndexOf('/'));
    await remove(tempDir);
  } catch {
    // Ignore cleanup errors
  }
}

describe('restler.unixSocket', () => {
  it('basic GET request', async () => {
    const socketPath = await createTempSocketPath();

    try {
      const api = new TestSocketAPI(socketPath);
      api.setFetch(
        mockFetch('{"status":"ok"}', 200, {
          'Content-Type': 'application/json',
        }),
      );
      const result = await api.testGet('/api/status');

      asserts.assertEquals(result.status, 200);
      asserts.assertEquals(result.body, { status: 'ok' });
    } finally {
      await cleanupTempSocket(socketPath);
    }
  });

  it('POST with JSON payload', async () => {
    const socketPath = await createTempSocketPath();

    try {
      const api = new TestSocketAPI(socketPath);
      // Capture what is actually SENT so we can assert on the request side.
      let captured:
        | {
          input: string | URL | Request;
          init?: RequestInit & { unix?: string };
        }
        | undefined;
      api.setFetch((input, init) => {
        captured = { input, init };
        return Promise.resolve(
          new Response('{"id":123,"created":true}', {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      });
      const payload = { name: 'John', email: 'john@example.com' };
      const result = await api.testPost('/api/users', payload);

      asserts.assertEquals(result.status, 201);
      asserts.assertEquals(result.body, { id: 123, created: true });

      // Request side: Unix transport path, method, JSON content-type, and
      // the body serialized exactly as `JSON.stringify(payload)`.
      asserts.assert(captured !== undefined);
      asserts.assertEquals(captured!.init?.unix, socketPath);
      asserts.assertEquals(captured!.init?.method, 'POST');
      const sentHeaders = new Headers(captured!.init?.headers as HeadersInit);
      asserts.assertEquals(
        sentHeaders.get('Content-Type'),
        'application/json',
      );
      asserts.assertEquals(captured!.init?.body, JSON.stringify(payload));
    } finally {
      await cleanupTempSocket(socketPath);
    }
  });

  it('POST with XML payload', async () => {
    const socketPath = await createTempSocketPath();

    try {
      const api = new TestSocketAPI(socketPath);
      api.setFetch(
        mockFetch(
          '<response><status>ok</status></response>',
          200,
          { 'Content-Type': 'application/xml' },
        ),
      );
      const result = await api.testPostXML('/api/xml', {
        data: { value: 'test' },
      });

      asserts.assertEquals(result.status, 200);
      // XML body should be parsed into a structured object.
      asserts.assertEquals(result.body, { response: { status: 'ok' } });
    } finally {
      await cleanupTempSocket(socketPath);
    }
  });

  it('POST with form-encoded payload', async () => {
    const socketPath = await createTempSocketPath();

    try {
      const api = new TestSocketAPI(socketPath);
      api.setFetch(
        mockFetch('Success', 200, { 'Content-Type': 'text/plain' }),
      );
      const form = new FormData();
      form.append('username', 'john');
      form.append('password', 'secret');
      const result = await api.testPostForm('/api/form', form);

      asserts.assertEquals(result.status, 200);
      asserts.assertEquals(result.body, 'Success');
    } finally {
      await cleanupTempSocket(socketPath);
    }
  });

  it('POST with text payload', async () => {
    const socketPath = await createTempSocketPath();

    try {
      const api = new TestSocketAPI(socketPath);
      api.setFetch(
        mockFetch('Received', 200, { 'Content-Type': 'text/plain' }),
      );
      const result = await api.testPostText('/api/text', 'Hello World');

      asserts.assertEquals(result.status, 200);
      asserts.assertEquals(result.body, 'Received');
    } finally {
      await cleanupTempSocket(socketPath);
    }
  });

  it('PUT request', async () => {
    const socketPath = await createTempSocketPath();

    try {
      const api = new TestSocketAPI(socketPath);
      api.setFetch(
        mockFetch('{"updated":true}', 200, {
          'Content-Type': 'application/json',
        }),
      );
      const result = await api.testPut('/api/users/123', {
        name: 'Jane',
      });

      asserts.assertEquals(result.status, 200);
      asserts.assertEquals(result.body, { updated: true });
    } finally {
      await cleanupTempSocket(socketPath);
    }
  });

  it('DELETE request', async () => {
    const socketPath = await createTempSocketPath();

    try {
      const api = new TestSocketAPI(socketPath);
      api.setFetch(mockFetch('', 204));
      const result = await api.testDelete('/api/users/123');

      asserts.assertEquals(result.status, 204);
    } finally {
      await cleanupTempSocket(socketPath);
    }
  });

  it('custom headers', async () => {
    const socketPath = await createTempSocketPath();

    try {
      const api = new TestSocketAPI(socketPath);
      // Capture what is actually SENT so we can assert on the request side.
      let captured:
        | {
          input: string | URL | Request;
          init?: RequestInit & { unix?: string };
        }
        | undefined;
      api.setFetch((input, init) => {
        captured = { input, init };
        return Promise.resolve(
          new Response('{"ok":true}', {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'X-Custom': 'value',
            },
          }),
        );
      });
      const result = await api.testWithHeaders('/api/data', {
        'X-API-Key': 'test-key',
        'Authorization': 'Bearer token',
      });

      asserts.assertEquals(result.status, 200);
      asserts.assertEquals(result.headers?.['x-custom'], 'value');

      // Request side: the Unix transport path, the method, and the custom
      // headers must all be present in what was handed to `_fetch`. RESTler
      // passes headers as a plain Record<string,string> (never a Headers
      // instance), so normalize via `new Headers` and read with `.get()`.
      asserts.assert(captured !== undefined);
      asserts.assertEquals(captured!.init?.unix, socketPath);
      asserts.assertEquals(captured!.init?.method, 'GET');
      const sentHeaders = new Headers(captured!.init?.headers as HeadersInit);
      asserts.assertEquals(sentHeaders.get('X-API-Key'), 'test-key');
      asserts.assertEquals(sentHeaders.get('Authorization'), 'Bearer token');
    } finally {
      await cleanupTempSocket(socketPath);
    }
  });

  it('error status codes', async () => {
    const testCases = [
      { code: 400, text: 'Bad Request' },
      { code: 401, text: 'Unauthorized' },
      { code: 403, text: 'Forbidden' },
      { code: 404, text: 'Not Found' },
      { code: 500, text: 'Internal Server Error' },
    ];

    for (const { code, text } of testCases) {
      const socketPath = await createTempSocketPath();

      try {
        const api = new TestSocketAPI(socketPath);
        api.setFetch(
          mockFetch(`{"error":"${text}"}`, code, {
            'Content-Type': 'application/json',
          }),
        );
        const result = await api.testGet('/api/error');
        asserts.assertEquals(result.status, code);
      } finally {
        await cleanupTempSocket(socketPath);
      }
    }
  });

  it('large response body', async () => {
    const largeData = {
      items: Array.from({ length: 10 }, (_, i) => ({
        id: i,
        value: `item-${i}`,
      })),
    };
    const socketPath = await createTempSocketPath();

    try {
      const api = new TestSocketAPI(socketPath);
      api.setFetch(
        mockFetch(JSON.stringify(largeData), 200, {
          'Content-Type': 'application/json',
        }),
      );
      const result = await api.testGet('/api/large');

      asserts.assertEquals(result.status, 200);
      // The JSON body is parsed into an object — assert the parsed shape.
      asserts.assertEquals(
        (result.body as { items: unknown[] }).items.length,
        10,
      );
    } finally {
      await cleanupTempSocket(socketPath);
    }
  });

  it('empty response body', async () => {
    const socketPath = await createTempSocketPath();

    try {
      const api = new TestSocketAPI(socketPath);
      api.setFetch(
        mockFetch('', 200, { 'Content-Type': 'application/json' }),
      );
      const result = await api.testGet('/api/empty');

      asserts.assertEquals(result.status, 200);
      asserts.assertEquals(result.body, undefined);
    } finally {
      await cleanupTempSocket(socketPath);
    }
  });

  it('timeout handling', async () => {
    const socketPath = await createTempSocketPath();

    try {
      const api = new TestSocketAPI(socketPath, { timeout: 1 });
      // Reject with a real timeout error — exactly what the request's
      // timeout abort produces — so the test exercises RESTler's error
      // classification. `_makeRequest` throws on timeout, so
      // `assertRejects` with the concrete error type is correct.
      api.setFetch(() =>
        Promise.reject(new DOMException('Timed out', 'TimeoutError'))
      );
      await asserts.assertRejects(
        () => api.testGet('/api/slow'),
        RESTlerTimeoutError,
      );
    } finally {
      await cleanupTempSocket(socketPath);
    }
  });

  it('successful request with timeout config', async () => {
    const socketPath = await createTempSocketPath();

    try {
      const api = new TestSocketAPI(socketPath, { timeout: 30 });
      api.setFetch(
        mockFetch('{"status":"ok"}', 200, {
          'Content-Type': 'application/json',
        }),
      );
      const result = await api.testGet('/api/status');

      asserts.assertEquals(result.status, 200);
    } finally {
      await cleanupTempSocket(socketPath);
    }
  });
});
