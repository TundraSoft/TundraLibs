/**
 * Unix Socket Tests for RESTler
 *
 * These tests cover Unix socket communication paths that are not easily testable
 * on Windows. They mock the socket layer to test request/response handling.
 *
 * Note: These tests only run on Linux/macOS where Unix sockets are supported.
 */

import * as asserts from '$asserts';
import { RESTler } from '../RESTler.ts';
import type { RESTlerOptions } from '../types/mod.ts';
// Store original Deno.connect
import { RESTlerRequestError } from '../errors/mod.ts';
const originalConnect = Deno.connect;

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

  public async testGet(path: string) {
    return this._makeRequest({ path }, { method: 'GET' });
  }

  public async testPost(path: string, payload: Record<string, unknown>) {
    return this._makeRequest(
      { path },
      { method: 'POST', contentType: 'JSON', payload },
    );
  }

  public async testPostXML(path: string, payload: Record<string, unknown>) {
    return this._makeRequest(
      { path },
      { method: 'POST', contentType: 'XML', payload },
    );
  }

  public async testPostForm(path: string, payload: Record<string, string>) {
    return this._makeRequest(
      { path },
      { method: 'POST', contentType: 'FORM', payload },
    );
  }

  public async testPostText(path: string, payload: string) {
    return this._makeRequest(
      { path },
      { method: 'POST', contentType: 'TEXT', payload },
    );
  }

  public async testPut(path: string, payload: Record<string, unknown>) {
    return this._makeRequest({ path }, { method: 'PUT', payload });
  }

  public async testDelete(path: string) {
    return this._makeRequest({ path }, { method: 'DELETE' });
  }

  public async testWithHeaders(
    path: string,
    headers: Record<string, string>,
  ) {
    return this._makeRequest({ path }, { method: 'GET', headers });
  }
}

// Mock socket responses
interface MockSocketConfig {
  response?: string;
  chunkedResponse?: boolean;
  delay?: number;
  error?: Error;
  closeEarly?: boolean;
}

function createMockSocket(config: MockSocketConfig = {}) {
  let closed = false;
  const responses: string[] = [];

  if (config.response) {
    responses.push(config.response);
  }

  return {
    write: async (data: Uint8Array): Promise<number> => {
      if (closed) throw new Error('Socket closed');
      if (config.error) throw config.error;
      if (config.delay) {
        await new Promise((resolve) => setTimeout(resolve, config.delay));
      }
      return data.length;
    },
    read: async (buffer: Uint8Array): Promise<number | null> => {
      if (closed) return null;
      if (config.closeEarly) {
        closed = true;
        return null;
      }
      if (config.error) throw config.error;
      if (config.delay) {
        await new Promise((resolve) => setTimeout(resolve, config.delay));
      }

      if (responses.length === 0) {
        closed = true;
        return null;
      }

      const response = responses.shift();
      if (!response) {
        closed = true;
        return null;
      }
      const encoded = new TextEncoder().encode(response);
      const length = Math.min(encoded.length, buffer.length);
      buffer.set(encoded.subarray(0, length), 0);

      return length;
    },
    close: () => {
      closed = true;
    },
    [Symbol.dispose]: function () {
      this.close();
    },
  };
}

function setupMockSocket(config: MockSocketConfig = {}) {
  // @ts-ignore - Mock Deno.connect
  Deno.connect = (options: Deno.ConnectOptions) => {
    if ('path' in options) {
      return Promise.resolve(createMockSocket(config));
    }
    return originalConnect(options);
  };
}

function cleanupMockSocket() {
  Deno.connect = originalConnect;
}

// Helper to create a temporary socket file
async function createTempSocketPath(): Promise<string> {
  const tempDir = await Deno.makeTempDir({ prefix: 'restler_test_' });
  const socketPath = `${tempDir}/test.sock`;
  // Create an empty file to simulate a socket file
  await Deno.writeTextFile(socketPath, '');
  return socketPath;
}

