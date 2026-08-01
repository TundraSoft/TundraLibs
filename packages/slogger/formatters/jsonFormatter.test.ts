import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { jsonFormatter, prettyJsonFormatter } from './jsonFormatter.ts';
import type { SlogObject } from '../types/mod.ts';

describe('slogger.formatters.jsonFormatter', () => {
  it('jsonFormatter - basic formatting', () => {
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

  it('jsonFormatter - handles special types', () => {
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

  it('jsonFormatter - nested objects', () => {
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

  it('jsonFormatter - circular references render as [Circular], not a throw', () => {
    // Regression: jsonFormatter used to let JSON.stringify throw on a
    // cyclic context. Because Slogger.log() dispatches handlers
    // fire-and-forget with a swallowing .catch(), the throw silently
    // dropped the WHOLE log record. It must now emit '[Circular]' and
    // still deliver the record.
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

    const formatted = jsonFormatter(logObject);
    const parsed = JSON.parse(formatted);
    asserts.assertEquals(parsed.context.data.name, 'CircularObject');
    asserts.assertEquals(parsed.context.data.self, '[Circular]');
    // The record survived and the non-cyclic fields are intact.
    asserts.assertEquals(parsed.message, 'Circular reference test');
    asserts.assertEquals(parsed.level, 4);

    // Same guarantee for the pretty variant.
    const pretty = JSON.parse(prettyJsonFormatter(logObject));
    asserts.assertEquals(pretty.context.data.self, '[Circular]');
  });

  it('jsonFormatter - shared (acyclic) references are NOT flagged circular', () => {
    // A DAG (the same object referenced from two sibling branches) is
    // not a cycle — both occurrences must serialise normally rather
    // than being falsely reported as '[Circular]'.
    const shared = { value: 42, label: 'shared' };
    const testDate = new Date('2023-01-01T12:00:00Z');

    const logObject: SlogObject = {
      id: '5',
      appName: 'testApp',
      hostname: 'localhost',
      levelName: 'INFO',
      level: 6,
      context: {
        a: shared,
        b: shared,
      },
      message: 'DAG test',
      date: testDate,
      isoDate: testDate.toISOString(),
      timestamp: testDate.getTime(),
    };

    const parsed = JSON.parse(jsonFormatter(logObject));
    asserts.assertEquals(parsed.context.a.value, 42);
    asserts.assertEquals(parsed.context.b.value, 42);
    asserts.assertEquals(parsed.context.b.label, 'shared');
    asserts.assertNotEquals(parsed.context.a, '[Circular]');
    asserts.assertNotEquals(parsed.context.b, '[Circular]');
  });
});
