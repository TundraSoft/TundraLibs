import * as asserts from '$asserts';
import {
  compactFormat,
  detailedFormat,
  keyValueFormat,
  minimalistFormat,
  simpleFormatter,
  standardFormat,
} from './string.ts';
import type { SlogObject } from '../types/mod.ts';

Deno.test('Slogger.Formatters.stringFormatter', async (t) => {
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

  await t.step('custom formatter', () => {
    // Test a custom formatter template
    const customFormat = simpleFormatter('${levelName} - ${message}');
    const result = customFormat(sampleLog);
    asserts.assertEquals(result, 'INFO - User logged in successfully');
  });

  await t.step('standardFormat', () => {
    const result = standardFormat(sampleLog);
    asserts.assertEquals(
      result,
      '[2023-01-01T12:00:00.000Z] [INFO] User logged in successfully',
    );
  });

  await t.step('detailedFormat', () => {
    const result = detailedFormat(sampleLog);
    asserts.assertEquals(
      result,
      '2023-01-01T12:00:00.000Z [INFO] [testApp] [server123] User logged in successfully',
    );
  });

  await t.step('compactFormat', () => {
    // Note: toLocaleTimeString output can vary by environment, so we'll do a partial check
    const result = compactFormat(sampleLog);
    asserts.assert(
      result.includes('INFO') &&
        result.includes('User logged in successfully') &&
        result.includes('['),
    );
  });

  await t.step('minimalistFormat', () => {
    const result = minimalistFormat(sampleLog);
    asserts.assertEquals(result, 'INFO: User logged in successfully');
  });

  await t.step('keyValueFormat', () => {
    const result = keyValueFormat(sampleLog);
    asserts.assertEquals(
      result,
      'ts=2023-01-01T12:00:00.000Z level=INFO app=testApp msg="User logged in successfully"',
    );
  });

  await t.step('handles undefined properties', () => {
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