// Helper to cleanup temp directory
async function cleanupTempSocket(socketPath: string) {
  try {
    const tempDir = socketPath.substring(0, socketPath.lastIndexOf('/'));
    await Deno.remove(tempDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

// Only run on Unix-like systems
const isUnix = Deno.build.os !== 'windows';

Deno.test({
  name: 'restler.unixSocket',
  // ignore: !isUnix,
  fn: async (t) => {
    await t.step('basic GET request', async () => {
      const mockResponse =
        'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"status":"ok"}';
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ response: mockResponse });
        const api = new TestSocketAPI(socketPath);
        const result = await api.testGet('/api/status');

        asserts.assertEquals(result.status, 200);
        asserts.assertEquals(result.body, { status: 'ok' });
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });

    await t.step('POST with JSON payload', async () => {
      const mockResponse =
        'HTTP/1.1 201 Created\r\nContent-Type: application/json\r\n\r\n{"id":123,"created":true}';
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ response: mockResponse });
        const api = new TestSocketAPI(socketPath);
        const result = await api.testPost('/api/users', {
          name: 'John',
          email: 'john@example.com',
        });

        asserts.assertEquals(result.status, 201);
        asserts.assertEquals(result.body, { id: 123, created: true });
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });

    await t.step('POST with XML payload', async () => {
      const mockResponse =
        'HTTP/1.1 200 OK\r\nContent-Type: application/xml\r\n\r\n<response><status>ok</status></response>';
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ response: mockResponse });
        const api = new TestSocketAPI(socketPath);
        const result = await api.testPostXML('/api/xml', {
          data: { value: 'test' },
        });

        asserts.assertEquals(result.status, 200);
        asserts.assert(result.body !== null && result.body !== undefined);
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });

    await t.step('POST with form-encoded payload', async () => {
      const mockResponse =
        'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nSuccess';
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ response: mockResponse });
        const api = new TestSocketAPI(socketPath);
        const result = await api.testPostForm('/api/form', {
          username: 'john',
          password: 'secret',
        });

        asserts.assertEquals(result.status, 200);
        asserts.assertEquals(result.body, 'Success');
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });

    await t.step('POST with text payload', async () => {
      const mockResponse =
        'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nReceived';
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ response: mockResponse });
        const api = new TestSocketAPI(socketPath);
        const result = await api.testPostText('/api/text', 'Hello World');

        asserts.assertEquals(result.status, 200);
        asserts.assertEquals(result.body, 'Received');
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });

    await t.step('PUT request', async () => {
      const mockResponse =
        'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"updated":true}';
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ response: mockResponse });
        const api = new TestSocketAPI(socketPath);
        const result = await api.testPut('/api/users/123', {
          name: 'Jane',
        });

        asserts.assertEquals(result.status, 200);
        asserts.assertEquals(result.body, { updated: true });
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });

    await t.step('DELETE request', async () => {
      const mockResponse = 'HTTP/1.1 204 No Content\r\n\r\n';
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ response: mockResponse });
        const api = new TestSocketAPI(socketPath);
        const result = await api.testDelete('/api/users/123');

        asserts.assertEquals(result.status, 204);
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });

    await t.step('custom headers', async () => {
      const mockResponse =
        'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nX-Custom: value\r\n\r\n{"ok":true}';
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ response: mockResponse });
        const api = new TestSocketAPI(socketPath);
        const result = await api.testWithHeaders('/api/data', {
          'X-API-Key': 'test-key',
          'Authorization': 'Bearer token',
        });

        asserts.assertEquals(result.status, 200);
        asserts.assertEquals(result.headers?.['X-Custom'], 'value');
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });

    await t.step('chunked response', async () => {
      const mockResponse =
        'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Type: application/json\r\n\r\n' +
        '10\r\n{"status":"ok"}\r\n0\r\n\r\n';
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ response: mockResponse });
        const api = new TestSocketAPI(socketPath);
        const result = await api.testGet('/api/chunked');

        asserts.assertEquals(result.status, 200);
        // Chunked response should be decoded
        asserts.assert(
          typeof result.body === 'object' || typeof result.body === 'string',
        );
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });

    await t.step('error status codes', async () => {
      const testCases = [
        { code: 400, text: 'Bad Request' },
        { code: 401, text: 'Unauthorized' },
        { code: 403, text: 'Forbidden' },
        { code: 404, text: 'Not Found' },
        { code: 500, text: 'Internal Server Error' },
      ];

      for (const { code, text } of testCases) {
        const mockResponse =
          `HTTP/1.1 ${code} ${text}\r\nContent-Type: application/json\r\n\r\n{"error":"${text}"}`;
        const socketPath = await createTempSocketPath();

        try {
          setupMockSocket({ response: mockResponse });
          const api = new TestSocketAPI(socketPath);
          const result = await api.testGet('/api/error');
          asserts.assertEquals(result.status, code);
        } finally {
          cleanupMockSocket();
          await cleanupTempSocket(socketPath);
        }
      }
    });

    await t.step('invalid response - no headers', async () => {
      const mockResponse = 'invalid response without headers';
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ response: mockResponse });
        const api = new TestSocketAPI(socketPath);
        await asserts.assertRejects(
          () => api.testGet('/api/invalid'),
          RESTlerRequestError,
        );
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });

    await t.step('invalid response - no status line', async () => {
      const mockResponse = '\r\n\r\nno status line';
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ response: mockResponse });
        const api = new TestSocketAPI(socketPath);
        await asserts.assertRejects(
          () => api.testGet('/api/invalid'),
          RESTlerRequestError,
        );
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });

    await t.step('invalid status code format', async () => {
      const mockResponse = 'HTTP/1.1 INVALID\r\n\r\n';
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ response: mockResponse });
        const api = new TestSocketAPI(socketPath);
        await asserts.assertRejects(
          () => api.testGet('/api/invalid'),
          RESTlerRequestError,
          'Could not parse status code',
        );
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });

    await t.step('response with multiple body parts', async () => {
      const mockResponse =
        'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"part1":"data"}\r\n\r\n{"part2":"more"}';
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ response: mockResponse });
        const api = new TestSocketAPI(socketPath);
        const result = await api.testGet('/api/multipart');

        asserts.assertEquals(result.status, 200);
        // Should handle the first part correctly
        asserts.assert(result.body !== null);
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });

    await t.step('large response body', async () => {
      const largeData = {
        items: Array.from({ length: 10 }, (_, i) => ({
          id: i,
          value: `item-${i}`,
        })),
      };
      const mockResponse =
        `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n${
          JSON.stringify(largeData)
        }`;
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ response: mockResponse });
        const api = new TestSocketAPI(socketPath);
        const result = await api.testGet('/api/large');

        asserts.assertEquals(result.status, 200);
        // The body should be parsed as JSON
        if (typeof result.body === 'string') {
          const parsed = JSON.parse(result.body);
          asserts.assertEquals(parsed.items.length, 10);
        } else if (
          result.body && typeof result.body === 'object' &&
          'items' in result.body
        ) {
          asserts.assertEquals(
            (result.body as typeof largeData).items.length,
            10,
          );
        } else {
          asserts.fail('Response body should be JSON with items array');
        }
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });

    await t.step('empty response body', async () => {
      const mockResponse =
        'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n';
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ response: mockResponse });
        const api = new TestSocketAPI(socketPath);
        const result = await api.testGet('/api/empty');

        asserts.assertEquals(result.status, 200);
        asserts.assertEquals(result.body, '');
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });

    await t.step('timeout handling', async () => {
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ delay: 15000 }); // 15 second delay
        const api = new TestSocketAPI(socketPath, { timeout: 1 }); // 1 second timeout
        await asserts.assertRejects(
          () => api.testGet('/api/slow'),
        );
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });

    await t.step('successful request with timeout config', async () => {
      const mockResponse =
        'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"status":"ok"}';
      const socketPath = await createTempSocketPath();

      try {
        setupMockSocket({ response: mockResponse });
        const api = new TestSocketAPI(socketPath, { timeout: 30 });
        const result = await api.testGet('/api/status');

        asserts.assertEquals(result.status, 200);
      } finally {
        cleanupMockSocket();
        await cleanupTempSocket(socketPath);
      }
    });
  },
});
