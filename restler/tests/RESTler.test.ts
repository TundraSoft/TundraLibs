import * as asserts from '$asserts';
import { RESTler } from '../mod.ts';
import {
  RESTlerConfigError,
  RESTlerRequestError,
  RESTlerTimeoutError,
} from '../errors/mod.ts';
import type {
  ResponseBody,
  RESTlerEndpoint,
  RESTlerMethodPayload,
  RESTlerOptions,
  RESTlerRequestOptions,
} from '../types/mod.ts';

// Create a mock for fetch to avoid actual network requests
const originalFetch = globalThis.fetch;
const cleanupMocks = () => {
  globalThis.fetch = originalFetch;
};

// Test implementation of RESTler
class TestRESTler extends RESTler {
  public readonly vendor = 'TestRESTler';

  constructor(options: RESTlerOptions) {
    super(options);
  }

  // Make protected methods public for testing
  public makeRequest<T extends ResponseBody>(
    endpoint: RESTlerEndpoint,
    options: RESTlerMethodPayload & RESTlerRequestOptions,
  ) {
    return this._makeRequest<T>(endpoint, options);
  }

  public processEndpoint(
    endpoint: RESTlerEndpoint,
    options: RESTlerMethodPayload & RESTlerRequestOptions,
  ) {
    const r = this._processEndpoint(endpoint, options);
    return r;
  }

  public replaceVersion(param: string, version?: string) {
    return this._replaceVersion(param, version);
  }

  // Override _authInjector for auth tests
  public authInjector(
    request: RESTlerEndpoint,
    _options: RESTlerMethodPayload & RESTlerRequestOptions,
  ): void {
    request.bearerToken = 'test-token';
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
}

// Mock async authentication injector for testing
class AsyncAuthTestRESTler extends TestRESTler {
  public authCalled = false;

