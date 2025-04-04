import * as asserts from '$asserts';
import { RESTler } from '../RESTler.ts';
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

  public getAuthStatusCodes() {
    return this._authStatus;
  }

  public getRateLimitStatusCodes() {
    return this._rateLimitStatus;
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
    });

    await t.step('validateTimeout', () => {
      asserts.assertEquals(client.validateTimeout(1), true);
      asserts.assertEquals(client.validateTimeout(30), true);
      asserts.assertEquals(client.validateTimeout(60), true);
      asserts.assertEquals(client.validateTimeout(0), false);
      asserts.assertEquals(client.validateTimeout(61), false);
      asserts.assertEquals(client.validateTimeout('10'), false);
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
});
