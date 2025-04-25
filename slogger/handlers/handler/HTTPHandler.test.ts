// deno-lint-ignore-file no-explicit-any
import { HTTPHandler } from './mod.ts';
import * as asserts from '$asserts';
import { SyslogSeverities, type SyslogSeverity } from '@tundralibs/utils';
import { SlogObject } from '../../types/mod.ts';
import { simpleFormatter } from '../../formatters/string.ts';

// Helper to create a standard log object for testing
const makeLogObject = (
  level: SyslogSeverities,
  message: string,
  context: Record<string, unknown> = {},
): SlogObject => ({
  id: '1',
  appName: 'testApp',
  hostname: 'localhost',
  levelName: SyslogSeverities[level] as SyslogSeverity,
  level,
  context,
  message,
  date: new Date('2023-01-01T12:00:00Z'),
  isoDate: new Date('2023-01-01T12:00:00Z').toISOString(),
  timestamp: new Date('2023-01-01T12:00:00Z').getTime(),
});

// Mock fetch function for testing
interface MockFetchCall {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

Deno.test(
  { name: 'Slogger.Handlers.HTTPHandler', permissions: { net: true } },
  async (t) => {
    const originalFetch = globalThis.fetch;
    const mockFetchCalls: MockFetchCall[] = [];

    // Setup mock fetch
    globalThis.fetch = async (
      url: string | URL | Request,
      options?: RequestInit,
    ): Promise<Response> => {
      await 1; // Simulate network delay
      const urlStr = url instanceof Request ? url.url : url.toString();

      // Store the fetch call details
      mockFetchCalls.push({
        url: urlStr,
        method: options?.method || 'GET',
        headers: options?.headers
          ? new Headers(options.headers)
          : new Headers(),
        body: options?.body?.toString() || '',
      });

      // Return a successful response
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    try {
      await t.step('constructor - valid options', () => {
        const handler = new HTTPHandler('testHandler', {
          level: 5,
          url: 'https://example.com/logs',
          method: 'POST',
          batchSize: 10,
          headers: { 'X-API-Key': 'test-key' },
        });

        asserts.assertEquals(handler.name, 'testHandler');
        asserts.assertEquals(handler.level, 5);
        asserts.assertEquals(handler.mode, 'http');
      });

      await t.step('constructor - invalid options', async (t) => {
        await t.step('missing url', () => {
          asserts.assertThrows(
            // @ts-ignore - Testing missing URL
            () =>
              new HTTPHandler('testHandler', {
                level: 5,
                method: 'POST',
                batchSize: 10,
              } as any),
            Error,
            'valid URL',
          );
        });

        await t.step('invalid url', () => {
          asserts.assertThrows(
            () =>
              new HTTPHandler('testHandler', {
                level: 5,
                url: 'invalid-url',
                method: 'POST',
                batchSize: 10,
              } as any),
            Error,
            'Invalid URL',
          );
        });

        await t.step('invalid method', () => {
          asserts.assertThrows(
            // @ts-ignore - Testing invalid method
            () =>
              new HTTPHandler('testHandler', {
                level: 5,
                url: 'https://example.com/logs',
                method: 'GET', // GET is not allowed
                batchSize: 10,
              } as any),
            Error,
            'valid HTTP method',
          );
        });

        await t.step('invalid batchSize', () => {
          asserts.assertThrows(
            () =>
              new HTTPHandler('testHandler', {
                level: 5,
                url: 'https://example.com/logs',
                method: 'POST',
                batchSize: 0, // must be positive
              } as any),
            Error,
            'positive integer',
          );
        });

        await t.step('invalid headers', () => {
          asserts.assertThrows(
            // @ts-ignore - Testing invalid headers
            () =>
              new HTTPHandler('testHandler', {
                level: 5,
                url: 'https://example.com/logs',
                method: 'POST',
                batchSize: 10,
                headers: 'invalid', // should be an object
              } as any),
            Error,
            'valid object',
          );
        });
      });

      await t.step('handle - batches logs', async () => {
        mockFetchCalls.length = 0;

        const handler = new HTTPHandler('testHandler', {
          level: 5,
          url: 'https://example.com/logs',
          method: 'POST',
          batchSize: 2, // Set small batch size for testing
          formatter: simpleFormatter('${message}'),
        } as any);

        // Send first log - shouldn't trigger a fetch yet
        await handler.handle(makeLogObject(5, 'First message'));
        asserts.assertEquals(mockFetchCalls.length, 0);

        // Send second log - should trigger a fetch with both logs
        await handler.handle(makeLogObject(5, 'Second message'));
        asserts.assertEquals(mockFetchCalls.length, 1);

        // Verify the fetch request
        const call = mockFetchCalls[0];
        asserts.assertEquals(call!.url, 'https://example.com/logs');
        asserts.assertEquals(call!.method, 'POST');

        // Verify the body contains both messages
        const body = JSON.parse(call!.body);
        asserts.assert(Array.isArray(body));
        asserts.assertEquals(body.length, 2);
        asserts.assert(body.includes('First message'));
        asserts.assert(body.includes('Second message'));
      });

      await t.step('finalize - sends remaining logs', async () => {
        mockFetchCalls.length = 0;

        const handler = new HTTPHandler('testHandler', {
          level: 5,
          url: 'https://example.com/logs',
          method: 'PUT',
          batchSize: 5, // Larger than the number of logs we'll send
          formatter: simpleFormatter('${message}'),
        } as any);

        // Send one log - shouldn't trigger a fetch yet (batch size not reached)
        await handler.handle(makeLogObject(5, 'Pending message'));
        asserts.assertEquals(mockFetchCalls.length, 0);

        // Finalize should send pending logs
        await handler.finalize();
        asserts.assertEquals(mockFetchCalls.length, 1);

        // Verify the fetch request
        const call = mockFetchCalls[0];
        asserts.assertEquals(call!.method, 'PUT');

        // Verify the body contains the message
        const body = JSON.parse(call!.body);
        asserts.assert(Array.isArray(body));
        asserts.assertEquals(body.length, 1);
        asserts.assert(body.includes('Pending message'));
      });

      await t.step('handle - applies custom headers', async () => {
        mockFetchCalls.length = 0;

        const handler = new HTTPHandler('testHandler', {
          level: 5,
          url: 'https://example.com/logs',
          method: 'PUT',
          batchSize: 1, // Send immediately
          headers: {
            'X-API-Key': 'test-key',
            'X-Custom-Header': 'custom-value',
          },
          formatter: simpleFormatter('${message}'),
        });

        // Send a log to trigger a fetch
        await handler.handle(makeLogObject(5, 'Test headers'));
        asserts.assertEquals(mockFetchCalls.length, 1);

        // Verify headers
        const headers = mockFetchCalls[0]!.headers;
        asserts.assertEquals(headers.get('Content-Type'), 'application/json');
        asserts.assertEquals(headers.get('X-API-Key'), 'test-key');
        asserts.assertEquals(headers.get('X-Custom-Header'), 'custom-value');
      });
    } finally {
      // Restore original fetch
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test({
  name: 'Slogger.Handlers.HTTPHandler - No Permission',
  permissions: { net: false },
}, async (t) => {
  await t.step('Must throw when no permissions', () => {
    asserts.assertThrows(
      () =>
        new HTTPHandler('testHandler', {
          level: 5,
          url: 'https://example.com/logs',
          method: 'POST',
          batchSize: 10,
        }),
      Error,
      'Permission denied',
    );
  });
});
