import * as asserts from '$asserts';
import { jsonFormatter } from './jsonFormatter.ts';
import type { SlogObject } from '../types/mod.ts';

Deno.test('Slogger.Formatters.jsonFormatter', async (t) => {
  await t.step('jsonFormatter - basic formatting', () => {
    const logObject: SlogObject = {
      id: '1',
      appName: 'testApp',
      hostname: 'localhost',
      levelName: 'INFO',
      level: 6,
      context: {},
      message: 'Test message',
      date: new Date('2023-01-01T12:00:00Z'),
      isoDate: new Date('2023-01-01T12:00:00Z').toISOString(),
      timestamp: new Date('2023-01-01T12:00:00Z').getTime(),
    };
    const formatted = jsonFormatter(logObject);
    const parsed = JSON.parse(formatted);

    asserts.assertEquals(parsed.level, 6);
    asserts.assertEquals(parsed.message, 'Test message');
    asserts.assertEquals(parsed.timestamp, 1672574400000);
  });

  await t.step('jsonFormatter - handles special types', () => {
    const now = new Date();
    const bigIntValue = BigInt('9007199254740991');

    const logObject: SlogObject = {
      id: '2',
      appName: 'testApp',
      hostname: 'localhost',
      levelName: 'DEBUG',
      level: 7,
      context: {
        data: {
          bigNumber: bigIntValue,
          nullValue: null,
          undefinedValue: undefined,
        },
      },
      message: 'Special types test',
      date: now,
      isoDate: now.toISOString(),
      timestamp: now.getTime(),
    };

    const formatted = jsonFormatter(logObject);
    const parsed = JSON.parse(formatted);

    asserts.assertEquals(parsed.level, 7);
    asserts.assertEquals(parsed.levelName, 'DEBUG');
    asserts.assertEquals(parsed.context.data.bigNumber, bigIntValue.toString());
    asserts.assertEquals(parsed.context.data.nullValue, null);
    asserts.assertEquals(parsed.context.data.undefinedValue, null); // undefined becomes null in JSON
  });

  await t.step('jsonFormatter - nested objects', () => {
    const testDate = new Date('2023-01-01T12:00:00Z');

    const logObject: SlogObject = {
      id: '3',
      appName: 'testApp',
      hostname: 'localhost',
      levelName: 'ERROR',
      level: 3,
      context: {
        error: {
          name: 'TestError',
          message: 'Test error message',
          stack: 'Error stack trace',
          cause: {
            name: 'OriginalError',
            message: 'Original error',
          },
        },
      },
      message: 'Nested object test',
      date: testDate,
      isoDate: testDate.toISOString(),
      timestamp: testDate.getTime(),
    };

    const formatted = jsonFormatter(logObject);
    const parsed = JSON.parse(formatted);

    asserts.assertEquals(parsed.level, 3);
    asserts.assertEquals(parsed.levelName, 'ERROR');
    asserts.assertEquals(parsed.context.error.name, 'TestError');
    asserts.assertEquals(parsed.context.error.cause.name, 'OriginalError');
  });

  await t.step('jsonFormatter - circular references', () => {
    const circular: Record<string, unknown> = {
      name: 'CircularObject',
    };
    circular.self = circular; // Create circular reference

    const testDate = new Date('2023-01-01T12:00:00Z');

    const logObject: SlogObject = {
      id: '4',
      appName: 'testApp',
      hostname: 'localhost',
      levelName: 'WARNING',
      level: 4,
      context: {
        data: circular,
      },
      message: 'Circular reference test',
      date: testDate,
      isoDate: testDate.toISOString(),
      timestamp: testDate.getTime(),
    };

    try {
      jsonFormatter(logObject);
      // If we reach here without error, the test fails
      asserts.assertEquals(
        true,
        false,
        'Expected error for circular reference',
      );
    } catch (error) {
      // Test passes if the function throws an error for circular reference
      asserts.assertEquals(error instanceof TypeError, true);
      asserts.assertEquals((error as Error).message.includes('circular'), true);
    }
  });
});
