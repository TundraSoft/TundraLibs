// deno-lint-ignore-file no-explicit-any
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { WebServer } from '@tundralibs/compat/webserver';
import { HTTPHandler } from './HTTPHandler.ts';
import { SyslogSeverities, type SyslogSeverity } from '@tundralibs/utils';
import { SlogObject } from '../../types/mod.ts';
import { simpleFormatter } from '../../formatters/string.ts';
import { SloggerConfigError, SloggerHandlerError } from '../../errors/mod.ts';

// Cross-runtime port allocation for the live HTTP tests below.
let __port = 29200;
const nextPort = (): number => __port++;

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

// Test double that prevents actual network calls
class TestHTTPHandler extends HTTPHandler {
  public sendLogsCalled = false;
  public lastSentLogs: string[] = [];

  protected override async _sendLogs(): Promise<void> {
    this.sendLogsCalled = true;
    this.lastSentLogs = [...this._logs];
    this._logs = []; // Clear logs as the real implementation does
  }
}

describe({
  name: 'slogger.handlers.httpHandler',
  permissions: { net: true },
  fn: () => {
    it('constructor - valid options', () => {
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

    describe('constructor - invalid options', () => {
      it('missing url', () => {
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

      it('invalid url', () => {
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

      it('invalid method', () => {
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

      it('invalid batchSize', () => {
        asserts.assertThrows(
          () =>
            new HTTPHandler('testHandler', {
              level: 5,
              url: 'https://example.com/logs',
              method: 'POST',
              batchSize: 0, // must be positive
            } as any),
          SloggerConfigError,
          'positive integer',
        );
      });

      it('invalid maxBufferSize', () => {
        asserts.assertThrows(
          () =>
            new HTTPHandler('testHandler', {
              level: 5,
              url: 'https://example.com/logs',
              method: 'POST',
              batchSize: 10,
              maxBufferSize: 0, // must be positive
            } as any),
          SloggerConfigError,
          'maxBufferSize must be a positive integer',
        );

        asserts.assertThrows(
          () =>
            new HTTPHandler('testHandler', {
              level: 5,
              url: 'https://example.com/logs',
              method: 'POST',
              batchSize: 10,
              maxBufferSize: 2.5, // must be an integer
            } as any),
          SloggerConfigError,
          'maxBufferSize must be a positive integer',
        );
      });

      it('maxBufferSize smaller than batchSize', () => {
        asserts.assertThrows(
          () =>
            new HTTPHandler('testHandler', {
              level: 5,
              url: 'https://example.com/logs',
              method: 'POST',
              batchSize: 10,
              maxBufferSize: 5, // a full batch could never accumulate
            } as any),
          SloggerConfigError,
          'maxBufferSize must be greater than or equal to batchSize',
        );
      });

      it('invalid headers', () => {
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

    it('handle - batches logs', async () => {
      const handler = new TestHTTPHandler('testHandler', {
        level: 5,
        url: 'https://example.com/logs',
        method: 'POST',
        batchSize: 2, // Set small batch size for testing
        formatter: simpleFormatter('${message}'),
      } as any);

      // Send first log - shouldn't trigger a send yet
      await handler.handle(makeLogObject(5, 'First message'));
      // @ts-ignore - Access protected property for testing
      asserts.assertEquals(handler._logs.length, 1);
      asserts.assertEquals(handler.sendLogsCalled, false);

      // Send second log - should trigger batch send (queue cleared)
      await handler.handle(makeLogObject(5, 'Second message'));
      // After batch send, queue should be empty
      // @ts-ignore
      asserts.assertEquals(handler._logs.length, 0);
      asserts.assertEquals(handler.sendLogsCalled, true);
      asserts.assertEquals(handler.lastSentLogs.length, 2);
      asserts.assert(handler.lastSentLogs[0]!.includes('First message'));
      asserts.assert(handler.lastSentLogs[1]!.includes('Second message'));
    });

    it('finalize - sends remaining logs', async () => {
      const handler = new TestHTTPHandler('testHandler', {
        level: 5,
        url: 'https://example.com/logs',
        method: 'PUT',
        batchSize: 5, // Larger than the number of logs we'll send
        formatter: simpleFormatter('${message}'),
      } as any);

      // Send one log - shouldn't trigger a send yet (batch size not reached)
      await handler.handle(makeLogObject(5, 'Pending message'));
      // @ts-ignore - Access protected property for testing
      asserts.assertEquals(handler._logs.length, 1);
      asserts.assertEquals(handler.sendLogsCalled, false);

      // Finalize should send pending logs (clearing the queue)
      await handler.finalize();
      // @ts-ignore
      asserts.assertEquals(handler._logs.length, 0);
      asserts.assertEquals(handler.sendLogsCalled, true);
      asserts.assertEquals(handler.lastSentLogs.length, 1);
      asserts.assert(handler.lastSentLogs[0]!.includes('Pending message'));
    });

    it('handle - stores headers correctly', async () => {
      const handler = new HTTPHandler('testHandler', {
        level: 5,
        url: 'https://example.com/logs',
        method: 'PUT',
        batchSize: 10, // Don't trigger send during test
        headers: {
          'X-API-Key': 'test-key',
          'X-Custom-Header': 'custom-value',
        },
        formatter: simpleFormatter('${message}'),
      });

      // Verify handler was created with headers
      // @ts-ignore - Access private property for testing
      asserts.assertEquals(handler.__headers['X-API-Key'], 'test-key');
      asserts.assertEquals(
        // @ts-ignore - Access private property for testing
        handler.__headers['X-Custom-Header'],
        'custom-value',
      );

      // Send a log to verify batching works with headers
      await handler.handle(makeLogObject(5, 'Test headers'));
      // @ts-ignore
      asserts.assertEquals(handler._logs.length, 1);
    });
  },
});

describe({
  name: 'slogger.handlers.httpHandler - Invalid Permissions',
  permissions: { net: false },
  deno: true, // Permission checks only work in Deno
  bun: false,
  node: false,
  fn: () => {
    it('Must throw when no permissions', () => {
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
  },
});

describe({
  name: 'slogger.handlers.httpHandler - real _sendLogs',
  permissions: { net: true },
  sanitizeResources: false, // fetch response bodies from _sendLogs may be unconsumed
  fn: () => {
    it('should call _sendLogs and send actual HTTP POST with custom headers', async () => {
      let receivedBody: unknown = null;
      let receivedHeaders: Record<string, string> = {};

      const port = nextPort();
      const server = new WebServer('slogger-http-test', {
        mode: 'TCP',
        port,
        hostname: '127.0.0.1',
        handler: async (req) => {
          receivedHeaders = Object.fromEntries(req.headers.entries());
          receivedBody = await req.json();
          return new Response('ok', { status: 200 });
        },
      });
      await server.start();
      const url = `http://127.0.0.1:${port}/logs`;

      const handler = new HTTPHandler('realSend', {
        level: 5,
        url,
        method: 'POST',
        batchSize: 1, // Send immediately on first log
        headers: { 'X-Test-Header': 'real-send' },
      });

      await handler.handle(makeLogObject(5, 'real send test'));

      // Allow time for async send
      await new Promise((r) => setTimeout(r, 100));

      await server.stop(false);

      asserts.assert(Array.isArray(receivedBody), 'Body should be an array');
      asserts.assertStrictEquals(
        receivedHeaders['x-test-header'],
        'real-send',
      );
    });

    it('preserves the batch for retry when the request fails (non-2xx)', async () => {
      let calls = 0;
      let firstBodyLen = 0;
      let secondBodyLen = 0;
      const port = nextPort();
      const server = new WebServer('slogger-http-test-retry', {
        mode: 'TCP',
        port,
        hostname: '127.0.0.1',
        handler: async (req) => {
          calls++;
          const body = (await req.json()) as unknown[];
          if (calls === 1) {
            firstBodyLen = body.length;
            // First attempt fails — handler must NOT drop the batch.
            return new Response('boom', { status: 500 });
          }
          secondBodyLen = body.length;
          return new Response('ok', { status: 200 });
        },
      });
      await server.start();
      const url = `http://127.0.0.1:${port}/logs`;

      const handler = new HTTPHandler('retry', {
        level: 5,
        url,
        method: 'POST',
        batchSize: 1, // flush on each log
        formatter: simpleFormatter('${message}'),
      });

      // First flush hits the 500 and rejects — batch should be kept.
      await asserts.assertRejects(
        () => handler.handle(makeLogObject(5, 'first attempt')),
        Error,
      );
      // @ts-ignore - inspect protected queue
      const retainedLen: number = handler._logs.length;
      asserts.assertEquals(
        retainedLen,
        1,
        'failed batch must be retained for retry',
      );

      // Second flush (server now 200) should send the retained batch.
      await handler.handle(makeLogObject(5, 'second attempt'));
      // @ts-ignore - inspect protected queue
      const drainedLen: number = handler._logs.length;
      asserts.assertEquals(drainedLen, 0, 'queue drained on success');

      await new Promise((r) => setTimeout(r, 50));
      await server.stop(false);

      asserts.assertEquals(calls, 2, 'should have retried after failure');
      asserts.assertEquals(firstBodyLen, 1);
      // Retry carries the original entry plus the one added since.
      asserts.assertEquals(secondBodyLen, 2);
    });

    it('caps the retry queue at maxBufferSize, dropping oldest first', async () => {
      let failMode = true;
      let lastBody: string[] = [];
      const port = nextPort();
      const server = new WebServer('slogger-http-test-cap', {
        mode: 'TCP',
        port,
        hostname: '127.0.0.1',
        handler: async (req) => {
          const body = (await req.json()) as string[];
          if (failMode) {
            return new Response('boom', { status: 500 });
          }
          lastBody = body;
          return new Response('ok', { status: 200 });
        },
      });
      await server.start();
      const url = `http://127.0.0.1:${port}/logs`;

      try {
        const handler = new HTTPHandler('capped', {
          level: 5,
          url,
          method: 'POST',
          batchSize: 1, // flush on every log
          maxBufferSize: 3,
          formatter: simpleFormatter('${message}'),
        });

        // Endpoint down: every flush fails, the batch is restored. The
        // queue grows 1 → 2 → 3; nothing dropped yet.
        for (const msg of ['one', 'two', 'three']) {
          await asserts.assertRejects(
            () => handler.handle(makeLogObject(5, msg)),
            SloggerHandlerError,
          );
        }
        // @ts-ignore - inspect protected queue
        asserts.assertEquals(handler._logs, ['one', 'two', 'three']);
        asserts.assertEquals(handler.droppedLogCount, 0);

        // Fourth log would make it 4 > cap 3 → the OLDEST ('one') is
        // dropped, the newest are kept, and the counter increments.
        await asserts.assertRejects(
          () => handler.handle(makeLogObject(5, 'four')),
          SloggerHandlerError,
        );
        // @ts-ignore - inspect protected queue
        asserts.assertEquals(handler._logs, ['two', 'three', 'four']);
        asserts.assertEquals(handler.droppedLogCount, 1);

        // Endpoint recovers: the capped queue (again drop-oldest for
        // the new push) is delivered in one batch — newest data
        // survives.
        failMode = false;
        await handler.handle(makeLogObject(5, 'five'));
        // @ts-ignore - inspect protected queue
        asserts.assertEquals(handler._logs.length, 0, 'queue drained');
        asserts.assertEquals(handler.droppedLogCount, 2);
        asserts.assertEquals(lastBody, ['three', 'four', 'five']);
      } finally {
        await server.stop(false);
      }
    });

    it('retry path under the cap still preserves whole batches', async () => {
      let failMode = true;
      let lastBody: string[] = [];
      const port = nextPort();
      const server = new WebServer('slogger-http-test-cap2', {
        mode: 'TCP',
        port,
        hostname: '127.0.0.1',
        handler: async (req) => {
          const body = (await req.json()) as string[];
          if (failMode) {
            return new Response('boom', { status: 500 });
          }
          lastBody = body;
          return new Response('ok', { status: 200 });
        },
      });
      await server.start();
      const url = `http://127.0.0.1:${port}/logs`;

      try {
        const handler = new HTTPHandler('under-cap', {
          level: 5,
          url,
          method: 'POST',
          batchSize: 1,
          maxBufferSize: 100, // roomy — nothing should ever be dropped
          formatter: simpleFormatter('${message}'),
        });

        await asserts.assertRejects(
          () => handler.handle(makeLogObject(5, 'kept-1')),
          SloggerHandlerError,
        );
        await asserts.assertRejects(
          () => handler.handle(makeLogObject(5, 'kept-2')),
          SloggerHandlerError,
        );
        asserts.assertEquals(handler.droppedLogCount, 0);

        failMode = false;
        await handler.finalize();
        asserts.assertEquals(handler.droppedLogCount, 0);
        asserts.assertEquals(lastBody, ['kept-1', 'kept-2']);
      } finally {
        await server.stop(false);
      }
    });

    it('redacts URL userinfo credentials from surfaced errors', async () => {
      // Regression: _sendLogs interpolated the raw __url into the error
      // message and context. A URL carrying userinfo credentials
      // (user:token@host) then leaked those credentials into the thrown
      // error — and into any log of that error.
      const port = nextPort();
      const server = new WebServer('slogger-http-test-redact', {
        mode: 'TCP',
        port,
        hostname: '127.0.0.1',
        handler: () => new Response('boom', { status: 500 }),
      });
      await server.start();
      try {
        const handler = new HTTPHandler('redact', {
          level: 5,
          url: `http://alice:s3cr3t-token@127.0.0.1:${port}/logs`,
          method: 'POST',
          batchSize: 1, // flush on first log
          formatter: simpleFormatter('${message}'),
        });

        const err = await asserts.assertRejects(
          () => handler.handle(makeLogObject(5, 'leak check')),
          SloggerHandlerError,
        ) as SloggerHandlerError;

        asserts.assert(
          !err.message.includes('s3cr3t-token'),
          `error message leaked credentials: ${err.message}`,
        );
        asserts.assert(
          !err.message.includes('alice'),
          `error message leaked username: ${err.message}`,
        );
        const ctxUrl = String((err.context as { url?: unknown }).url ?? '');
        asserts.assert(
          !ctxUrl.includes('s3cr3t-token') && !ctxUrl.includes('alice'),
          `error context.url leaked credentials: ${ctxUrl}`,
        );
        // The host is still present so the message stays diagnostic.
        asserts.assertStringIncludes(ctxUrl, '127.0.0.1');
      } finally {
        await server.stop(false);
      }
    });

    it('should not send when _sendLogs is called with empty log queue', async () => {
      let callCount = 0;
      const port = nextPort();
      const server = new WebServer('slogger-http-test-empty', {
        mode: 'TCP',
        port,
        hostname: '127.0.0.1',
        handler: () => {
          callCount++;
          return new Response('ok');
        },
      });
      await server.start();
      const url = `http://127.0.0.1:${port}/logs`;

      // Create handler with batchSize > log count so _sendLogs is called manually via finalize
      const handler = new HTTPHandler('emptyLogs', {
        level: 5,
        url,
        method: 'POST',
        batchSize: 100,
      });

      // finalize calls _sendLogs but logs array is empty → early return
      await handler.finalize();
      await new Promise((r) => setTimeout(r, 50));

      await server.stop(false);

      asserts.assertStrictEquals(callCount, 0, 'No HTTP calls when no logs');
    });

    it('finalize waits for an in-flight batch send (guaranteed-flush path)', async () => {
      // Regression (round-3 finding 10): _sendLogs snapshots-and-clears
      // _logs before awaiting fetch and there was no send chain, so
      // finalize() saw an empty queue and resolved while an earlier
      // batch was still in flight — the record then lost when the
      // process exits right after the documented `await finalize()`.
      let releaseResponse!: () => void;
      const gate = new Promise<void>((r) => {
        releaseResponse = r;
      });
      let received = false;
      const port = nextPort();
      const server = new WebServer('slogger-http-test-drain', {
        mode: 'TCP',
        port,
        hostname: '127.0.0.1',
        handler: async (req) => {
          await req.json();
          received = true;
          await gate; // hold the response open
          return new Response('ok', { status: 200 });
        },
      });
      await server.start();
      try {
        const handler = new HTTPHandler('drain', {
          level: 5,
          url: `http://127.0.0.1:${port}/logs`,
          method: 'POST',
          batchSize: 1, // send on first log
          formatter: simpleFormatter('${message}'),
        });

        // Trigger the batch send (fire-and-forget, as Slogger.log does).
        handler.handle(makeLogObject(5, 'payment failed')).catch(() => {});
        // Let the request reach the server (still gated open).
        await new Promise((r) => setTimeout(r, 100));
        asserts.assert(
          received,
          'precondition: server received the in-flight batch',
        );

        // finalize() must NOT resolve while that send is still in flight.
        let finalized = false;
        const finalizeP = handler.finalize().then(() => {
          finalized = true;
        });
        await new Promise((r) => setTimeout(r, 100));
        asserts.assertEquals(
          finalized,
          false,
          'finalize must wait for the in-flight batch send to complete',
        );

        // Release the response; finalize can now drain and complete.
        releaseResponse();
        await finalizeP;
        asserts.assertEquals(finalized, true);
        // Batch delivered — nothing stranded in the finalized handler.
        asserts.assertEquals((handler as any)._logs.length, 0);
      } finally {
        releaseResponse();
        await server.stop(false);
      }
    });

    it('does not leak URL credentials in the invalid-URL constructor error', () => {
      // Regression (round-3 finding 11): the constructor error paths
      // embedded the raw credentialed URL in the message and context, so
      // an app that logs the setup error leaked the token the redaction
      // was meant to hide.
      const err = asserts.assertThrows(
        () =>
          new HTTPHandler('badurl', {
            level: 5,
            url: 'ht!tp://alice:s3cr3t-token@logs.example.com/ingest',
            method: 'POST',
            batchSize: 1,
          } as any),
        SloggerConfigError,
      ) as SloggerConfigError;

      asserts.assert(
        !err.message.includes('s3cr3t-token'),
        `error message leaked credentials: ${err.message}`,
      );
      asserts.assert(
        !err.message.includes('alice'),
        `error message leaked username: ${err.message}`,
      );
      const ctxVal = String((err.context as { value?: unknown }).value ?? '');
      asserts.assert(
        !ctxVal.includes('s3cr3t-token') && !ctxVal.includes('alice'),
        `error context.value leaked credentials: ${ctxVal}`,
      );
    });
  },
});