  protected override async _authInjector(
    request: RESTlerEndpoint,
    _options: RESTlerMethodPayload & RESTlerRequestOptions,
  ): Promise<void> {
    // Simulate async auth operation
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.authCalled = true;
    request.bearerToken = 'async-auth-token';
  }
}

Deno.test('RESTler', async (t) => {
  await t.step('constructor option validation', async (t) => {
    await t.step('should create an instance with valid options', () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });
      asserts.assert(client instanceof RESTler);
    });

    await t.step('should throw for invalid baseURL', () => {
      asserts.assertThrows(
        () => new TestRESTler({ baseURL: '' }),
        RESTlerConfigError,
        'Base URL must be a string and not empty',
      );
    });

    await t.step('should throw for invalid baseURL', () => {
      asserts.assertThrows(
        () => new TestRESTler({ baseURL: 'sftp://api.test.org' }),
        RESTlerConfigError,
        'Base URL must be a string and not empty',
      );
    });

    await t.step('should throw for invalid port', () => {
      asserts.assertThrows(
        () =>
          new TestRESTler({
            baseURL: 'https://api.example.com',
            port: 70000,
          }),
        RESTlerConfigError,
        'Port must be a number between 1 and 65535',
      );
    });

    await t.step('should throw for invalid timeout', () => {
      asserts.assertThrows(
        () =>
          new TestRESTler({
            baseURL: 'https://api.example.com',
            timeout: 70,
          }),
        RESTlerConfigError,
        'Timeout must be a number greater than 0 and less than 60',
      );
    });

    await t.step('should throw for invalid contentType', () => {
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

    await t.step('should throw for invalid headers', () => {
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

    await t.step('should throw for invalid socketpath', () => {
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

    await t.step('should throw for invalid certificate config (TLS)', () => {
      asserts.assertThrows(
        () =>
          new TestRESTler({
            baseURL: 'https://api.example.com',
            // deno-lint-ignore no-explicit-any
            tls: 123 as any,
          }),
        RESTlerConfigError,
        'TLS must be a string or an object with certificate and key.',
      );
    });

    await t.step('should throw for invalid certificate config (TLS)', () => {
      asserts.assertThrows(
        () =>
          new TestRESTler({
            baseURL: 'https://api.example.com',
            // deno-lint-ignore no-explicit-any
            tls: {
              certificate: '',
            } as any,
          }),
        RESTlerConfigError,
        'TLS must be a string or an object with certificate and key.',
      );
    });

    await t.step('should throw for invalid version', () => {
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

  await t.step('input validation methods', async (t) => {
    const client = new TestRESTler({
      baseURL: 'https://api.example.com',
    });

    await t.step('validateBaseURL', () => {
      asserts.assert(client.validateBaseURL('https://api.example.com'));
      asserts.assert(client.validateBaseURL('http://localhost:8080'));
      asserts.assert(!client.validateBaseURL(''));
      asserts.assert(!client.validateBaseURL(123));
      asserts.assert(!client.validateBaseURL(null));
    });

    await t.step('validatePort', () => {
      asserts.assertEquals(client.validatePort(80), true);
      asserts.assertEquals(client.validatePort(8080), true);
      asserts.assertEquals(client.validatePort(1), true);
      asserts.assertEquals(client.validatePort(65535), true);
      asserts.assertEquals(client.validatePort(0), false);
      asserts.assertEquals(client.validatePort(65536), false);
      asserts.assertEquals(client.validatePort('80'), false);
      asserts.assertEquals(client.validatePort(undefined), true);
    });

    await t.step('validateTimeout', () => {
      asserts.assertEquals(client.validateTimeout(1), true);
      asserts.assertEquals(client.validateTimeout(30), true);
      asserts.assertEquals(client.validateTimeout(60), true);
      asserts.assertEquals(client.validateTimeout(0), false);
      asserts.assertEquals(client.validateTimeout(61), false);
      asserts.assertEquals(client.validateTimeout('10'), false);
      asserts.assertEquals(client.validateTimeout(undefined), true);
    });

    await t.step('validateContentType', () => {
      asserts.assertEquals(client.validateContentType('JSON'), true);
      asserts.assertEquals(client.validateContentType('XML'), true);
      asserts.assertEquals(client.validateContentType('FORM'), true);
      asserts.assertEquals(client.validateContentType('TEXT'), true);
      asserts.assertEquals(client.validateContentType('BLOB'), true);
      asserts.assertEquals(client.validateContentType('INVALID'), false);
      asserts.assertEquals(client.validateContentType(123), false);
    });

    await t.step('validateHeaders', () => {
      asserts.assert(client.validateHeaders({}));
      asserts.assert(
        client.validateHeaders({ 'Content-Type': 'application/json' }),
      );
      asserts.assert(!client.validateHeaders('invalid'));
      asserts.assert(!client.validateHeaders(123));
    });
  });

  await t.step('baseURL override', async (d) => {
    const client = new TestRESTler({
      baseURL: 'https://api.example.com',
      version: '1',
    });
    await d.step('should override baseURL in endpoint', () => {
      const result = client.processEndpoint({
        baseURL: 'https://api2.example.com',
        path: '/users',
      }, { method: 'GET' });
      asserts.assertEquals(result.url, 'https://api2.example.com/users');
    });

    await d.step('should throw on invalid url', () => {
      asserts.assertThrows(
        () =>
          client.processEndpoint({
            baseURL: 'sftp://api2.example.com',
            path: '/users',
          }, { method: 'GET' }),
        Error,
        'Invalid endpoint baseURL',
      );
    });
  });

  await t.step('version replacement', async (t) => {
    const client = new TestRESTler({
      baseURL: 'https://api.example.com/v{version}',
      version: '2',
    });

    await t.step('should replace {version} in strings', () => {
      const result = client.replaceVersion('path/to/{version}/resource', '1');
      asserts.assertEquals(result, 'path/to/1/resource');
    });

    await t.step('should handle empty version', () => {
      const result = client.replaceVersion('path/to/{version}/resource');
      asserts.assertEquals(result, 'path/to//resource');
    });

    await t.step('should handle strings without {version}', () => {
      const result = client.replaceVersion('path/to/resource', '1');
      asserts.assertEquals(result, 'path/to/resource');
    });

    await t.step('should handle multiple {version} occurrences', () => {
      const result = client.replaceVersion('v{version}/path/{version}', '2');
      asserts.assertEquals(result, 'v2/path/2');
    });
  });

  await t.step('processEndpoint', async (t) => {
    const client = new TestRESTler({
      baseURL: 'https://api.example.com/v{version}',
      version: '2',
      headers: {
        'X-API-Key': 'default-key',
      },
    });

    await t.step('should process basic endpoint', () => {
      const request = client.processEndpoint(
        { path: '/users' },
        { method: 'GET' },
      );
      asserts.assertEquals(request.url, 'https://api.example.com/v2/users');
      asserts.assertEquals(request.method, 'GET');
      asserts.assertEquals(request.headers!['X-API-Key'], 'default-key');
    });

    await t.step('should handle query parameters', () => {
      const request = client.processEndpoint(
        {
          path: '/users',
          query: {
            page: '1',
            limit: '10',
            apiVersion: '{version}',
          },
        },
        { method: 'GET' },
      );

      asserts.assert(request.url.includes('page=1'));
      asserts.assert(request.url.includes('limit=10'));
      asserts.assert(request.url.includes('apiVersion=2'));
    });

    await t.step('should handle bearer token auth', () => {
      const request = client.processEndpoint(
        {
          path: '/users',
          bearerToken: 'token123',
        },
        { method: 'GET' },
      );

      asserts.assertEquals(
        request.headers!['Authorization'],
        'Bearer token123',
      );
    });

    await t.step('should handle basic auth', () => {
      const request = client.processEndpoint(
        {
          path: '/users',
          basicAuth: {
            username: 'user',
            password: 'pass',
          },
        },
        { method: 'GET' },
      );

      asserts.assert(request.headers!['Authorization']!.startsWith('Basic '));
      // Base64 encoded user:pass
      asserts.assertEquals(
        request.headers!['Authorization'],
        'Basic dXNlcjpwYXNz',
      );
      asserts.assertThrows(
        () =>
          client.processEndpoint({
            path: '/users',
            basicAuth: {
              username: 'user',
            },
          } as RESTlerEndpoint, { method: 'GET' }),
        Error,
        'Basic auth requires a username and password',
      );

      asserts.assertThrows(
        () =>
          client.processEndpoint({
            path: '/users',
            basicAuth: {
              password: 'pass',
            },
          } as RESTlerEndpoint, { method: 'GET' }),
        Error,
        'Basic auth requires a username and password',
      );
    });

    await t.step('should handle request-specific headers', () => {
      const request = client.processEndpoint(
        { path: '/users' },
        {
          method: 'GET',
          headers: {
            'X-Custom': 'value',
            'X-Version': 'v{version}',
          },
        },
      );

      asserts.assertEquals(request.headers!['X-Custom'], 'value');
      asserts.assertEquals(request.headers!['X-Version'], 'v2');
      asserts.assertEquals(request.headers!['X-API-Key'], 'default-key');
    });

    await t.step('should handle custom port', () => {
      const request = client.processEndpoint(
        {
          path: '/users',
          port: 8080,
        },
        { method: 'GET' },
      );

      asserts.assert(request.url.includes(':8080/'));
      asserts.assertThrows(
        () =>
          client.processEndpoint(
            {
              path: '/users',
              port: 70000,
            },
            { method: 'GET' },
          ),
        Error,
        'Invalid port',
      );
      asserts.assertThrows(
        () =>
          client.processEndpoint(
            {
              path: '/users',
              port: 341n,
            } as unknown as RESTlerEndpoint,
            { method: 'GET' },
          ),
        Error,
        'Invalid port',
      );
      asserts.assertThrows(
        () =>
          client.processEndpoint(
            {
              path: '/users',
              port: 'df',
            } as unknown as RESTlerEndpoint,
            { method: 'GET' },
          ),
        Error,
        'Invalid port',
      );
    });

    await t.step('should override baseURL', () => {
      const req = client.processEndpoint({
        baseURL: 'https://api.example.com',
        path: '/users',
      }, { method: 'GET' });
      asserts.assertEquals(req.url, 'https://api.example.com/users');
    });
  });

  await t.step('HTTP request methods', async (t) => {
    await t.step('should make a GET request', async () => {
      try {
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

        // Mock fetch response
        globalThis.fetch = async () => {
          await 1;
          return new Response(
            JSON.stringify({ id: 1, name: 'Test User' }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        };

        const client = new EventTrackingRESTler({
          baseURL: 'https://api.example.com',
        });

        const response = await client.makeRequest<{ id: number; name: string }>(
          { path: '/users/1' },
          { method: 'GET' },
        );

        asserts.assertEquals(response.status, 200);
        asserts.assert(response.body);
        asserts.assertEquals(response.body.id, 1);
        asserts.assertEquals(response.body.name, 'Test User');
        asserts.assert(response.timeTaken > 0);

        // Check event was emitted
        asserts.assertEquals(emittedEvents.length, 1);
        asserts.assertEquals(emittedEvents[0]!.vendor, 'TestRESTler');
      } finally {
        cleanupMocks();
      }
    });

    await t.step('should make a POST request with JSON body', async () => {
      try {
        const requestData = {
          method: '',
          headers: {} as Record<
            string,
            string
          >,
          body: '',
        };

        // Configure mock response
        globalThis.fetch = async (_input, init) => {
          await 1;
          // Store request data for assertions
          requestData.method = init?.method || '';
          if (init?.headers instanceof Headers) {
            requestData.headers = Object.fromEntries(
              init.headers.entries(),
            );
          }
          requestData.body = init?.body as string;

          return new Response(
            JSON.stringify({ id: 2, name: 'New User' }),
            {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        };

        const client = new TestRESTler({
          baseURL: 'https://api.example.com',
        });

        const userData = { name: 'New User', email: 'user@example.com' };
        const response = await client.makeRequest<{ id: number; name: string }>(
          { path: '/users' },
          {
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
      } finally {
        cleanupMocks();
      }
    });

    await t.step('should handle network errors', async () => {
      try {
        globalThis.fetch = async () => {
          await 1;
          throw new Error('Network error');
        };

        const client = new TestRESTler({
          baseURL: 'https://api.example.com',
        });

        await asserts.assertRejects(
          async () =>
            await client.makeRequest(
              { path: '/users' },
              { method: 'GET' },
            ),
          RESTlerRequestError,
          'Unknown error processing the request',
        );
      } finally {
        cleanupMocks();
      }
    });

    await t.step('should handle timeout errors', async () => {
      try {
        globalThis.fetch = async () => {
          await 1;
          const error = new Error('Timeout');
          error.name = 'AbortError';
          throw error;
        };

        const client = new TestRESTler({
          baseURL: 'https://api.example.com',
        });

        await asserts.assertRejects(
          async () =>
            await client.makeRequest(
              { path: '/users' },
              { method: 'GET' },
            ),
          RESTlerTimeoutError,
        );
      } finally {
        cleanupMocks();
      }
    });

    await t.step('should handle non-JSON responses', async () => {
      try {
        globalThis.fetch = async () => {
          await 1;
          return new Response(
            'Plain text response',
            {
              status: 200,
              headers: { 'Content-Type': 'text/plain' },
            },
          );
        };

        const client = new TestRESTler({
          baseURL: 'https://api.example.com',
        });

        const response = await client.makeRequest(
          { path: '/text' },
          { method: 'GET' },
        );

        asserts.assertEquals(response.status, 200);
        asserts.assertEquals(response.body, 'Plain text response');
      } finally {
        cleanupMocks();
      }
    });

    await t.step('should handle XML responses', async () => {
      try {
        globalThis.fetch = async () => {
          await 1;
          return new Response(
            '<response><status>success</status><data id="1">Test</data></response>',
            {
              status: 200,
              headers: { 'Content-Type': 'application/xml' },
            },
          );
        };

        const client = new TestRESTler({
          baseURL: 'https://api.example.com',
        });

        const response = await client.makeRequest(
          { path: '/xml' },
          { method: 'GET' },
        );

        asserts.assert(response.body);
        asserts.assert(typeof response.body === 'object');
        // deno-lint-ignore no-explicit-any
        asserts.assertEquals((response.body as any).response.status, 'success');
      } finally {
        cleanupMocks();
      }
    });

    await t.step('should emit authFailure event ', async () => {
      try {
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
        globalThis.fetch = async () => {
          await 1;
          return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            {
              status: authStatusCodes[0],
              headers: { 'Content-Type': 'application/json' },
            },
          );
        };

        // Make the request
        await testClient.makeRequest(
          { path: '/secure-resource' },
          { method: 'GET' },
        ).catch(() => {}); // We expect this might throw, but we only care about the event

        // Verify the event was emitted
        asserts.assertEquals(authFailureEmitted, true);
        asserts.assertNotEquals(emittedRequest, null);
        asserts.assertNotEquals(emittedResponse, null);

        // Verify the response has the expected status code
        asserts.assertEquals(emittedResponse!.status, authStatusCodes[0]);
      } finally {
        cleanupMocks();
      }
    });

    await t.step('should emit rateLimit event', async () => {
      try {
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
        globalThis.fetch = async () => {
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
        };

        // Make the request
        await testClient.makeRequest(
          { path: '/api-with-rate-limits' },
          { method: 'GET' },
        ).catch(() => {}); // We expect this might throw, but we only care about the event

        // Verify the event was emitted
        asserts.assertEquals(rateLimitEmitted, true);
        asserts.assertEquals(emittedVendor, 'TestRESTler');

        // Verify the rate limit values were correctly extracted
        asserts.assertEquals(emittedLimit, 100);
        asserts.assertEquals(emittedReset, 1618884400);
        asserts.assertEquals(emittedRemaining, 0);
      } finally {
        cleanupMocks();
      }
    });

    await t.step('should capture alternate rate limit headers', async () => {
      try {
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
        globalThis.fetch = async () => {
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
        };

        // Reset tracking variables
        rateLimitEmitted = false;
        emittedLimit = undefined;

        // Make the request
        await testClient.makeRequest(
          { path: '/api-with-rate-limits' },
          { method: 'GET' },
        ).catch(() => {});

        // Verify the event was emitted with the correct value
        asserts.assertEquals(rateLimitEmitted, true);
        asserts.assertEquals(emittedLimit, 200);
      } finally {
        cleanupMocks();
      }
    });
  });

  await t.step('authentication', async (t) => {
    await t.step('should add authentication via _authInjector', async () => {
      try {
        const requestData = {
          headers: {} as Record<string, string>,
        };

        globalThis.fetch = async (_input, init) => {
          await 1;
          // Store headers for assertions
          if (init?.headers instanceof Headers) {
            requestData.headers = Object.fromEntries(
              Array.from(init.headers.entries()),
            );
          }

          return new Response(
            JSON.stringify({ authenticated: true }),
            { status: 200 },
          );
        };

        class AuthTestRESTler extends TestRESTler {
          protected override _authInjector(
            request: RESTlerEndpoint,
            _options: RESTlerMethodPayload & RESTlerRequestOptions,
          ): void {
            // Add auth header to all requests
            request.bearerToken = 'auth-token-123';
          }
        }

        const client = new AuthTestRESTler({
          baseURL: 'https://api.example.com',
        });

        await client.makeRequest(
          { path: '/secure' },
          { method: 'GET' },
        );

        asserts.assertEquals(
          requestData.headers['authorization'],
          'Bearer auth-token-123',
        );
      } finally {
        cleanupMocks();
      }
    });
  });

  await t.step('additional validation methods', async (d) => {
    const client = new TestRESTler({
      baseURL: 'https://api.example.com',
    });

    await d.step('validateSocketPath', async () => {
      // Create a temp file for testing socket path
      const tempFilePath = await Deno.makeTempFile();
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
          Deno.removeSync(tempFilePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    await d.step('validateTls', async () => {
      // Create temp files for certificate and key
      const certPath = await Deno.makeTempFile();
      const keyPath = await Deno.makeTempFile();
      try {
        // Test string path
        asserts.assert(client.validateTls(certPath));

        // Test object with cert and key
        asserts.assert(client.validateTls({
          certificate: certPath,
          key: keyPath,
        }));

        // Test invalid values
        asserts.assert(!client.validateTls('/nonexistent/path'));
        asserts.assert(
          !client.validateTls({
            certificate: '/nonexistent/cert',
            key: '/nonexistent/key',
          }),
        );
        asserts.assert(!client.validateTls(123));
        asserts.assert(!client.validateTls({}));
        asserts.assert(
          !client.validateTls({
            certificate: 'missing-key',
          }),
        );
      } finally {
        // Clean up
        try {
          Deno.removeSync(certPath);
          Deno.removeSync(keyPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  });

  await t.step('response parsing', async (d) => {
    const client = new TestRESTler({
      baseURL: 'https://api.example.com',
    });

    await d.step('should parse JSON responses correctly', () => {
      const jsonBody = '{"id":1,"name":"Test"}';
      const result = client.parseResponseBody<{ id: number; name: string }>(
        jsonBody,
        'application/json',
      );
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'Test');
    });

    await d.step('should parse XML responses correctly', () => {
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

    await d.step('should handle text responses', () => {
      const textBody = 'Plain text response';
      const result = client.parseResponseBody(textBody, 'text/plain');
      asserts.assertEquals(result, 'Plain text response');
    });

    await d.step('should handle missing content type', () => {
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

    await d.step('should handle invalid JSON', () => {
      const invalidJson = '{id:1,name:"Test"}'; // Missing quotes around property names
      const result = client.parseResponseBody(invalidJson, 'application/json');
      asserts.assertEquals(result, invalidJson); // Returns raw text when parsing fails
    });

    await d.step('should handle invalid XML', () => {
      const invalidXml = '<root><item>No closing tag</root>';
      const result = client.parseResponseBody(invalidXml, 'application/xml');
      asserts.assertEquals(result, invalidXml); // Returns raw text when parsing fails
    });
  });

  await t.step('URL construction edge cases', async (d) => {
    await d.step('should handle empty path', () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      const request = client.processEndpoint(
        { path: '' },
        { method: 'GET' },
      );

      asserts.assertEquals(request.url, 'https://api.example.com/');
    });

    await d.step('should handle baseURL with trailing slash', () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com/',
      });

      const request = client.processEndpoint(
        { path: '/users' },
        { method: 'GET' },
      );

      asserts.assertEquals(request.url, 'https://api.example.com/users');
    });

    await d.step('should handle custom baseURL in endpoint', () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      const request = client.processEndpoint(
        {
          baseURL: 'https://different-api.example.com',
          path: '/users',
        },
        { method: 'GET' },
      );

      asserts.assertEquals(
        request.url,
        'https://different-api.example.com/users',
      );
    });

    await d.step('should handle complex query parameters', () => {
      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      const request = client.processEndpoint(
        {
          path: '/search',
          query: {
            q: 'test query',
            filter: 'category=test&status=active', // Will be properly encoded
            special: '#$&+,/:;=?@[]',
          },
        },
        { method: 'GET' },
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

  await t.step('header extraction', async (d) => {
    const client = new TestRESTler({
      baseURL: 'https://api.example.com',
    });

    await d.step('should extract header with exact match', () => {
      const headers = {
        'x-rate-limit': '100',
        'content-type': 'application/json',
      };

      const result = client.extractHeaderNumber(headers, 'x-rate-limit');
      asserts.assertEquals(result, 100);
    });

    await d.step('should extract header with case-insensitive match', () => {
      const headers = {
        'X-Rate-Limit': '100',
        'Content-Type': 'application/json',
      };

      const result = client.extractHeaderNumber(headers, 'x-rate-limit');
      asserts.assertEquals(result, 100);
    });

    await d.step('should try alternative header names', () => {
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

    await d.step('should return undefined for missing headers', () => {
      const headers = {
        'content-type': 'application/json',
      };

      const result = client.extractHeaderNumber(headers, 'x-rate-limit');
      asserts.assertEquals(result, undefined);
    });

    await d.step(
      'should return undefined for non-numeric header values',
      () => {
        const headers = {
          'x-rate-limit': 'unlimited',
        };

        const result = client.extractHeaderNumber(headers, 'x-rate-limit');
        asserts.assertEquals(result, undefined);
      },
    );

    await d.step('should handle undefined headers', () => {
      const result = client.extractHeaderNumber(undefined, 'x-rate-limit');
      asserts.assertEquals(result, undefined);
    });
  });

  await t.step('request with different content types', async (d) => {
    await d.step('should make request with XML payload', async () => {
      try {
        let capturedBody = '';

        globalThis.fetch = async (_input, init) => {
          await 1;
          capturedBody = init?.body as string || '';

          return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        };

        const client = new TestRESTler({
          baseURL: 'https://api.example.com',
        });

        const xmlData = { root: { item: { id: 1, name: 'Test' } } };
        await client.makeRequest(
          { path: '/xml-endpoint' },
          {
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
      } finally {
        cleanupMocks();
      }
    });

    await d.step('should make request with form data', async () => {
      try {
        let capturedContentType = '';
        let capturedBody: any;

        globalThis.fetch = async (_input, init) => {
          await 1;
          if (init?.headers instanceof Headers) {
            const ct = init.headers.get('Content-Type');
            capturedContentType = ct || '';
          }
          capturedBody = init?.body as FormData || '';

          return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        };

        const client = new TestRESTler({
          baseURL: 'https://api.example.com',
        });

        const formData = new FormData();
        formData.append('username', 'testuser');
        formData.append('password', 'password123');

        await client.makeRequest(
          { path: '/login' },
          {
            method: 'POST',
            contentType: 'FORM',
            payload: formData,
          },
        );

        // The headers should NOT have a Content-Type because fetch will set it with the boundary
        asserts.assertEquals(capturedContentType, '');

        // Verify it's a FormData object
        asserts.assertEquals(capturedBody instanceof FormData, true);
      } finally {
        cleanupMocks();
      }
    });

    await d.step('should make request with URL-encoded form data', async () => {
      try {
        let capturedBody = '';

        globalThis.fetch = async (_input, init) => {
          await 1;
          capturedBody = init?.body as string || '';

          return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        };

        const client = new TestRESTler({
          baseURL: 'https://api.example.com',
        });

        await client.makeRequest(
          { path: '/login' },
          {
            method: 'POST',
            contentType: 'FORM',
            payload: {
              username: 'testuser',
              password: 'password123',
            },
          },
        );

        // Check if form data was properly encoded
        asserts.assertEquals(
          capturedBody as unknown as Record<string, string>,
          { username: 'testuser', password: 'password123' },
        );
      } finally {
        cleanupMocks();
      }
    });

    await d.step('should make request with text payload', async () => {
      try {
        let capturedBody = '';

        globalThis.fetch = async (_input, init) => {
          await 1;
          capturedBody = init?.body as string || '';

          return new Response(
            'Response text',
            { status: 200, headers: { 'Content-Type': 'text/plain' } },
          );
        };

        const client = new TestRESTler({
          baseURL: 'https://api.example.com',
        });

        await client.makeRequest(
          { path: '/text-endpoint' },
          {
            method: 'POST',
            contentType: 'TEXT',
            payload: 'Hello world',
          },
        );

        asserts.assertEquals(capturedBody, 'Hello world');
      } finally {
        cleanupMocks();
      }
    });
  });

  await t.step('async authentication', async (d) => {
    await d.step(
      'should wait for async authentication to complete',
      async () => {
        try {
          const requestData = {
            headers: {} as Record<string, string>,
          };

          globalThis.fetch = async (_input, init) => {
            await 1;
            // Store headers for assertions
            if (init?.headers instanceof Headers) {
              requestData.headers = Object.fromEntries(
                Array.from(init.headers.entries()),
              );
            }

            return new Response(
              JSON.stringify({ authenticated: true }),
              { status: 200 },
            );
          };

          const client = new AsyncAuthTestRESTler({
            baseURL: 'https://api.example.com',
          });

          await client.makeRequest(
            { path: '/secure' },
            { method: 'GET' },
          );

          // Check that auth was called
          asserts.assertEquals(client.authCalled, true);

          // Check that the token was set
          asserts.assertEquals(
            requestData.headers['authorization'],
            'Bearer async-auth-token',
          );
        } finally {
          cleanupMocks();
        }
      },
    );
  });

  // Add these new test sections after the existing tests
  await t.step('TLS configuration', async (d) => {
    await d.step(
      'should create an HTTP client with TLS configuration',
      async () => {
        try {
          // Store the original createHttpClient function
          const originalCreateHttpClient = Deno.createHttpClient;

          // Track if createHttpClient was called and with what parameters
          let createHttpClientCalled = false;
          let createHttpClientParams: any = null;

          // Mock Deno.createHttpClient
          Deno.createHttpClient = (options: any) => {
            createHttpClientCalled = true;
            createHttpClientParams = options;

            // Return a mock client
            return {
              close: () => {},
            } as Deno.HttpClient;
          };

          // Mock fetch
          globalThis.fetch = async () => {
            await 1;
            return new Response(
              JSON.stringify({ success: true }),
              { status: 200 },
            );
          };

          try {
            // Create client with TLS cert path
            const certClient = new TestRESTler({
              baseURL: 'https://api.example.com',
              tls: './restler/tests/fixtures/cert.pem',
            });

            // Make request to trigger TLS client creation
            await certClient.makeRequest(
              { path: '/secure' },
              { method: 'GET' },
            );

            // Verify client was created with the right params
            asserts.assertEquals(createHttpClientCalled, true);
            asserts.assert(createHttpClientParams.caCerts.length === 1);
            asserts.assertEquals(
              createHttpClientParams.caCerts[0],
              'Mock content for cert-key',
            );

            // Reset tracking
            createHttpClientCalled = false;
            createHttpClientParams = null;
            // Create client with certificate and key
            const keyPairClient = new TestRESTler({
              baseURL: 'https://api.example.com',
              tls: {
                certificate: './restler/tests/fixtures/cert.pem',
                key: './restler/tests/fixtures/key.pem',
              },
            });

            // Make request to trigger TLS client creation
            await keyPairClient.makeRequest(
              { path: '/secure' },
              { method: 'GET' },
            );

            // Verify client was created with the right params
            asserts.assertEquals(createHttpClientCalled, true);
            asserts.assertEquals(
              createHttpClientParams.cert,
              'Mock content for cert-key',
            );
            asserts.assertEquals(
              createHttpClientParams.key,
              'Mock content for cert-key',
            );
          } finally {
            // Restore original functions
            Deno.createHttpClient = originalCreateHttpClient;
          }
        } finally {
          cleanupMocks();
        }
      },
    );
  });

  await t.step('Request timeout', async (d) => {
    await d.step('should timeout when response takes too long', async () => {
      // Create a flag to ensure the fake timeout is triggered
      let timeoutTriggered = false;

      const originalSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = (
        callback: (...args: any[]) => void,
        _timeout?: number,
        ...args: any[]
      ) => {
        // Immediately execute the abort callback
        timeoutTriggered = true;
        callback(...args);
        return 0 as unknown as number;
      };

      // Mock fetch to throw AbortError when signal.aborted is true
      globalThis.fetch = async (_input, init) => {
        // If the signal is aborted, throw an AbortError
        if (init?.signal?.aborted) {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          throw error;
        }

        // This should never be reached in this test
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200 },
        );
      };

      const client = new TestRESTler({
        baseURL: 'https://api.example.com',
      });

      try {
        // Request with timeout should now fail
        await client.makeRequest(
          { path: '/delayed' },
          {
            method: 'GET',
            timeout: 1, // 1 second timeout (will be immediate due to mocked setTimeout)
          },
        );
        asserts.fail('Request should have timed out but did not');
      } catch (error) {
        // Verify the error is the expected timeout error
        asserts.assert(error instanceof RESTlerTimeoutError);
        // Verify timeout was triggered
        asserts.assert(timeoutTriggered);
      } finally {
        // Restore original setTimeout
        if (globalThis.setTimeout !== originalSetTimeout) {
          globalThis.setTimeout = originalSetTimeout;
        }
        cleanupMocks();
      }
    });

    await d.step(
      'should not timeout when response is fast enough',
      async () => {
        try {
          // Mock fetch to return quickly
          globalThis.fetch = async () => {
            // Return immediately
            return new Response(
              JSON.stringify({ success: true }),
              { status: 200 },
            );
          };

          const client = new TestRESTler({
            baseURL: 'https://api.example.com',
          });

          // Request with 1 second timeout should succeed
          const response = await client.makeRequest(
            { path: '/fast' },
            {
              method: 'GET',
              timeout: 1,
            },
          );

          asserts.assertEquals(response.status, 200);
        } finally {
          cleanupMocks();
        }
      },
    );
  });

  await t.step(
    'Unix socket request with different content types',
    async (d) => {
      // Create mock class that exposes _makeUnixSocketRequest and _communicateWithUnixSocket
      class UnixSocketTestRESTler extends TestRESTler {
        // Track the last socket request
        public lastSocketRequest: string = '';

        // Override socket communication to capture the request and return a mock response
        protected override async _communicateWithUnixSocket(
          requestData: string,
        ): Promise<string> {
          // Store the request for assertions
          this.lastSocketRequest = requestData;

          // Return a mock HTTP response
          return [
            'HTTP/1.1 200 OK',
            'Content-Type: application/json',
            'Connection: close',
            'Content-Length: 16',
            '',
            '{"success":true}',
          ].join('\r\n');
        }

        // Make the protected method public for testing
        public makeUnixSocketRequest(request: any) {
          return this._makeUnixSocketRequest(request);
        }

        protected override _validateSocketPath(
          value: unknown,
        ): value is RESTlerOptions['socketPath'] {
          return true;
        }
      }

      await d.step('should send JSON payload via Unix socket', async () => {
        // Create a client with socketPath option
        const client = new UnixSocketTestRESTler({
          baseURL: 'http://localhost',
          socketPath: '/tmp/mock.sock', // Will be mocked, doesn't need to exist
        });

        // Make a request with JSON payload
        await client.makeUnixSocketRequest({
          url: 'http://localhost/api',
          method: 'POST',
          headers: {},
          timeout: 10,
          contentType: 'JSON',
          payload: { name: 'Test', value: 123 },
        });

        // Verify the request format
        asserts.assert(
          client.lastSocketRequest.includes(
            'POST http://localhost/api HTTP/1.1',
          ),
        );
        asserts.assert(
          client.lastSocketRequest.includes('Content-Type: application/json'),
        );
        asserts.assert(
          client.lastSocketRequest.includes('{"name":"Test","value":123}'),
        );
      });

      await d.step('should send XML payload via Unix socket', async () => {
        // Create a client with socketPath option
        const client = new UnixSocketTestRESTler({
          baseURL: 'http://localhost',
          socketPath: '/tmp/mock.sock',
        });

        // Make a request with XML payload
        await client.makeUnixSocketRequest({
          url: 'http://localhost/api',
          method: 'POST',
          headers: {},
          timeout: 10,
          contentType: 'XML',
          payload: { root: { item: { id: 1, name: 'Test' } } },
        });

        // Verify the request format
        asserts.assert(
          client.lastSocketRequest.includes(
            'POST http://localhost/api HTTP/1.1',
          ),
        );
        asserts.assert(
          client.lastSocketRequest.includes('Content-Type: application/xml'),
        );
        asserts.assert(client.lastSocketRequest.includes('<root>'));
        asserts.assert(client.lastSocketRequest.includes('<item>'));
        asserts.assert(client.lastSocketRequest.includes('<id>1</id>'));
        asserts.assert(client.lastSocketRequest.includes('<name>Test</name>'));
      });

      await d.step('should send form data via Unix socket', async () => {
        // Create a client with socketPath option
        const client = new UnixSocketTestRESTler({
          baseURL: 'http://localhost',
          socketPath: '/tmp/mock.sock',
        });

        // Make a request with form data
        await client.makeUnixSocketRequest({
          url: 'http://localhost/api',
          method: 'POST',
          headers: {},
          timeout: 10,
          contentType: 'FORM',
          payload: {
            username: 'testuser',
            password: 'pass123',
          },
        });

        // Verify the request format
        asserts.assert(
          client.lastSocketRequest.includes(
            'POST http://localhost/api HTTP/1.1',
          ),
        );
        asserts.assert(
          client.lastSocketRequest.includes(
            'Content-Type: application/x-www-form-urlencoded',
          ),
        );
        asserts.assert(
          client.lastSocketRequest.includes(
            'username=testuser&password=pass123',
          ),
        );
      });

      await d.step('should send text payload via Unix socket', async () => {
        // Create a client with socketPath option
        const client = new UnixSocketTestRESTler({
          baseURL: 'http://localhost',
          socketPath: '/tmp/mock.sock',
        });

        // Make a request with text payload
        await client.makeUnixSocketRequest({
          url: 'http://localhost/api',
          method: 'POST',
          headers: {},
          timeout: 10,
          contentType: 'TEXT',
          payload: 'Hello, world!',
        });

        // Verify the request format
        asserts.assert(
          client.lastSocketRequest.includes(
            'POST http://localhost/api HTTP/1.1',
          ),
        );
        asserts.assert(
          client.lastSocketRequest.includes('Content-Type: text/plain'),
        );
        asserts.assert(client.lastSocketRequest.includes('Hello, world!'));
      });

      await d.step(
        'should handle chunked response from Unix socket',
        async () => {
          class ChunkedResponseTestRESTler extends UnixSocketTestRESTler {
            protected override async _communicateWithUnixSocket(): Promise<
              string
            > {
              // Return a mock chunked HTTP response
              return [
                'HTTP/1.1 200 OK',
                'Content-Type: application/json',
                'Transfer-Encoding: chunked',
                'Connection: close',
                '',
                '7', // Chunk size in hex (7 bytes)
                '{"name"', // First chunk
                '8', // Chunk size (8 bytes)
                ':"Test"}', // Second chunk
                '0', // End of chunks
                '',
                '',
              ].join('\r\n');
            }
          }

          // Create a client with socketPath option
          const client = new ChunkedResponseTestRESTler({
            baseURL: 'http://localhost',
            socketPath: '/tmp/mock.sock',
          });

          // Make a request
          const response = await client.makeUnixSocketRequest(
            {
              url: 'http://localhost/api',
              method: 'GET',
              headers: {},
              timeout: 10,
            },
          );

          // Verify chunked response was decoded properly
          asserts.assertEquals(response.status, 200);
          asserts.assertEquals(
            (response.body! as { name: string }).name,
            'Test',
          );
        },
      );

      await d.step(
        'should handle errors in Unix socket communication',
        async () => {
          class ErroringSocketTestRESTler extends UnixSocketTestRESTler {
            protected override async _communicateWithUnixSocket(): Promise<
              string
            > {
              throw new Error('Socket connection failed');
            }
          }

          // Create a client with socketPath option
          const client = new ErroringSocketTestRESTler({
            baseURL: 'http://localhost',
            socketPath: '/tmp/mock.sock',
          });

          // Make a request that should fail
          await asserts.assertRejects(
            async () => {
              await client.makeUnixSocketRequest({
                url: 'http://localhost/api',
                method: 'GET',
                headers: {},
                timeout: 10,
              });
            },
            RESTlerRequestError,
            'Error communicating with Unix socket',
          );
        },
      );
    },
  );
});
