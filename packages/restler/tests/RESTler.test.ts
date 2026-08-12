import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { makeTempFile, removeSync } from '@tundralibs/compat';
import { RESTler } from '../mod.ts';
import {
  RESTlerConfigError,
  RESTlerRequestError,
  RESTlerTimeoutError,
} from '../errors/mod.ts';
import type {
  ResponseBody,
  RESTlerEndpoint,
  RESTlerOptions,
  RESTlerResponseHandler,
} from '../types/mod.ts';

// Test implementation of RESTler
class TestRESTler extends RESTler {
  public readonly vendor = 'TestRESTler';

  constructor(options: RESTlerOptions) {
    super(options);
  }

  // Allow tests to substitute the `fetch` seam without reassigning the
  // global `fetch` (compat captures the global at import time).
  public setFetch(fn: typeof fetch) {
    this._fetch = fn;
  }

  // Make protected methods public for testing
  public makeRequest<T extends ResponseBody>(
    endpoint: RESTlerEndpoint,
    responseHandler?: RESTlerResponseHandler,
  ) {
    return this._makeRequest<T>(endpoint, responseHandler);
  }

  public async processEndpoint(
    endpoint: RESTlerEndpoint,
  ) {
    return await this._processEndpoint(endpoint);
  }

  public replaceVersion(param: string, version?: string) {
    return this._replaceVersion(param, version);
  }

  // Make _validateX methods public for testing
  public validateBaseURL(value: unknown) {
    return this._validateBaseURL(value);
  }

  public validatePort(value: unknown) {
    return this._validatePort(value);
  }

  public validateVersion(value: unknown) {
    return this._validateVersion(value);
  }

  public validateTimeout(value: unknown) {
    return this._validateTimeout(value);
  }

  public validateContentType(value: unknown) {
    return this._validateContentType(value);
  }

  public validateHeaders(value: unknown) {
    return this._validateHeaders(value);
  }

  public validateSocketPath(value: unknown) {
    return this._validateSocketPath(value);
  }

  public validateTls(value: unknown) {
    return this._validateTls(value);
  }

  public getAuthStatusCodes() {
    return this._authStatus;
  }

  public getRateLimitStatusCodes() {
    return this._rateLimitStatus;
  }

  public parseResponseBody<B extends ResponseBody>(
    body: string,
    contentType: string | null | undefined,
  ): B {
    return this._parseResponseBody<B>(body, contentType);
  }

  public extractHeaderNumber(
    headers: Record<string, string> | undefined,
    ...headerNames: string[]
  ): number | undefined {
    return this._extractHeaderNumber(headers, ...headerNames);
  }

  // Expose the resolved (post-_processOption) option value for assertions.
  public readOption<K extends keyof RESTlerOptions>(key: K) {
    return this._getOption(key);
  }
}

// Mock async authentication injector for testing
class AsyncAuthTestRESTler extends TestRESTler {
  public authCalled = false;

  protected override async _authInjector(
    request: RESTlerEndpoint,
  ): Promise<void> {
    // Simulate async auth operation
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.authCalled = true;
    request.auth = { type: 'BEARER', token: 'async-auth-token' };
    // Delegate to the base injector so the resolved auth becomes the
    // Authorization header on the outgoing request.
    super._authInjector(request);
  }
}

