import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  compactFormat,
  detailedFormat,
  keyValueFormat,
  minimalistFormat,
  simpleFormatter,
  standardFormat,
} from './string.ts';
import type { SlogObject } from '../types/mod.ts';

describe('slogger.formatters.stringFormatter', () => {
  // Create a sample log object for testing
  const testDate = new Date('2023-01-01T12:00:00Z');
  const sampleLog: SlogObject = {
    id: '123456',
    appName: 'testApp',
    hostname: 'server123',
    levelName: 'INFO',
    level: 6,
    context: { user: 'testUser' },
    message: 'User logged in successfully',
    date: testDate,
    isoDate: testDate.toISOString(),
    timestamp: testDate.getTime(),
  };

  it('custom formatter', () => {
    // Test a custom formatter template
    const customFormat = simpleFormatter('${levelName} - ${message}');
    const result = customFormat(sampleLog);
    asserts.assertEquals(result, 'INFO - User logged in successfully');
  });

  it('standardFormat', () => {
    const result = standardFormat(sampleLog);
    asserts.assertEquals(
      result,
      '[2023-01-01T12:00:00.000Z] [INFO] User logged in successfully',
    );
  });

  it('detailedFormat', () => {
    const result = detailedFormat(sampleLog);
    asserts.assertEquals(
      result,
      '2023-01-01T12:00:00.000Z [INFO] [testApp] [server123] User logged in successfully',
    );
  });

  it('compactFormat', () => {
    // The time stamp is HH:mm:ss sliced from the UTC ISO timestamp, so
    // the output is fully deterministic for a fixed-date fixture.
    const result = compactFormat(sampleLog);
    asserts.assertEquals(result, 'INFO [12:00:00] User logged in successfully');
  });

  it('compactFormat renders a real time, never a literal template', () => {
    // Regression: the old template used `${date.toLocaleTimeString()}`,
    // which templatize cannot invoke (dot-path lookup only), so every
    // line emitted the literal `${date.toLocaleTimeString()}`.
    const result = compactFormat(sampleLog);
    asserts.assert(!result.includes('${'));
    asserts.assertMatch(result, /^INFO \[\d{2}:\d{2}:\d{2}\] /);
  });

  it('minimalistFormat', () => {
    const result = minimalistFormat(sampleLog);
    asserts.assertEquals(result, 'INFO: User logged in successfully');
  });

  it('keyValueFormat', () => {
    const result = keyValueFormat(sampleLog);
    asserts.assertEquals(
      result,
      'ts=2023-01-01T12:00:00.000Z level=INFO app=testApp msg="User logged in successfully"',
    );
  });

  it('handles undefined properties', () => {
    // Test with a log object missing some properties
    const incompleteLog: Partial<SlogObject> = {
      levelName: 'ERROR',
      message: 'Something went wrong',
    };

    const format = simpleFormatter(
      '${levelName}: ${message} ${nonExistentProp}',
    );
    const result = format(incompleteLog as SlogObject);

    // Should replace existing properties and leave nonexistent ones as empty strings
    asserts.assertEquals(
      result,
      'ERROR: Something went wrong ${nonExistentProp}',
    );
  });
});