describe('restler.core', () => {
  describe('constructor option validation', () => {
    it('should create an instance with valid options', () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });
      asserts.assert(client instanceof RESTler);
    });

    it('should throw for an empty baseURL', () => {
      asserts.assertThrows(
        () => new TestRESTler({ baseURL: '' }),
        RESTlerConfigError,
        'Base URL must be a valid URL.',
      );
    });

    it('should throw for an unsupported baseURL protocol', () => {
      asserts.assertThrows(
        () => new TestRESTler({ baseURL: 'sftp://api.test.org' }),
        RESTlerConfigError,
        'Base URL must be a valid URL.',
      );
    });

    it('should throw for invalid port', () => {
      asserts.assertThrows(
        () =>
          new TestRESTler({
            baseURL: 'https://api.example.com',
            port: 70000,
          }),
        RESTlerConfigError,
        'Port must be a number between 1 and 65535.',
      );
    });

    it('should throw for invalid timeout', () => {
      asserts.assertThrows(
        () =>
          new TestRESTler({
            baseURL: 'https://api.example.com',
            timeout: 130,
          }),
        RESTlerConfigError,
        'Timeout must be a number between 1 and 120.',
      );
    });

    it('should throw for invalid contentType', () => {
      asserts.assertThrows(
        () =>
          new TestRESTler({
            baseURL: 'https://api.example.com',
            // deno-lint-ignore no-explicit-any
            contentType: 'INVALID' as any,
          }),
        RESTlerConfigError,
        'Content type must be one of',
      );
    });

    it('should throw for invalid headers', () => {
      asserts.assertThrows(
        () =>
          new TestRESTler({
            baseURL: 'https://api.example.com',
            // deno-lint-ignore no-explicit-any
            headers: 'df' as any,
          }),
        RESTlerConfigError,
        'Headers must be an object.',
      );
    });

    it('should throw for invalid socketpath', () => {
      asserts.assertThrows(
        () =>
          new TestRESTler({
            baseURL: 'https://api.example.com',
            // deno-lint-ignore no-explicit-any
            socketPath: '/no/file/here',
          }),
        RESTlerConfigError,
        'Socket path must be a string and point to a valid file.',
      );
    });

    it('should throw for a non-object TLS config', () => {
      asserts.assertThrows(
        () =>
          new TestRESTler({
            baseURL: 'https://api.example.com',
            // deno-lint-ignore no-explicit-any
            tls: 123 as any,
          }),
        RESTlerConfigError,
        'TLS must use',
      );
    });

    it('should throw when TLS mixes inline PEM with file paths', () => {
      asserts.assertThrows(
        () =>
          new TestRESTler({
            baseURL: 'https://api.example.com',
            // deno-lint-ignore no-explicit-any
            tls: {
              // Mixing inline PEM with file paths is rejected by validateTLS.
              cert: 'CERTDATA',
              certFile: '/tmp/does-not-matter.pem',
            } as any,
          }),
        RESTlerConfigError,
        'TLS must use',
      );
    });

    it('should throw for invalid version', () => {
      asserts.assertThrows(
        () =>
          new TestRESTler({
            baseURL: 'https://api.example.com',
            // deno-lint-ignore no-explicit-any
            version: {} as any,
          }),
        RESTlerConfigError,
        'Version must be a string.',
      );
    });
  });

  describe('input validation methods', () => {
    const client = new TestRESTler({
      baseURL: 'https://api.example.com',
    });

    it('validateBaseURL', () => {
      asserts.assert(client.validateBaseURL('https://api.example.com'));
      asserts.assert(client.validateBaseURL('http://localhost:8080'));
      asserts.assert(!client.validateBaseURL(''));
      asserts.assert(!client.validateBaseURL(123));
      asserts.assert(!client.validateBaseURL(null));
    });

    it('validatePort', () => {
      asserts.assertEquals(client.validatePort(80), true);
      asserts.assertEquals(client.validatePort(8080), true);
      asserts.assertEquals(client.validatePort(1), true);
      asserts.assertEquals(client.validatePort(65535), true);
      asserts.assertEquals(client.validatePort(0), false);
      asserts.assertEquals(client.validatePort(65536), false);
      asserts.assertEquals(client.validatePort('80'), false);
      asserts.assertEquals(client.validatePort(undefined), true);
    });

    it('validateTimeout', () => {
      asserts.assertEquals(client.validateTimeout(1), true);
      asserts.assertEquals(client.validateTimeout(30), true);
      asserts.assertEquals(client.validateTimeout(60), true);
      asserts.assertEquals(client.validateTimeout(0), false);
      asserts.assertEquals(client.validateTimeout(121), false);
      asserts.assertEquals(client.validateTimeout('10'), false);
      asserts.assertEquals(client.validateTimeout(undefined), true);
    });

    it('validateContentType', () => {
      asserts.assertEquals(client.validateContentType('JSON'), true);
      asserts.assertEquals(client.validateContentType('XML'), true);
      asserts.assertEquals(client.validateContentType('FORM'), true);
      asserts.assertEquals(client.validateContentType('TEXT'), true);
      asserts.assertEquals(client.validateContentType('BLOB'), true);
      asserts.assertEquals(client.validateContentType('INVALID'), false);
      asserts.assertEquals(client.validateContentType(123), false);
    });

    it('validateHeaders', () => {
      asserts.assert(client.validateHeaders({}));
      asserts.assert(
        client.validateHeaders({ 'Content-Type': 'application/json' }),
      );
      asserts.assert(!client.validateHeaders('invalid'));
      asserts.assert(!client.validateHeaders(123));
    });
  });

  describe('baseURL override', () => {
    const client = new TestRESTler({
      baseURL: 'https://api.example.com',
      version: '1',
    });
    it('should override baseURL in endpoint', async () => {
      const result = await client.processEndpoint({
        baseURL: 'https://api2.example.com',
        path: '/users',
        method: 'GET',
      });
      asserts.assertEquals(result.url, 'https://api2.example.com/users');
    });

    it('should throw on invalid url', async () => {
      await asserts.assertRejects(
        () =>
          client.processEndpoint({
            baseURL: 'sftp://api2.example.com',
            path: '/users',
            method: 'GET',
          }),
        Error,
        'Invalid endpoint baseURL',
      );
    });
  });

  describe('version replacement', () => {
    const client = new TestRESTler({
      baseURL: 'https://api.example.com/v{version}',
      version: '2',
    });

    it('should replace {version} in strings', () => {
      const result = client.replaceVersion('path/to/{version}/resource', '1');
      asserts.assertEquals(result, 'path/to/1/resource');
    });

    it('should handle empty version', () => {
      const result = client.replaceVersion('path/to/{version}/resource');
      asserts.assertEquals(result, 'path/to//resource');
    });

    it('should handle strings without {version}', () => {
      const result = client.replaceVersion('path/to/resource', '1');
      asserts.assertEquals(result, 'path/to/resource');
    });

    it('should handle multiple {version} occurrences', () => {
      const result = client.replaceVersion('v{version}/path/{version}', '2');
      asserts.assertEquals(result, 'v2/path/2');
    });
  });

  describe('processEndpoint', () => {
    const client = new TestRESTler({
      baseURL: 'https://api.example.com/v{version}',
      version: '2',
      headers: {
        'X-API-Key': 'default-key',
      },
    });

    it('should process basic endpoint', async () => {
      const request = await client.processEndpoint(
        { path: '/users', method: 'GET' },
      );
      asserts.assertEquals(request.url, 'https://api.example.com/v2/users');
      asserts.assertEquals(request.method, 'GET');
      asserts.assertEquals(request.headers!['X-API-Key'], 'default-key');
    });

    it('should handle query parameters', async () => {
      const request = await client.processEndpoint(
        {
          path: '/users',
          method: 'GET',
          query: {
            page: '1',
            limit: '10',
            apiVersion: '{version}',
          },
        },
      );

      asserts.assert(request.url.includes('page=1'));
      asserts.assert(request.url.includes('limit=10'));
      asserts.assert(request.url.includes('apiVersion=2'));
    });

    it('should handle bearer token auth', async () => {
      const request = await client.processEndpoint(
        {
          path: '/users',
          method: 'GET',
          auth: { type: 'BEARER', token: 'token123', prefix: 'Bearer' },
        },
      );

      asserts.assertEquals(
        request.headers!['Authorization'],
        'Bearer token123',
      );
    });

    it('should handle basic auth', async () => {
      const request = await client.processEndpoint(
        {
          path: '/users',
          method: 'GET',
          auth: {
            type: 'BASIC',
            username: 'user',
            password: 'pass',
          },
        },
      );

      asserts.assert(request.headers!['Authorization']!.startsWith('Basic '));
      // Base64 encoded user:pass
      asserts.assertEquals(
        request.headers!['Authorization'],
        'Basic dXNlcjpwYXNz',
      );
      await asserts.assertRejects(
        () =>
          client.processEndpoint({
            path: '/users',
            method: 'GET',
            auth: {
              type: 'BASIC',
              username: 'user',
            },
          } as RESTlerEndpoint),
        Error,
        'Invalid auth configuration for endpoint',
      );

      await asserts.assertRejects(
        () =>
          client.processEndpoint({
            path: '/users',
            method: 'GET',
            auth: {
              type: 'BASIC',
              password: 'pass',
            },
          } as RESTlerEndpoint),
        Error,
        'Invalid auth configuration for endpoint',
      );
    });

    it('should handle request-specific headers', async () => {
      const request = await client.processEndpoint(
        {
          path: '/users',
          method: 'GET',
          headers: {
            'X-Custom': 'value',
            'X-Version': 'v{version}',
          },
        },
      );
      if (!request.headers) {
        asserts.fail('Headers should not be undefined');
      }
      asserts.assertEquals(request.headers!['X-Custom'], 'value');
      asserts.assertEquals(request.headers!['X-Version'], 'v2');
      asserts.assertEquals(request.headers!['X-API-Key'], 'default-key');
    });

    it('should handle custom port', async () => {
      const request = await client.processEndpoint(
        {
          path: '/users',
          method: 'GET',
          port: 8080,
        },
      );

      asserts.assert(request.url.includes(':8080/'));
      await asserts.assertRejects(
        () =>
          client.processEndpoint(
            {
              path: '/users',
              method: 'GET',
              port: 70000,
            },
          ),
        Error,
        'Invalid port',
      );
      await asserts.assertRejects(
        () =>
          client.processEndpoint(
            {
              path: '/users',
              method: 'GET',
              port: 341n,
            } as unknown as RESTlerEndpoint,
          ),
        Error,
        'Invalid port',
      );
      await asserts.assertRejects(
        () =>
          client.processEndpoint(
            {
              path: '/users',
              method: 'GET',
              port: 'df',
            } as unknown as RESTlerEndpoint,
          ),
        Error,
        'Invalid port',
      );
    });

    it('should override baseURL', async () => {
      const req = await client.processEndpoint({
        baseURL: 'https://api.example.com',
        path: '/users',
        method: 'GET',
      });
      asserts.assertEquals(req.url, 'https://api.example.com/users');
    });
  });

  describe('HTTP request methods', () => {
    it('should make a GET request', async () => {
      // Setup event tracking
      const emittedEvents: Array<
        { vendor: string; request: unknown; response: unknown }
      > = [];

      class EventTrackingRESTler extends TestRESTler {
        constructor(options: RESTlerOptions) {
          super(options);

          // Track events
          this.on('call', (vendor, request, response) => {
            emittedEvents.push({ vendor, request, response });
          });
        }
      }

      const client = new EventTrackingRESTler({
        baseURL: 'https://api.example.com',
      });

      // Mock fetch response via the instance seam
      client.setFetch(async () => {
        await 1;
        return new Response(
          JSON.stringify({ id: 1, name: 'Test User' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      });

      const response = await client.makeRequest<{ id: number; name: string }>(
        { path: '/users/1', method: 'GET' },
      );

      asserts.assertEquals(response.status, 200);
      asserts.assert(response.body);
      asserts.assertEquals(response.body.id, 1);
      asserts.assertEquals(response.body.name, 'Test User');
      asserts.assert(response.timeTaken > 0);

      // Check event was emitted
      asserts.assertEquals(emittedEvents.length, 1);
      asserts.assertEquals(emittedEvents[0]!.vendor, 'TestRESTler');
    });

    it('should make a POST request with JSON body', async () => {
      const requestData = {
        method: '',
        headers: {} as Record<
          string,
          string
        >,
        body: '',
      };

      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      // Configure mock response via the instance seam
      client.setFetch(async (_input, init) => {
        await 1;
        // Store request data for assertions. RESTler passes headers as a
        // plain record, so normalise through `Headers` to read them by name.
        requestData.method = init?.method || '';
        requestData.headers = Object.fromEntries(
          new Headers(init?.headers as HeadersInit | undefined).entries(),
        );
        requestData.body = init?.body as string;

        return new Response(
          JSON.stringify({ id: 2, name: 'New User' }),
          {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      });

      const userData = { name: 'New User', email: 'user@example.com' };
      const response = await client.makeRequest<{ id: number; name: string }>(
        {
          path: '/users',
          method: 'POST',
          contentType: 'JSON',
          payload: userData,
        },
      );

      asserts.assertEquals(response.status, 201);
      asserts.assertEquals(response.body?.id, 2);
      asserts.assertEquals(response.body?.name, 'New User');

      // Verify request details
      asserts.assertEquals(requestData.method, 'POST');
      asserts.assertEquals(requestData.body, JSON.stringify(userData));
      asserts.assertEquals(
        requestData.headers['content-type'],
        'application/json',
      );
    });

    it('should handle network errors', async () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      client.setFetch(async () => {
        await 1;
        throw new Error('Network error');
      });

      await asserts.assertRejects(
        async () =>
          await client.makeRequest(
            { path: '/users', method: 'GET' },
          ),
        RESTlerRequestError,
        'Unknown error processing the request',
      );
    });

    it('should handle timeout errors', async () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      client.setFetch(async () => {
        await 1;
        const error = new Error('Timeout');
        error.name = 'AbortError';
        throw error;
      });

      await asserts.assertRejects(
        async () =>
          await client.makeRequest(
            { path: '/users', method: 'GET' },
          ),
        RESTlerTimeoutError,
      );
    });

    it('should handle non-JSON responses', async () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      client.setFetch(async () => {
        await 1;
        return new Response(
          'Plain text response',
          {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          },
        );
      });

      const response = await client.makeRequest(
        { path: '/text', method: 'GET' },
      );

      asserts.assertEquals(response.status, 200);
      asserts.assertEquals(response.body, 'Plain text response');
    });

    it('should handle XML responses', async () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      client.setFetch(async () => {
        await 1;
        return new Response(
          '<response><status>success</status><data id="1">Test</data></response>',
          {
            status: 200,
            headers: { 'Content-Type': 'application/xml' },
          },
        );
      });

      const response = await client.makeRequest(
        { path: '/xml', method: 'GET' },
      );

      asserts.assert(response.body);
      asserts.assert(typeof response.body === 'object');
      // deno-lint-ignore no-explicit-any
      asserts.assertEquals((response.body as any).response.status, 'success');
    });

    it('should emit authFailure event ', async () => {
      // Set up event tracking
      let authFailureEmitted = false;
      let emittedRequest = null;
      let emittedResponse = null;

      class AuthEventTestRESTler extends TestRESTler {
        constructor(options: RESTlerOptions) {
          super(options);

          // Track authFailure event
          this.on('authFailure', (_vendor, request, response) => {
            authFailureEmitted = true;
            emittedRequest = request;
            emittedResponse = response;
          });
        }
      }

      // Get auth status codes from the class
      const testClient = new AuthEventTestRESTler({
        baseURL: 'https://api.example.com',
      });

      const authStatusCodes = testClient.getAuthStatusCodes();

      // Make sure we have at least one auth status code to test
      asserts.assert(authStatusCodes.length > 0);

      // Mock fetch to return an auth error (using the first status in _authStatus)
      testClient.setFetch(async () => {
        await 1;
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          {
            status: authStatusCodes[0],
            headers: { 'Content-Type': 'application/json' },
          },
        );
      });

      // Make the request
      await testClient.makeRequest(
        { path: '/secure-resource', method: 'GET' },
      ).catch(() => {}); // We expect this might throw, but we only care about the event

      // Verify the event was emitted
      asserts.assertEquals(authFailureEmitted, true);
      asserts.assertNotEquals(emittedRequest, null);
      asserts.assertNotEquals(emittedResponse, null);

      // Verify the response has the expected status code
      asserts.assertEquals(emittedResponse!.status, authStatusCodes[0]);
    });

    it('should emit rateLimit event', async () => {
      // Set up event tracking
      let rateLimitEmitted = false;
      let emittedVendor = '';
      let emittedLimit: number | undefined;
      let emittedReset: number | undefined;
      let emittedRemaining: number | undefined;

      class RateLimitEventTestRESTler extends TestRESTler {
        constructor(options: RESTlerOptions) {
          super(options);

          // Track rateLimit event
          this.on('rateLimit', (vendor, limit, reset, remaining) => {
            rateLimitEmitted = true;
            emittedVendor = vendor;
            emittedLimit = limit;
            emittedReset = reset;
            emittedRemaining = remaining;
          });
        }
      }

      // Create a test client
      const testClient = new RateLimitEventTestRESTler({
        baseURL: 'https://api.example.com',
      });

      const rateLimitStatusCodes = testClient.getRateLimitStatusCodes();

      // Make sure we have at least one rate limit status code to test
      asserts.assert(rateLimitStatusCodes.length > 0);

      // Mock fetch to return a rate limit error with rate limit headers
      testClient.setFetch(async () => {
        await 1;
        const headers = new Headers({
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': '100',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': '1618884400',
        });

        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded' }),
          {
            status: rateLimitStatusCodes[0],
            headers: headers,
          },
        );
      });

      // Make the request
      await testClient.makeRequest(
        { path: '/api-with-rate-limits', method: 'GET' },
      ).catch(() => {}); // We expect this might throw, but we only care about the event

      // Verify the event was emitted
      asserts.assertEquals(rateLimitEmitted, true);
      asserts.assertEquals(emittedVendor, 'TestRESTler');

      // Verify the rate limit values were correctly extracted
      asserts.assertEquals(emittedLimit, 100);
      asserts.assertEquals(emittedReset, 1618884400);
      asserts.assertEquals(emittedRemaining, 0);
    });

    it('should capture alternate rate limit headers', async () => {
      // Set up event tracking
      let rateLimitEmitted = false;
      let emittedLimit: number | undefined;

      class RateLimitHeaderTestRESTler extends TestRESTler {
        constructor(options: RESTlerOptions) {
          super(options);

          // Track rateLimit event
          this.on('rateLimit', (vendor, limit) => {
            rateLimitEmitted = true;
            emittedLimit = limit;
          });
        }
      }

      // Create a test client
      const testClient = new RateLimitHeaderTestRESTler({
        baseURL: 'https://api.example.com',
      });

      const rateLimitStatusCodes = testClient.getRateLimitStatusCodes();

      // Test with alternative header format (no X- prefix)
      testClient.setFetch(async () => {
        await 1;
        const headers = new Headers({
          'Content-Type': 'application/json',
          'RateLimit-Limit': '200', // Different format and value
        });

        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded' }),
          {
            status: rateLimitStatusCodes[0],
            headers: headers,
          },
        );
      });

      // Reset tracking variables
      rateLimitEmitted = false;
      emittedLimit = undefined;

      // Make the request
      await testClient.makeRequest(
        { path: '/api-with-rate-limits', method: 'GET' },
      ).catch(() => {});

      // Verify the event was emitted with the correct value
      asserts.assertEquals(rateLimitEmitted, true);
      asserts.assertEquals(emittedLimit, 200);
    });
  });

  describe('authentication', () => {
    it('should add authentication via _authInjector', async () => {
      const requestData = {
        headers: {} as Record<string, string>,
      };

      class AuthTestRESTler extends TestRESTler {
        protected override _authInjector(
          request: RESTlerEndpoint,
        ): void {
          // Overriding the injector takes ownership of setting the header.
          request.headers = {
            ...request.headers,
            Authorization: 'BEARER auth-token-123',
          };
        }
      }

      const client = new AuthTestRESTler({
        baseURL: 'https://api.example.com',
      });

      client.setFetch((_input, init) => {
        // RESTler passes headers as a plain record, not a Headers instance.
        requestData.headers = (init?.headers ?? {}) as Record<string, string>;
        return Promise.resolve(
          new Response(JSON.stringify({ authenticated: true }), {
            status: 200,
          }),
        );
      });

      await client.makeRequest(
        { path: '/secure', method: 'GET' },
      );

      asserts.assertEquals(
        requestData.headers['Authorization'],
        'BEARER auth-token-123',
      );
    });
  });

  describe('additional validation methods', () => {
    const client = new TestRESTler({
      baseURL: 'https://api.example.com',
    });

    it('validateSocketPath', async () => {
      // Create a temp file for testing socket path
      const tempFilePath = await makeTempFile();
      try {
        asserts.assert(client.validateSocketPath(tempFilePath));
        asserts.assert(client.validateSocketPath(undefined));
        asserts.assert(client.validateSocketPath(null));
        asserts.assert(!client.validateSocketPath('/nonexistent/path'));
        asserts.assert(!client.validateSocketPath(123));
        asserts.assert(!client.validateSocketPath({}));
      } finally {
        // Clean up
        try {
          removeSync(tempFilePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it('validateTls', async () => {
      // Create temp files for certificate and key
      const certPath = await makeTempFile();
      const keyPath = await makeTempFile();
      try {
        // Test object with cert and key file paths
        asserts.assert(client.validateTls({
          certFile: certPath,
          keyFile: keyPath,
        }));

        // Test invalid values
        asserts.assert(!client.validateTls(123));
      } finally {
        // Clean up
        try {
          removeSync(certPath);
          removeSync(keyPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  });

  describe('response parsing', () => {
    const client = new TestRESTler({
      baseURL: 'https://api.example.com',
    });

    it('should parse JSON responses correctly', () => {
      const jsonBody = '{"id":1,"name":"Test"}';
      const result = client.parseResponseBody<{ id: number; name: string }>(
        jsonBody,
        'application/json',
      );
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'Test');
    });

    it('should parse XML responses correctly', () => {
      const xmlBody = '<root><item id="1">Test</item></root>';
      const result = client.parseResponseBody<
        { root: { item: { '@id': string; '#text': string } } }
      >(
        xmlBody,
        'application/xml',
      );
      asserts.assert(result.root);
      asserts.assertEquals(result.root.item['@id'], '1');
      asserts.assertEquals(result.root.item['#text'], 'Test');
    });

    it('should handle text responses', () => {
      const textBody = 'Plain text response';
      const result = client.parseResponseBody(textBody, 'text/plain');
      asserts.assertEquals(result, 'Plain text response');
    });

    it('should handle missing content type', () => {
      // Try to parse as JSON first
      const jsonBody = '{"id":1,"name":"Test"}';
      const result1 = client.parseResponseBody<{ id: number; name: string }>(
        jsonBody,
        null,
      );
      asserts.assertEquals(result1.id, 1);
      asserts.assertEquals(result1.name, 'Test');

      // Fallback to text when JSON parsing fails
      const textBody = 'Plain text response';
      const result2 = client.parseResponseBody(textBody, null);
      asserts.assertEquals(result2, 'Plain text response');
    });

    it('should handle invalid JSON', () => {
      const invalidJson = '{id:1,name:"Test"}'; // Missing quotes around property names
      const result = client.parseResponseBody(invalidJson, 'application/json');
      asserts.assertEquals(result, invalidJson); // Returns raw text when parsing fails
    });

    it('should handle invalid XML', () => {
      const invalidXml = '<root><item>No closing tag</root>';
      const result = client.parseResponseBody(invalidXml, 'application/xml');
      asserts.assertEquals(result, invalidXml); // Returns raw text when parsing fails
    });

    it('should handle unknown content types', () => {
      const body = 'Binary or other content';
      const result = client.parseResponseBody(body, 'application/pdf');
      asserts.assertEquals(result, body); // Returns as-is for unknown content types
    });
  });

  describe('URL construction edge cases', () => {
    it('should handle empty path', async () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      const request = await client.processEndpoint(
        { path: '', method: 'GET' },
      );

      asserts.assertEquals(request.url, 'https://api.example.com/');
    });

    it('should handle baseURL with trailing slash', async () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com/',
      });

      const request = await client.processEndpoint(
        { path: '/users', method: 'GET' },
      );

      asserts.assertEquals(request.url, 'https://api.example.com/users');
    });

    it('should handle custom baseURL in endpoint', async () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      const request = await client.processEndpoint(
        {
          baseURL: 'https://different-api.example.com',
          path: '/users',
          method: 'GET',
        },
      );

      asserts.assertEquals(
        request.url,
        'https://different-api.example.com/users',
      );
    });

    it('should handle complex query parameters', async () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      const request = await client.processEndpoint(
        {
          path: '/search',
          method: 'GET',
          query: {
            q: 'test query',
            filter: 'category=test&status=active', // Will be properly encoded
            special: '#$&+,/:;=?@[]',
          },
        },
      );

      const url = new URL(request.url);
      asserts.assertEquals(url.searchParams.get('q'), 'test query');
      asserts.assertEquals(
        url.searchParams.get('filter'),
        'category=test&status=active',
      );
      asserts.assertEquals(url.searchParams.get('special'), '#$&+,/:;=?@[]');
    });
  });

  describe('header extraction', () => {
    const client = new TestRESTler({
      baseURL: 'https://api.example.com',
    });

    it('should extract header with exact match', () => {
      const headers = {
        'x-rate-limit': '100',
        'content-type': 'application/json',
      };

      const result = client.extractHeaderNumber(headers, 'x-rate-limit');
      asserts.assertEquals(result, 100);
    });

    it('should extract header with case-insensitive match', () => {
      // Real responses expose lowercased header keys; the lookup must match
      // regardless of the casing the caller uses for the header name.
      const headers = {
        'x-rate-limit': '100',
        'content-type': 'application/json',
      };

      const result = client.extractHeaderNumber(headers, 'X-Rate-Limit');
      asserts.assertEquals(result, 100);
    });

    it('should try alternative header names', () => {
      const headers = {
        'ratelimit-limit': '100',
        'content-type': 'application/json',
      };

      const result = client.extractHeaderNumber(
        headers,
        'x-ratelimit-limit',
        'ratelimit-limit',
      );
      asserts.assertEquals(result, 100);
    });

    it('should return undefined for missing headers', () => {
      const headers = {
        'content-type': 'application/json',
      };

      const result = client.extractHeaderNumber(headers, 'x-rate-limit');
      asserts.assertEquals(result, undefined);
    });

    it('should return undefined for non-numeric header values', () => {
      const headers = {
        'x-rate-limit': 'unlimited',
      };

      const result = client.extractHeaderNumber(headers, 'x-rate-limit');
      asserts.assertEquals(result, undefined);
    });

    it('should handle undefined headers', () => {
      const result = client.extractHeaderNumber(undefined, 'x-rate-limit');
      asserts.assertEquals(result, undefined);
    });
  });

  describe('request with different content types', () => {
    it('should make request with XML payload', async () => {
      let capturedBody = '';

      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      client.setFetch(async (_input, init) => {
        await 1;
        capturedBody = init?.body as string || '';

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const xmlData = { root: { item: { id: 1, name: 'Test' } } };
      await client.makeRequest(
        {
          path: '/xml-endpoint',
          method: 'POST',
          contentType: 'XML',
          payload: xmlData,
        },
      );

      // Check if XML was properly formatted
      asserts.assert(capturedBody.includes('<root>'));
      asserts.assert(capturedBody.includes('<item>'));
      asserts.assert(capturedBody.includes('<id>1</id>'));
      asserts.assert(capturedBody.includes('<name>Test</name>'));
    });

    it('should make request with form data', async () => {
      let capturedContentType: string | null = null;
      // deno-lint-ignore no-explicit-any
      let capturedBody: any;

      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      client.setFetch(async (_input, init) => {
        await 1;
        // RESTler passes headers as a plain record; normalise through
        // `Headers` so a missing Content-Type reads back as `null`.
        capturedContentType = new Headers(
          init?.headers as HeadersInit | undefined,
        ).get('Content-Type');
        capturedBody = init?.body as FormData || '';

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const formData = new FormData();
      formData.append('username', 'testuser');
      formData.append('password', 'password123');

      await client.makeRequest(
        {
          path: '/login',
          method: 'POST',
          contentType: 'FORM',
          payload: formData,
        },
      );

      // FORM payloads must let fetch set the multipart boundary, so the
      // Content-Type header must be ABSENT on the outgoing request.
      asserts.assertEquals(capturedContentType, null);

      // Verify it's a FormData object
      asserts.assertEquals(capturedBody instanceof FormData, true);
    });

    it('should make request with text payload', async () => {
      let capturedBody = '';

      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      client.setFetch(async (_input, init) => {
        await 1;
        capturedBody = init?.body as string || '';

        return new Response(
          'Response text',
          { status: 200, headers: { 'Content-Type': 'text/plain' } },
        );
      });

      await client.makeRequest(
        {
          path: '/text-endpoint',
          method: 'POST',
          contentType: 'TEXT',
          payload: 'Hello world',
        },
      );

      asserts.assertEquals(capturedBody, 'Hello world');
    });
  });

  describe('async authentication', () => {
    it('should wait for async authentication to complete', async () => {
      const requestData = {
        headers: {} as Record<string, string>,
      };

      const client = new AsyncAuthTestRESTler({
        baseURL: 'https://api.example.com',
      });

      client.setFetch(async (_input, init) => {
        await 1;
        // Store headers for assertions. RESTler passes headers as a plain
        // record; normalise through `Headers` so keys are lowercased.
        requestData.headers = Object.fromEntries(
          new Headers(init?.headers as HeadersInit | undefined).entries(),
        );

        return new Response(
          JSON.stringify({ authenticated: true }),
          { status: 200 },
        );
      });

      await client.makeRequest(
        { path: '/secure', method: 'GET' },
      );

      // Check that auth was called
      asserts.assertEquals(client.authCalled, true);

      // Check that the token was set
      asserts.assertEquals(
        requestData.headers['authorization'],
        'BEARER async-auth-token',
      );
    });
  });

  describe('Request timeout', () => {
    it('fast response returns 200 with a timeout configured', async () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      // Mock fetch to return quickly
      client.setFetch(async () => {
        await 1;
        // Return immediately
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200 },
        );
      });

      // Request with 1 second timeout should succeed
      const response = await client.makeRequest(
        {
          path: '/fast',
          method: 'GET',
          timeout: 1,
        },
      );

      asserts.assertEquals(response.status, 200);
    });

    it('should surface timeout as RESTlerTimeoutError', async () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      // Mock fetch to throw an AbortError, simulating a timed-out request.
      client.setFetch(async () => {
        await 1;
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      });

      await asserts.assertRejects(
        async () =>
          await client.makeRequest(
            {
              path: '/delayed',
              method: 'GET',
              timeout: 1,
            },
          ),
        RESTlerTimeoutError,
      );
    });
  });

  describe('Auth validation', () => {
    class AuthTestRESTler extends TestRESTler {
      public validateAuth(value: unknown) {
        return this._validateAuth(value);
      }
    }

    it('should validate bearer token auth', () => {
      const client = new AuthTestRESTler({
        baseURL: 'https://api.example.com',
      });

      asserts.assertEquals(
        client.validateAuth({ type: 'BEARER', token: 'valid-token' }),
        true,
      );
      asserts.assertEquals(
        client.validateAuth({ type: 'BEARER', token: '' }),
        false,
      );
      // null/undefined are valid (no auth is valid)
      asserts.assertEquals(client.validateAuth(null), true);
      asserts.assertEquals(client.validateAuth(undefined), true);
    });

    it('should validate basic auth (username/password)', () => {
      const client = new AuthTestRESTler({
        baseURL: 'https://api.example.com',
      });

      asserts.assertEquals(
        client.validateAuth({
          type: 'BASIC',
          username: 'user',
          password: 'pass',
        }),
        true,
      );
      asserts.assertEquals(
        client.validateAuth({ type: 'BASIC', username: '', password: 'pass' }),
        false,
      );
      asserts.assertEquals(
        client.validateAuth({ type: 'BASIC', username: 'user', password: '' }),
        false,
      );
      asserts.assertEquals(
        client.validateAuth({ type: 'BASIC', username: '', password: '' }),
        false,
      );
    });

    it('should validate custom auth', () => {
      const client = new AuthTestRESTler({
        baseURL: 'https://api.example.com',
      });

      asserts.assertEquals(
        client.validateAuth({ type: 'CUSTOM', anything: 'goes' }),
        true,
      );
    });

    it('should reject invalid auth formats', () => {
      const client = new AuthTestRESTler({
        baseURL: 'https://api.example.com',
      });

      asserts.assertEquals(client.validateAuth(123), false);
      asserts.assertEquals(client.validateAuth({ invalid: 'object' }), false);
      asserts.assertEquals(client.validateAuth([]), false);
    });

    it('should throw for invalid auth in constructor', () => {
      asserts.assertThrows(
        () => {
          new AuthTestRESTler({
            baseURL: 'https://api.example.com',
            // deno-lint-ignore no-explicit-any
            auth: 123 as any,
          });
        },
        RESTlerConfigError,
        'Auth must be an object',
      );
    });
  });

  describe('BLOB content type handling', () => {
    it('should handle BLOB payload in HTTP request', async () => {
      const blobData = new Blob(['test data'], {
        type: 'application/octet-stream',
      });

      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      client.setFetch(async (_url, options) => {
        // Verify blob was passed through
        asserts.assert(options?.body instanceof Blob);
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200 },
        );
      });

      await client.makeRequest(
        {
          path: '/upload',
          method: 'POST',
          contentType: 'BLOB',
          payload: blobData,
        },
      );
    });
  });

  describe('TEXT content type HTTP handling', () => {
    it('should handle string TEXT payload', async () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      client.setFetch(async (_url, options) => {
        asserts.assertEquals(options?.body, 'plain text content');
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200 },
        );
      });

      await client.makeRequest(
        {
          path: '/text',
          method: 'POST',
          contentType: 'TEXT',
          payload: 'plain text content',
        },
      );
    });
  });

  describe('Additional error scenarios', () => {
    it('should handle unknown errors in HTTP request', async () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      client.setFetch(async () => {
        await 1;
        throw 'string error'; // Non-Error object
      });

      await asserts.assertRejects(
        async () => {
          await client.makeRequest(
            { path: '/test', method: 'GET' },
          );
        },
        RESTlerRequestError,
        'Unknown error processing the request',
      );
    });

    it('should handle empty status text', async () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      client.setFetch(async () => {
        await 1;
        return new Response(
          JSON.stringify({ data: 'test' }),
          {
            status: 500, // Valid status code
            statusText: '', // Empty status text to test fallback
          },
        );
      });

      const response = await client.makeRequest(
        { path: '/test', method: 'GET' },
      );

      // Verify statusText defaults to STATUS_TEXT mapping when empty
      asserts.assertEquals(response.status, 500);
      asserts.assertEquals(response.statusText, 'Internal Server Error');
    });
  });

  describe('Endpoint configuration options', () => {
    it('should use endpoint-specific auth over instance auth', async () => {
      let capturedHeaders: Record<string, string> = {};

      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
        auth: { type: 'BEARER', token: 'instance-token' },
      });

      client.setFetch(async (_input, init) => {
        await 1;
        // RESTler passes headers as a plain record; normalise through
        // `Headers` so the Authorization header reads back regardless of casing.
        capturedHeaders = Object.fromEntries(
          new Headers(init?.headers as HeadersInit | undefined).entries(),
        );
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200 },
        );
      });

      const response = await client.makeRequest(
        {
          path: '/test',
          method: 'GET',
          auth: { type: 'BEARER', token: 'endpoint-token' },
        },
      );

      asserts.assertEquals(response.status, 200);
      // The endpoint-level auth must win over the instance default.
      asserts.assertEquals(
        capturedHeaders['authorization'],
        'BEARER endpoint-token',
      );
    });

    it('should use instance auth when endpoint has none', async () => {
      let capturedHeaders: Record<string, string> = {};

      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
        auth: { type: 'BEARER', token: 'instance-token' },
      });

      client.setFetch(async (_input, init) => {
        await 1;
        capturedHeaders = Object.fromEntries(
          new Headers(init?.headers as HeadersInit | undefined).entries(),
        );
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200 },
        );
      });

      const response = await client.makeRequest(
        { path: '/test', method: 'GET' },
      );

      asserts.assertEquals(response.status, 200);
      // With no endpoint auth, the instance default must be applied.
      asserts.assertEquals(
        capturedHeaders['authorization'],
        'BEARER instance-token',
      );
    });
  });
});

describe('restler.coverage', () => {
  it('passes the configured TLS options through to fetch', async () => {
    // This test targets the pass-through, so cert validation is bypassed.
    class TlsTestRESTler extends TestRESTler {
      protected override _validateTls(
        _value: unknown,
      ): _value is RESTlerOptions['tls'] {
        return true;
      }
    }
    const marker = { caFile: '/marker-ca.pem' };
    const client = new TlsTestRESTler({
      baseURL: 'https://api.example.com',
      // deno-lint-ignore no-explicit-any
      tls: marker as any,
    });
    let capturedTls: unknown;
    client.setFetch((_input, init) => {
      capturedTls = (init as { tls?: unknown })?.tls;
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    await client.makeRequest({ path: '/secure', method: 'GET' });
    asserts.assertEquals(capturedTls, marker);
  });

  it('strips an inherited Content-Type header for FORM payloads', async () => {
    const client = new TestRESTler({
      baseURL: 'https://api.example.com',
      headers: { 'Content-Type': 'application/json' },
    });
    let captured: Record<string, string> = {};
    client.setFetch((_input, init) => {
      captured = Object.fromEntries(new Headers(init?.headers).entries());
      return Promise.resolve(new Response('ok', { status: 200 }));
    });
    const form = new FormData();
    form.append('field', 'value');
    await client.makeRequest({
      path: '/upload',
      method: 'POST',
      contentType: 'FORM',
      payload: form,
    });
    // FORM must let fetch set the multipart boundary, so any inherited
    // Content-Type is removed before the request goes out.
    asserts.assertEquals(captured['content-type'], undefined);
  });

  it('surfaces a RESTlerError from fetch unwrapped', async () => {
    const client = new TestRESTler({ baseURL: 'https://api.example.com' });
    const injected = new RESTlerConfigError('injected failure', {
      vendor: 'TestRESTler',
      key: 'test',
      value: 1,
    });
    client.setFetch(() => Promise.reject(injected));
    await asserts.assertRejects(
      () => client.makeRequest({ path: '/x', method: 'GET' }),
      RESTlerConfigError,
      'injected failure',
    );
  });

  it('wraps a non-Error thrown by fetch as RESTlerRequestError', async () => {
    const client = new TestRESTler({ baseURL: 'https://api.example.com' });
    client.setFetch(() => Promise.reject('plain string failure'));
    await asserts.assertRejects(
      () => client.makeRequest({ path: '/x', method: 'GET' }),
      RESTlerRequestError,
      'Unknown error processing the request',
    );
  });

  it('treats null/undefined TLS as valid (no TLS configured)', () => {
    const client = new TestRESTler({ baseURL: 'https://api.example.com' });
    asserts.assert(client.validateTls(null));
    asserts.assert(client.validateTls(undefined));
  });

  it('reads a BLOB response as a Blob (binary-safe)', async () => {
    const client = new TestRESTler({ baseURL: 'https://api.example.com' });
    client.setFetch(() =>
      Promise.resolve(
        new Response(new Blob(['binary-bytes']), { status: 200 }),
      )
    );
    const res = await client.makeRequest<Blob>({
      path: '/download',
      method: 'GET',
      responseType: 'BLOB',
    });
    asserts.assert(res.body instanceof Blob);
    asserts.assertEquals(await (res.body as Blob).text(), 'binary-bytes');
  });

  it('reads an ARRAY_BUFFER response as an ArrayBuffer', async () => {
    const client = new TestRESTler({ baseURL: 'https://api.example.com' });
    client.setFetch(() =>
      Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    );
    const res = await client.makeRequest<ArrayBuffer>({
      path: '/download',
      method: 'GET',
      responseType: 'ARRAY_BUFFER',
    });
    asserts.assert(res.body instanceof ArrayBuffer);
    asserts.assertEquals(new Uint8Array(res.body as ArrayBuffer).length, 3);
  });
});

describe('restler.timeoutTimer', () => {
  /**
   * Run `fn` with `setTimeout`/`clearTimeout` patched, reporting which timers
   * were armed (with their delay) and which ids were released. Patching the
   * globals is the deterministic seam for observing a timer's lifetime — no
   * wall-clock sleeping, no guessing.
   */
  const trackTimers = async (fn: () => Promise<void>) => {
    const armed: Array<{ id: unknown; delay: number | undefined }> = [];
    const cleared: unknown[] = [];
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    // deno-lint-ignore no-explicit-any
    (globalThis as any).setTimeout = (
      // deno-lint-ignore no-explicit-any
      handler: any,
      delay?: number,
      // deno-lint-ignore no-explicit-any
      ...args: any[]
    ) => {
      const id = realSetTimeout(handler, delay as number, ...args);
      armed.push({ id, delay });
      return id;
    };
    // deno-lint-ignore no-explicit-any
    (globalThis as any).clearTimeout = (id: any) => {
      cleared.push(id);
      return realClearTimeout(id);
    };
    try {
      await fn();
    } finally {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    }
    return { armed, cleared };
  };

  it('releases the timeout timer once a fast request completes', async () => {
    const client = new TestRESTler({ baseURL: 'https://api.example.com' });
    client.setFetch(() =>
      Promise.resolve(
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    );

    const { armed, cleared } = await trackTimers(async () => {
      const response = await client.makeRequest({
        path: '/fast',
        method: 'GET',
        timeout: 120,
      });
      asserts.assertEquals(response.status, 200);
    });

    // The request's own timer is identified by its delay (120s in ms), so
    // unrelated timers armed by the runtime can't be mistaken for it.
    const requestTimers = armed.filter((timer) => timer.delay === 120_000);
    asserts.assertEquals(
      requestTimers.length,
      1,
      'the request should arm exactly one timeout timer',
    );
    // `AbortSignal.timeout` kept its timer armed for the full window; a
    // millisecond-long request must not leave a 120s timer behind.
    asserts.assert(
      cleared.includes(requestTimers[0]!.id),
      'the timeout timer must be released when the request completes',
    );
  });

  it('still rejects a stalled request with RESTlerTimeoutError', async () => {
    const client = new TestRESTler({ baseURL: 'https://api.example.com' });
    // A connection that never settles on its own — only the timeout ends it.
    client.setFetch((_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init!.signal!;
        signal.addEventListener('abort', () => reject(signal.reason));
      })
    );

    await asserts.assertRejects(
      () => client.makeRequest({ path: '/stalled', method: 'GET', timeout: 1 }),
      RESTlerTimeoutError,
    );
  });

  it('times out a response whose body never finishes streaming', async () => {
    const client = new TestRESTler({ baseURL: 'https://api.example.com' });
    // `fetch` settles as soon as the response headers arrive; the body then
    // stalls forever. A real fetch keeps the abort signal wired to the
    // response stream, so this mock does too. This is the guard against
    // releasing the timer at fetch-resolution time: doing so would leave the
    // body read below unbounded and the request would hang indefinitely.
    client.setFetch((_input, init) => {
      const signal = init!.signal!;
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.enqueue(new TextEncoder().encode('{"partial":'));
          signal.addEventListener(
            'abort',
            () => streamController.error(signal.reason),
          );
        },
      });
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    // Bounded watchdog so a regression fails loudly instead of hanging the
    // whole suite: a correct implementation settles after its 1s timeout.
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      client.makeRequest({ path: '/stalled-body', method: 'GET', timeout: 1 })
        .then(() => 'resolved' as const, (error: unknown) => error),
      new Promise<'never-settled'>((resolve) => {
        watchdog = setTimeout(() => resolve('never-settled'), 5000);
      }),
    ]);
    clearTimeout(watchdog);

    asserts.assert(
      outcome instanceof RESTlerTimeoutError,
      `a stalled body read must time out, got: ${String(outcome)}`,
    );
  });
});

describe('restler.responseHandler', () => {
  // Vendor that reports errors inside a 200 envelope: { ok, data, error }.
  const envelopeFetch =
    (envelope: Record<string, unknown>): typeof fetch => () =>
      Promise.resolve(
        new Response(JSON.stringify(envelope), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

  it('throws the vendor error from a 200 whose body carries an error', async () => {
    const client = new TestRESTler({ baseURL: 'https://api.example.com' });
    client.setFetch(
      envelopeFetch({ ok: false, error: 'insufficient funds' }),
    );
    const handler: RESTlerResponseHandler = (response) => {
      const body = response.body as { ok: boolean; error?: string };
      if (!body.ok) {
        throw new RESTlerRequestError(
          `Vendor error: ${body.error}`,
          {
            vendor: 'TestRESTler',
            request: { url: response.url, method: 'GET', timeout: 30 },
          },
        );
      }
    };
    await asserts.assertRejects(
      () => client.makeRequest({ path: '/pay', method: 'GET' }, handler),
      RESTlerRequestError,
      'Vendor error: insufficient funds',
    );
  });

  it('unwraps an envelope by mutating response.body', async () => {
    const client = new TestRESTler({ baseURL: 'https://api.example.com' });
    client.setFetch(
      envelopeFetch({ ok: true, data: { id: 7, name: 'thing' } }),
    );
    const unwrap: RESTlerResponseHandler = (response) => {
      response.body = (response.body as { data: unknown }).data;
    };
    const res = await client.makeRequest(
      { path: '/thing/7', method: 'GET' },
      unwrap,
    );
    asserts.assertEquals(res.body, { id: 7, name: 'thing' });
  });

  it('uses the class-level _responseHandler when no per-call handler is given', async () => {
    class EnvelopeRESTler extends TestRESTler {
      protected override _responseHandler: RESTlerResponseHandler = (
        response,
      ) => {
        response.body = (response.body as { data: unknown }).data;
      };
    }
    const client = new EnvelopeRESTler({ baseURL: 'https://api.example.com' });
    client.setFetch(envelopeFetch({ ok: true, data: { id: 1 } }));
    const res = await client.makeRequest({ path: '/one', method: 'GET' });
    asserts.assertEquals(res.body, { id: 1 });
  });

  it('per-call handler takes precedence over the class default', async () => {
    class EnvelopeRESTler extends TestRESTler {
      protected override _responseHandler: RESTlerResponseHandler = () => {
        throw new RESTlerRequestError('class default ran', {
          vendor: 'TestRESTler',
          request: {
            url: 'https://api.example.com/x',
            method: 'GET',
            timeout: 30,
          },
        });
      };
    }
    const client = new EnvelopeRESTler({ baseURL: 'https://api.example.com' });
    client.setFetch(envelopeFetch({ ok: true }));
    let perCallRan = false;
    const res = await client.makeRequest(
      { path: '/x', method: 'GET' },
      () => {
        perCallRan = true;
      },
    );
    asserts.assert(perCallRan);
    asserts.assertEquals(res.status, 200);
  });

  it('wraps a non-RESTlerError thrown by the handler as RESTlerRequestError', async () => {
    const client = new TestRESTler({ baseURL: 'https://api.example.com' });
    client.setFetch(envelopeFetch({ ok: false }));
    const err = await asserts.assertRejects(
      () =>
        client.makeRequest({ path: '/x', method: 'GET' }, () => {
          throw new Error('plain vendor failure');
        }),
      RESTlerRequestError,
      'Unknown error processing the request',
    );
    // The original error is preserved as the cause.
    asserts.assertEquals((err.cause as Error).message, 'plain vendor failure');
  });

  it('runs the handler even for empty bodies and error statuses', async () => {
    const client = new TestRESTler({ baseURL: 'https://api.example.com' });
    client.setFetch(() => Promise.resolve(new Response(null, { status: 404 })));
    let sawStatus: number | null = null;
    let sawBody: unknown = 'unset';
    await client.makeRequest({ path: '/gone', method: 'GET' }, (response) => {
      sawStatus = response.status;
      sawBody = response.body;
    });
    asserts.assertEquals(sawStatus, 404);
    asserts.assertEquals(sawBody, undefined);
  });

  describe('review regressions', () => {
    it('builds the body for a lowercase contentType (case-insensitive)', async () => {
      const client = new TestRESTler({ baseURL: 'https://api.example.com' });
      let sentBody: unknown = 'unset';
      let sentContentType: string | null = null;
      client.setFetch(async (_input, init) => {
        await 1;
        sentBody = init?.body;
        sentContentType = new Headers(
          init?.headers as HeadersInit | undefined,
        ).get('content-type');
        return new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });

      const payload = { hello: 'world' };
      await client.makeRequest({
        path: '/echo',
        method: 'POST',
        // deno-lint-ignore no-explicit-any
        contentType: 'json' as any,
        payload,
      });

      // Without case-normalization the body is silently dropped (undefined).
      asserts.assertEquals(sentBody, JSON.stringify(payload));
      asserts.assertEquals(sentContentType, 'application/json');
    });

    it('normalizes a lowercase instance contentType option to upper-case', () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
        // deno-lint-ignore no-explicit-any
        contentType: 'json' as any,
      });
      asserts.assertEquals(client.readOption('contentType'), 'JSON');
    });

    it('accepts an undefined contentType option without crashing', () => {
      // The validator treats a nullish contentType as "use the default"; the
      // normalizer must not call .toUpperCase() on it.
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
        // deno-lint-ignore no-explicit-any
        contentType: undefined as any,
      });
      asserts.assert(client instanceof RESTler);
    });

    it('rejects an out-of-range endpoint timeout with a config error', async () => {
      const client = new TestRESTler({ baseURL: 'https://api.example.com' });
      client.setFetch(() =>
        Promise.resolve(new Response('{}', { status: 200 }))
      );

      for (const bad of [0, -5, 130]) {
        await asserts.assertRejects(
          () => client.makeRequest({ path: '/x', method: 'GET', timeout: bad }),
          RESTlerConfigError,
          'Timeout must be a number between 1 and 120',
        );
      }

      // A valid per-endpoint timeout is accepted and does not throw.
      const ok = await client.makeRequest({
        path: '/x',
        method: 'GET',
        timeout: 30,
      });
      asserts.assertEquals(ok.status, 200);
    });

    it('redacts credentials in error context and the call event, but still sends them on the wire', async () => {
      let eventAuth: unknown = 'unset';
      class AuthEventRESTler extends TestRESTler {
        constructor(options: RESTlerOptions) {
          super(options);
          this.on('call', (_vendor, request) => {
            eventAuth = (request as { headers?: Record<string, string> })
              .headers?.Authorization;
          });
        }
      }

      const client = new AuthEventRESTler({
        baseURL: 'https://api.example.com',
      });
      let wireAuth: string | null = null;
      client.setFetch(async (_input, init) => {
        await 1;
        wireAuth = new Headers(init?.headers as HeadersInit | undefined)
          .get('authorization');
        throw new Error('network down');
      });

      let serialized = '';
      try {
        await client.makeRequest({
          path: '/secure',
          method: 'GET',
          auth: { type: 'BASIC', username: 'u', password: 'p' },
        });
        asserts.fail('expected the request to reject');
      } catch (error) {
        serialized = JSON.stringify(error);
      }

      // btoa('u:p') === 'dTpw' — the real credential must reach fetch...
      asserts.assertEquals(wireAuth, 'Basic dTpw');
      // ...but never appear in the serialized error or the emitted event.
      asserts.assert(
        !serialized.includes('dTpw'),
        'raw credential leaked into the serialized error',
      );
      asserts.assert(
        serialized.includes('[REDACTED]'),
        'error context should carry a redacted placeholder',
      );
      asserts.assertEquals(eventAuth, '[REDACTED]');
    });

    it('lets a subclass extend the sensitive-header set via _isSensitiveHeader', async () => {
      // A subclass that authenticates with a vendor-specific header extends the
      // redaction set by overriding the seam; chaining to `super` keeps the
      // base credential headers (e.g. Authorization) redacted too.
      class CustomHeaderRESTler extends TestRESTler {
        protected override _isSensitiveHeader(name: string): boolean {
          return name.toLowerCase() === 'x-vendor-secret' ||
            super._isSensitiveHeader(name);
        }
      }

      let eventHeaders: Record<string, string> | undefined;
      const client = new CustomHeaderRESTler({
        baseURL: 'https://api.example.com',
        headers: {
          'X-Vendor-Secret': 'super-secret-token',
          'X-Trace-Id': 'trace-123',
        },
      });
      client.on('call', (_vendor, request) => {
        eventHeaders =
          (request as { headers?: Record<string, string> }).headers;
      });

      let wireSecret: string | null = null;
      client.setFetch(async (_input, init) => {
        await 1;
        wireSecret = new Headers(init?.headers as HeadersInit | undefined)
          .get('x-vendor-secret');
        throw new Error('network down');
      });

      let serialized = '';
      try {
        await client.makeRequest({
          path: '/x',
          method: 'GET',
          auth: { type: 'BEARER', token: 'jwt-secret' },
        });
        asserts.fail('expected the request to reject');
      } catch (error) {
        serialized = JSON.stringify(error);
      }

      // The real secret still reaches the wire...
      asserts.assertEquals(wireSecret, 'super-secret-token');
      // ...but never appears in the serialized error context.
      asserts.assert(
        !serialized.includes('super-secret-token'),
        'custom sensitive header leaked into the serialized error',
      );
      // The custom header is redacted on the event's request copy...
      asserts.assertEquals(eventHeaders?.['X-Vendor-Secret'], '[REDACTED]');
      // ...the base credential header is still redacted (via `super`)...
      asserts.assertEquals(eventHeaders?.['Authorization'], '[REDACTED]');
      asserts.assert(
        !serialized.includes('jwt-secret'),
        'base credential header must remain redacted after the override',
      );
      // ...and a non-sensitive header passes through untouched.
      asserts.assertEquals(eventHeaders?.['X-Trace-Id'], 'trace-123');
    });

    it('omits the request payload from the error context and call event, but still sends it on the wire', async () => {
      let eventHadPayloadKey = true;
      let eventPayload: unknown = 'unset';
      class PayloadEventRESTler extends TestRESTler {
        constructor(options: RESTlerOptions) {
          super(options);
          this.on('call', (_vendor, request) => {
            const req = request as Record<string, unknown>;
            eventHadPayloadKey = 'payload' in req;
            eventPayload = req.payload;
          });
        }
      }

      const client = new PayloadEventRESTler({
        baseURL: 'https://api.example.com',
      });
      let wireBody: unknown = 'unset';
      client.setFetch(async (_input, init) => {
        await 1;
        wireBody = init?.body;
        throw new Error('network down');
      });

      const secret = 'topsecret-password';
      let serialized = '';
      try {
        await client.makeRequest({
          path: '/login',
          method: 'POST',
          contentType: 'JSON',
          payload: { username: 'u', password: secret },
        });
        asserts.fail('expected the request to reject');
      } catch (error) {
        serialized = JSON.stringify(error);
      }

      // The real payload must reach fetch (serialized JSON body)...
      asserts.assertEquals(
        wireBody,
        JSON.stringify({ username: 'u', password: secret }),
      );
      // ...but never appear in the serialized error context...
      asserts.assert(
        !serialized.includes(secret),
        'raw payload credential leaked into the serialized error',
      );
      // ...nor on the request handed to the `call` event: the key is dropped
      // entirely, not merely blanked.
      asserts.assertEquals(eventHadPayloadKey, false);
      asserts.assertEquals(eventPayload, undefined);
    });

    it('encodes a non-ASCII BASIC credential as RFC 7617 UTF-8 base64', async () => {
      const client = new TestRESTler({ baseURL: 'https://api.example.com' });
      // 'é' is U+00E9: within Latin1, so `btoa` would emit the single byte
      // 0xE9 instead of the UTF-8 sequence 0xC3 0xA9 that RFC 7617 requires.
      const request = await client.processEndpoint({
        path: '/secure',
        method: 'GET',
        auth: { type: 'BASIC', username: 'user', password: 'café' },
      });
      // Base64 of the UTF-8 bytes of 'user:café', not the Latin1 encoding.
      asserts.assertEquals(
        request.headers!['Authorization'],
        'Basic dXNlcjpjYWbDqQ==',
      );
    });

    it('does not throw on a BASIC credential outside the Latin1 range', async () => {
      const client = new TestRESTler({ baseURL: 'https://api.example.com' });
      // '€' is U+20AC — `btoa(\`user:p€cy\`)` throws InvalidCharacterError. The
      // UTF-8 path must encode it without throwing and produce the RFC-correct
      // base64 of its UTF-8 bytes.
      const request = await client.processEndpoint({
        path: '/secure',
        method: 'GET',
        auth: { type: 'BASIC', username: 'user', password: 'p€cy' },
      });
      asserts.assertEquals(
        request.headers!['Authorization'],
        'Basic dXNlcjpw4oKsY3k=',
      );
    });

    it('redacts secrets from an auth config-validation error', () => {
      const error = asserts.assertThrows(
        () =>
          new TestRESTler({
            baseURL: 'https://api.example.com',
            auth: {
              type: 'NONSENSE',
              password: 'topsecret',
              token: 'topsecret2',
              // deno-lint-ignore no-explicit-any
            } as any,
          }),
        RESTlerConfigError,
      );
      const serialized = JSON.stringify(error);
      asserts.assert(
        !serialized.includes('topsecret'),
        'auth secrets must not appear in the config error',
      );
      asserts.assert(serialized.includes('[REDACTED]'));
    });

    it('rejects an unsupported endpoint contentType with a config error', async () => {
      const client = new TestRESTler({ baseURL: 'https://api.example.com' });
      let sentBody: unknown = 'unset';
      client.setFetch((_input, init) => {
        sentBody = init?.body;
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

      await asserts.assertRejects(
        () =>
          client.makeRequest({
            path: '/x',
            method: 'POST',
            // deno-lint-ignore no-explicit-any
            contentType: 'YAML' as any,
            payload: { a: 1 },
          }),
        RESTlerConfigError,
        'Content type must be one of',
      );

      // Unvalidated, an unsupported content type fell through `_buildBody`'s
      // `default` and the request went out with its payload silently dropped.
      asserts.assertEquals(
        sentBody,
        'unset',
        'no request should be sent for an invalid contentType',
      );
    });

    it('normalizes a lowercase endpoint contentType to upper-case', async () => {
      const client = new TestRESTler({ baseURL: 'https://api.example.com' });
      const request = await client.processEndpoint({
        path: '/x',
        method: 'POST',
        // deno-lint-ignore no-explicit-any
        contentType: 'json' as any,
        payload: { a: 1 },
      });
      // The endpoint path must canonicalise casing exactly like the instance
      // path does in `_processOption`.
      asserts.assertEquals(
        (request as { contentType?: string }).contentType,
        'JSON',
      );
    });

    it('rejects a non-string endpoint version with a config error', async () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com/v{version}',
      });

      // Unvalidated these reached `_replaceVersion`, which coerces whatever it
      // is given straight into the URL — `42` silently became `/v42` and `{}`
      // became `/v[object Object]`.
      for (const bad of [42, {}, []]) {
        await asserts.assertRejects(
          () =>
            client.makeRequest({
              path: '/x',
              method: 'GET',
              // deno-lint-ignore no-explicit-any
              version: bad as any,
            }),
          RESTlerConfigError,
          'Version must be a string.',
        );
      }
    });

    it('accepts a valid endpoint version override', async () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com/v{version}',
        version: '1',
      });
      const request = await client.processEndpoint({
        path: '/users',
        method: 'GET',
        version: '2',
      });
      asserts.assertEquals(request.url, 'https://api.example.com/v2/users');
    });
  });

  describe('round-3 review regressions', () => {
    it('redacts query-string credentials in the URL across the call event and errors, but still sends them on the wire', async () => {
      const SECRET = 'SECRET-KEY-123';
      const HEADER_SECRET = 'TOKEN-SECRET-456';
      const events: Array<{ requestUrl: string; responseUrl: string }> = [];

      // Mirrors the package's own documented query-string auth pattern: a
      // CUSTOM `_authInjector` that injects an API key via `endpoint.query`
      // (and a non-standard secret header).
      class QueryAuthRESTler extends TestRESTler {
        constructor(options: RESTlerOptions) {
          super(options);
          this.on('call', (_vendor, request, response) => {
            events.push({
              requestUrl: (request as { url: string }).url,
              responseUrl: (response as { url: string }).url,
            });
          });
        }

        protected override _authInjector(endpoint: RESTlerEndpoint): void {
          endpoint.query = { ...endpoint.query, appid: SECRET };
          endpoint.headers = {
            ...endpoint.headers,
            'X-Auth-Token': HEADER_SECRET,
          };
        }
      }

      const client = new QueryAuthRESTler({
        baseURL: 'https://api.example.com',
      });
      let wireUrl = '';
      client.setFetch(async (input) => {
        await 1;
        wireUrl = String(input);
        throw new Error('network down');
      });

      let serialized = '';
      try {
        await client.makeRequest({
          path: '/weather',
          method: 'GET',
          query: { q: 'oslo' },
        });
        asserts.fail('expected the request to reject');
      } catch (error) {
        serialized = JSON.stringify(error);
      }

      // The real key must reach the wire...
      asserts.assert(
        wireUrl.includes(SECRET),
        'the API key must be sent on the wire',
      );
      // ...but never appear in the serialized error (context.request.url)...
      asserts.assert(
        !serialized.includes(SECRET),
        'query-string credential leaked into the serialized error',
      );
      // ...nor should a non-standard secret header leak.
      asserts.assert(
        !serialized.includes(HEADER_SECRET),
        'custom auth header leaked into the serialized error',
      );
      // ...nor in the call event's request OR response URL.
      asserts.assertEquals(events.length, 1);
      asserts.assert(
        !events[0]!.requestUrl.includes(SECRET),
        'query-string credential leaked into the call event request url',
      );
      asserts.assert(
        !events[0]!.responseUrl.includes(SECRET),
        'query-string credential leaked into the call event response url',
      );
      // Redaction keeps the parameter keys but blanks every value.
      asserts.assert(events[0]!.requestUrl.includes('appid=[REDACTED]'));
      asserts.assert(events[0]!.requestUrl.includes('q=[REDACTED]'));
    });

    it('never mutates the caller endpoint object and does not bleed auth to a later unauthenticated instance', async () => {
      // A shared, reused endpoint object — e.g. an endpoint catalog constant.
      const shared: RESTlerEndpoint = { path: '/me', method: 'GET' };
      const snapshot = structuredClone(shared);

      const makeClient = (auth?: RESTlerOptions['auth']) => {
        const sent: { authorization: string | null } = { authorization: null };
        const client = new TestRESTler(
          auth
            ? { baseURL: 'https://api.example.com', auth }
            : { baseURL: 'https://api.example.com' },
        );
        client.setFetch(async (_input, init) => {
          await 1;
          sent.authorization = new Headers(
            init?.headers as HeadersInit | undefined,
          ).get('authorization');
          return new Response('{}', { status: 200 });
        });
        return { client, sent };
      };

      // Instance A (with a token) uses the shared endpoint object.
      const a = makeClient({ type: 'BEARER', token: 'tenant-A-secret' });
      await a.client.makeRequest(shared);
      asserts.assertEquals(a.sent.authorization, 'BEARER tenant-A-secret');
      // The caller's endpoint object must be byte-for-byte unchanged: no
      // plaintext Authorization header written back onto it.
      asserts.assertEquals(shared, snapshot);

      // A different, unauthenticated instance reuses the same object.
      const noauth = makeClient();
      await noauth.client.makeRequest(shared);
      // It must NOT inherit A's stale credential.
      asserts.assertEquals(noauth.sent.authorization, null);
      asserts.assertEquals(shared, snapshot);
    });

    it('does not bleed credentials between concurrent requests sharing an endpoint object', async () => {
      const shared: RESTlerEndpoint = { path: '/me', method: 'GET' };

      const makeClient = (token: string) => {
        const sent: { authorization: string | null } = { authorization: null };
        const client = new TestRESTler({
          baseURL: 'https://api.example.com',
          auth: { type: 'BEARER', token },
        });
        client.setFetch(async (_input, init) => {
          await 1;
          sent.authorization = new Headers(
            init?.headers as HeadersInit | undefined,
          ).get('authorization');
          return new Response('{}', { status: 200 });
        });
        return { client, sent };
      };

      const a = makeClient('token-A');
      const b = makeClient('token-B');
      // Both instances process the SAME endpoint object concurrently.
      await Promise.all([
        a.client.makeRequest(shared),
        b.client.makeRequest(shared),
      ]);

      // Each request must carry its own instance's token — the last writer
      // must not win a shared endpoint object.
      asserts.assertEquals(a.sent.authorization, 'BEARER token-A');
      asserts.assertEquals(b.sent.authorization, 'BEARER token-B');
    });

    it('throws a config error at construction when baseURL is missing', () => {
      asserts.assertThrows(
        // A plain-JS caller, or config loaded from JSON/env with the key
        // absent, must not slip through to a raw TypeError at first request.
        // deno-lint-ignore no-explicit-any
        () => new TestRESTler({} as any),
        RESTlerConfigError,
        'Base URL must be a valid URL.',
      );
    });

    it('isolates a throwing call listener so a successful response is preserved', async () => {
      class BoomRESTler extends TestRESTler {
        constructor(options: RESTlerOptions) {
          super(options);
          this.on('call', () => {
            throw new Error('listener boom');
          });
        }
      }
      const client = new BoomRESTler({ baseURL: 'https://api.example.com' });
      client.setFetch(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )
      );
      // A bug in a monitoring listener must not turn a 200 into a rejection.
      const res = await client.makeRequest<{ ok: boolean }>({
        path: '/x',
        method: 'GET',
      });
      asserts.assertEquals(res.status, 200);
      asserts.assertEquals(res.body?.ok, true);
    });

    it('isolates a throwing authFailure listener so the 401 is returned normally', async () => {
      class BoomAuthRESTler extends TestRESTler {
        constructor(options: RESTlerOptions) {
          super(options);
          this.on('authFailure', () => {
            throw new Error('auth listener boom');
          });
        }
      }
      const client = new BoomAuthRESTler({
        baseURL: 'https://api.example.com',
      });
      client.setFetch(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'nope' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
        )
      );
      // The 401 must be returned normally, not masked by the listener error.
      const res = await client.makeRequest({ path: '/secure', method: 'GET' });
      asserts.assertEquals(res.status, 401);
    });
  });

  describe('round-4 review regressions', () => {
    it('redacts a query-string credential in an error thrown by a vendor _responseHandler across every log surface', async () => {
      const SECRET = 'SECRET-KEY-123';
      const calls: Array<{
        request: { url: string };
        response: { url: string; error?: unknown };
        error?: unknown;
      }> = [];

      // Mirrors the package's own documented vendor pattern (WeatherAPI
      // fixture + README): a query-string API key injected via `_authInjector`
      // and a `_responseHandler` that throws a RESTlerRequestError whose
      // `context.request` copies the raw `response.url`.
      class VendorEnvelopeRESTler extends TestRESTler {
        constructor(options: RESTlerOptions) {
          super(options);
          this.on('call', (_vendor, request, response, error) => {
            calls.push({
              request: request as { url: string },
              response: response as { url: string; error?: unknown },
              error,
            });
          });
        }

        protected override _authInjector(endpoint: RESTlerEndpoint): void {
          endpoint.query = { ...endpoint.query, appid: SECRET };
        }

        protected override _responseHandler: RESTlerResponseHandler = (
          response,
        ) => {
          const body = response.body as { cod?: string | number } | undefined;
          if (body?.cod !== undefined && Number(body.cod) >= 400) {
            throw new RESTlerRequestError('city not found', {
              vendor: this.vendor,
              request: { url: response.url, method: 'GET', timeout: 30 },
            });
          }
        };
      }

      const client = new VendorEnvelopeRESTler({
        baseURL: 'https://api.example.com',
      });
      let wireUrl = '';
      client.setFetch((input) => {
        wireUrl = String(input);
        return Promise.resolve(
          new Response(
            JSON.stringify({ cod: '404', message: 'city not found' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      });

      let thrown: unknown;
      try {
        await client.makeRequest({
          path: '/weather',
          method: 'GET',
          query: { q: 'oslo' },
        });
        asserts.fail('expected the vendor handler to reject');
      } catch (error) {
        thrown = error;
      }

      // The real key still reaches the wire.
      asserts.assert(
        wireUrl.includes(SECRET),
        'the API key must be sent on the wire',
      );

      // The thrown error a consumer catches and logs must not carry it.
      asserts.assertInstanceOf(thrown, RESTlerRequestError);
      asserts.assert(
        !JSON.stringify(thrown).includes(SECRET),
        'credential leaked into the serialized thrown error',
      );
      const thrownUrl = thrown.context.request.url;
      asserts.assert(
        !thrownUrl.includes(SECRET),
        'credential leaked into the thrown error context.request.url',
      );
      asserts.assert(thrownUrl.includes('appid=[REDACTED]'));

      // The `call` event's log-safe surfaces — request (arg2), response (arg3,
      // including its `.error`), and error (arg4) — must all be clean.
      asserts.assertEquals(calls.length, 1);
      const call = calls[0]!;
      asserts.assert(
        !call.request.url.includes(SECRET),
        'credential leaked into the call event request url',
      );
      asserts.assert(
        !call.response.url.includes(SECRET),
        'credential leaked into the call event response url',
      );
      asserts.assert(
        !JSON.stringify(call.error ?? {}).includes(SECRET),
        'credential leaked into the call event error argument',
      );
      asserts.assert(
        !JSON.stringify(call.response.error ?? {}).includes(SECRET),
        'credential leaked into the call event response.error',
      );
    });

    it('runs later call listeners even when an earlier listener throws', async () => {
      let metrics = 0;
      let third = 0;
      class MultiListenerRESTler extends TestRESTler {
        constructor(options: RESTlerOptions) {
          super(options);
          // A first, always-throwing listener must not silence the ones after
          // it — isolation has to be per-listener, not per-emit.
          this.on('call', () => {
            throw new Error('buggy logger');
          });
          this.on('call', () => {
            metrics++;
          });
          this.on('call', () => {
            third++;
          });
        }
      }
      const client = new MultiListenerRESTler({
        baseURL: 'https://api.example.com',
      });
      client.setFetch(() =>
        Promise.resolve(
          new Response('{}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )
      );
      await client.makeRequest({ path: '/a', method: 'GET' });
      await client.makeRequest({ path: '/b', method: 'GET' });
      asserts.assertEquals(metrics, 2, 'the second listener was skipped');
      asserts.assertEquals(third, 2, 'the third listener was skipped');
    });

    it('isolates an async-rejecting call listener without an unhandled rejection escaping', async () => {
      // Capture unhandled rejections in a runtime-portable way (Deno/Bun fire
      // the web `unhandledrejection` event; Node uses `process`), suppressing
      // the default process-termination so an escaped rejection surfaces as a
      // clean assertion failure instead of crashing the runner.
      const g = globalThis as unknown as {
        process?: {
          on: (e: string, cb: (r: unknown) => void) => void;
          off?: (e: string, cb: (r: unknown) => void) => void;
          removeListener?: (e: string, cb: (r: unknown) => void) => void;
        };
        addEventListener?: (e: string, cb: (ev: unknown) => void) => void;
        removeEventListener?: (e: string, cb: (ev: unknown) => void) => void;
      };
      const rejections: unknown[] = [];
      const nodeHandler = (reason: unknown) => {
        rejections.push(reason);
      };
      const webHandler = (ev: unknown) => {
        rejections.push((ev as { reason?: unknown })?.reason);
        (ev as { preventDefault?: () => void })?.preventDefault?.();
      };
      const hasWeb = typeof g.addEventListener === 'function';
      const hasProcess = typeof g.process?.on === 'function';
      if (hasWeb) g.addEventListener!('unhandledrejection', webHandler);
      if (hasProcess) g.process!.on('unhandledRejection', nodeHandler);

      try {
        class AsyncBoomRESTler extends TestRESTler {
          constructor(options: RESTlerOptions) {
            super(options);
            this.on('call', async () => {
              await Promise.resolve();
              throw new Error('async listener boom');
            });
          }
        }
        const client = new AsyncBoomRESTler({
          baseURL: 'https://api.example.com',
        });
        client.setFetch(() =>
          Promise.resolve(
            new Response('{}', {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          )
        );
        // The request must resolve normally...
        const res = await client.makeRequest({ path: '/x', method: 'GET' });
        asserts.assertEquals(res.status, 200);
        // ...and no unhandled rejection must escape the isolation wrapper.
        await new Promise((r) => setTimeout(r, 50));
        asserts.assertEquals(
          rejections,
          [],
          'an async listener rejection escaped isolation',
        );
      } finally {
        if (hasWeb) g.removeEventListener!('unhandledrejection', webHandler);
        if (hasProcess) {
          (g.process!.off ?? g.process!.removeListener)?.call(
            g.process,
            'unhandledRejection',
            nodeHandler,
          );
        }
      }
    });
  });

  describe('round-5 review regressions', () => {
    // Walk the whole `cause` chain and concatenate every error's
    // `name`/`message`/`stack` — the text a cause-expanding logger prints
    // (`console.error(err)`, `util.inspect`, `Deno.inspect(err, { depth })`).
    // `JSON.stringify` / `BaseError.toJSON` only render the *direct* cause as
    // `"Name: message"`, so they never expand this chain; this helper is the
    // surface the round-4 fix left leaking.
    const deepErrorText = (err: unknown): string => {
      let out = '';
      let node: unknown = err;
      const seen = new Set<unknown>();
      for (
        let i = 0;
        node && typeof node === 'object' && !seen.has(node) && i < 16;
        i++
      ) {
        seen.add(node);
        const e = node as {
          name?: unknown;
          message?: unknown;
          stack?: unknown;
          cause?: unknown;
        };
        out += `${String(e.name)}: ${String(e.message)}\n${
          String(e.stack ?? '')
        }\n`;
        node = e.cause;
      }
      return out;
    };

    it('scrubs a query-string credential from the wrapped fetch error cause chain across every log surface', async () => {
      const SECRET = 'SECRET-KEY-123';
      const calls: Array<{ error?: unknown }> = [];

      // Mirrors the package's documented query-string auth pattern: a CUSTOM
      // `_authInjector` that injects an API key via `endpoint.query`.
      class QueryAuthRESTler extends TestRESTler {
        constructor(options: RESTlerOptions) {
          super(options);
          this.on('call', (_vendor, _request, _response, error) => {
            calls.push({ error });
          });
        }

        protected override _authInjector(endpoint: RESTlerEndpoint): void {
          endpoint.query = { ...endpoint.query, appid: SECRET };
        }
      }

      const client = new QueryAuthRESTler({
        baseURL: 'http://127.0.0.1:59999',
      });

      // Reproduce the real runtime shape: when `fetch` itself fails, the
      // transport error embeds the full (credential-bearing) request URL in
      // its message — and therefore its stack — and, on Deno, one level down
      // in `TypeError: fetch failed`'s own `cause`. The exact string `fetch`
      // was handed (`wireUrl`) is echoed back verbatim.
      let wireUrl = '';
      client.setFetch((input) => {
        wireUrl = String(input);
        const transport = new Error(
          `error sending request for url (${wireUrl}): client error ` +
            `(Connect): tcp connect error: Connection refused (os error 61)`,
        );
        return Promise.reject(
          new TypeError('fetch failed', { cause: transport }),
        );
      });

      let thrown: unknown;
      try {
        await client.makeRequest({
          path: '/weather',
          method: 'GET',
          query: { q: 'oslo' },
        });
        asserts.fail('expected the request to reject');
      } catch (error) {
        thrown = error;
      }

      // The real key still reaches the wire.
      asserts.assert(
        wireUrl.includes(SECRET),
        'the API key must be sent on the wire',
      );

      asserts.assertInstanceOf(thrown, RESTlerRequestError);

      // The transport error is still preserved as the cause (and keeps its
      // original type — redaction must not reconstruct/replace it).
      asserts.assertInstanceOf(thrown.cause, TypeError);
      asserts.assert(
        thrown.cause instanceof TypeError &&
          (thrown.cause as { cause?: unknown }).cause instanceof Error,
        'the nested transport cause must be preserved',
      );

      // The canonical `console.error(err)` surface — the whole cause chain's
      // message + stack — must NOT carry the credential (this is what the
      // round-4 fix missed).
      const chainText = deepErrorText(thrown);
      asserts.assert(
        !chainText.includes(SECRET),
        'query-string credential leaked into the wrapped error cause chain',
      );
      // Redaction, not deletion: the redacted placeholder proves the URL is
      // still there (log-useful) with only its values blanked.
      asserts.assert(
        chainText.includes('appid=[REDACTED]'),
        'the cause chain should retain a redacted URL',
      );
      // The raw URL string must be gone from the chain entirely.
      asserts.assert(
        !chainText.includes(wireUrl),
        'the raw credentialed URL leaked into the cause chain',
      );

      // JSON.stringify / toJSON already stayed clean pre-fix — assert it holds.
      asserts.assert(
        !JSON.stringify(thrown).includes(SECRET),
        'credential leaked into the serialized error',
      );
      // The redacted request copy on the error context stays clean.
      asserts.assert(
        !(thrown.context.request as { url: string }).url.includes(SECRET),
        'credential leaked into the error context.request.url',
      );

      // The `call` event's 4th arg is the same error object — expanding its
      // cause chain must be just as clean.
      asserts.assertEquals(calls.length, 1);
      asserts.assert(
        !deepErrorText(calls[0]!.error).includes(SECRET),
        'credential leaked into the call event error cause chain',
      );
    });

    it('scrubs userinfo credentials embedded in the request URL from the cause chain', async () => {
      // A credential carried as URL userinfo (`https://key:secret@host`) is
      // the other secret-bearing part of a URL redaction covers.
      const SECRET = 'basic-secret-pass';
      const client = new TestRESTler({
        baseURL: `https://apikey:${SECRET}@api.example.com`,
      });
      let wireUrl = '';
      client.setFetch((input) => {
        wireUrl = String(input);
        const transport = new Error(
          `error sending request for url (${wireUrl}): connection closed`,
        );
        return Promise.reject(
          new TypeError('fetch failed', { cause: transport }),
        );
      });

      let thrown: unknown;
      try {
        await client.makeRequest({ path: '/data', method: 'GET' });
        asserts.fail('expected the request to reject');
      } catch (error) {
        thrown = error;
      }

      asserts.assert(wireUrl.includes(SECRET), 'userinfo must reach the wire');
      asserts.assertInstanceOf(thrown, RESTlerRequestError);
      asserts.assert(
        !deepErrorText(thrown).includes(SECRET),
        'userinfo credential leaked into the cause chain',
      );
    });

    it('leaves a fetch error with no credential in its URL untouched', async () => {
      // No query string and no userinfo: nothing to redact, so the transport
      // error's message/stack must survive verbatim for debugging.
      const client = new TestRESTler({ baseURL: 'https://api.example.com' });
      client.setFetch(() => {
        const transport = new Error(
          'error sending request for url ' +
            '(https://api.example.com/data): connection reset',
        );
        return Promise.reject(
          new TypeError('fetch failed', { cause: transport }),
        );
      });

      let thrown: unknown;
      try {
        await client.makeRequest({ path: '/data', method: 'GET' });
        asserts.fail('expected the request to reject');
      } catch (error) {
        thrown = error;
      }

      asserts.assertInstanceOf(thrown, RESTlerRequestError);
      // The diagnostic detail is preserved unchanged.
      asserts.assert(
        deepErrorText(thrown).includes('connection reset'),
        'the transport diagnostic must be preserved when nothing is sensitive',
      );
      asserts.assert(
        deepErrorText(thrown).includes('https://api.example.com/data'),
        'a non-sensitive URL must remain intact for debugging',
      );
    });
  });

  describe('round-6 review regressions', () => {
    // Same cause-chain walker used by the round-5 tests: the text a
    // cause-expanding logger (`console.error(err)`, `util.inspect`,
    // `Deno.inspect(err, { depth })`) would print.
    const deepErrorText = (err: unknown): string => {
      let out = '';
      let node: unknown = err;
      const seen = new Set<unknown>();
      for (
        let i = 0;
        node && typeof node === 'object' && !seen.has(node) && i < 16;
        i++
      ) {
        seen.add(node);
        const e = node as {
          name?: unknown;
          message?: unknown;
          stack?: unknown;
          cause?: unknown;
        };
        out += `${String(e.name)}: ${String(e.message)}\n${
          String(e.stack ?? '')
        }\n`;
        node = e.cause;
      }
      return out;
    };

    it('does not re-insert a credential when the request path contains a `$&` replacement pattern', async () => {
      // The redacted URL echoes the request path verbatim. When that path
      // carries a `$`-special sequence (`$&`, `$$`, `` $` ``, `$'`, `$1`) and
      // the scrub used a *string* replacement, the `$&` in the redacted URL
      // expanded back to the whole match — the raw, credential-bearing URL —
      // re-inserting the secret into the "scrubbed" text.
      const SECRET = 'SECRET-KEY-123';

      class QueryAuthRESTler extends TestRESTler {
        protected override _authInjector(endpoint: RESTlerEndpoint): void {
          endpoint.query = { ...endpoint.query, appid: SECRET };
        }
      }

      const client = new QueryAuthRESTler({
        baseURL: 'http://127.0.0.1:59999',
      });

      let wireUrl = '';
      client.setFetch((input) => {
        wireUrl = String(input);
        const transport = new Error(
          `error sending request for url (${wireUrl}): connection refused`,
        );
        return Promise.reject(
          new TypeError('fetch failed', { cause: transport }),
        );
      });

      let thrown: unknown;
      try {
        // `$&` in the path is the trigger: a string replacement would expand
        // it to the raw matched URL.
        await client.makeRequest({
          path: '/report/$&/data',
          method: 'GET',
          query: { q: 'oslo' },
        });
        asserts.fail('expected the request to reject');
      } catch (error) {
        thrown = error;
      }

      // The real key still reaches the wire, and the trigger really is present.
      asserts.assert(
        wireUrl.includes(SECRET),
        'the API key must reach the wire',
      );
      asserts.assert(
        wireUrl.includes('$&'),
        'the `$&` trigger must survive to the wire URL',
      );

      asserts.assertInstanceOf(thrown, RESTlerRequestError);

      const chainText = deepErrorText(thrown);
      asserts.assert(
        !chainText.includes(SECRET),
        'credential re-inserted via `$&` expansion in the scrubbed cause chain',
      );
      // The raw URL string must be gone entirely, and the redacted form kept.
      asserts.assert(
        !chainText.includes(wireUrl),
        'the raw credentialed URL leaked into the cause chain',
      );
      asserts.assert(
        chainText.includes('appid=[REDACTED]'),
        'the cause chain should retain a redacted URL',
      );
      // The `$&` path segment survives literally in the redacted URL.
      asserts.assert(
        chainText.includes('/report/$&/data'),
        'the `$&` path segment must be preserved literally after redaction',
      );
    });

    it('substitutes a `$&`-containing version literally, not as a replacement directive', () => {
      const client = new TestRESTler({ baseURL: 'https://api.example.com' });
      // A version value carrying `$`-patterns must be inserted verbatim; a
      // string replacement would interpret `$&` (whole match) and `$1` (group).
      asserts.assertEquals(
        client.replaceVersion('/api/{version}/users', '$&$1v2'),
        '/api/$&$1v2/users',
      );
      // `$$` must not collapse to a single `$` either.
      asserts.assertEquals(
        client.replaceVersion('{version}', '$$'),
        '$$',
      );
    });
  });
});
