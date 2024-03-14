import { parse, Syslog } from '../Syslog.ts';
import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from '../../dev.dependencies.ts';

describe('Syslog', () => {
  describe('toString method', () => {
    it('should return the expected output with structured data', () => {
      const syslog = Syslog();
      syslog.hostName = 'localhost';
      syslog.appName = 'myApp';
      syslog.procId = 123;
      syslog.msgId = '12345';
      syslog.pri = 165;
      // syslog.setStructuredData('ABC@1234', { key: 'value' });
      syslog.structuredData = {
        'ABC@1234': { key: 'value' },
      };

      const expectedOutput = '<165>1 ' +
        syslog.dateTime.toISOString() +
        ' localhost myApp 123 12345 [ABC@1234 key="value"] -';

      assertEquals(syslog.toString(), expectedOutput);
    });

    it('should return the expected output without structured data', () => {
      const syslog = Syslog();
      syslog.hostName = 'localhost';
      syslog.appName = 'myApp';
      syslog.procId = 123;
      syslog.msgId = '12345';
      syslog.pri = 165;
      // syslog.message = 'Test message';

      const expectedOutput = '<165>1 ' +
        syslog.dateTime.toISOString() +
        ' localhost myApp 123 12345 - -';

      assertEquals(syslog.toString(), expectedOutput);
    });
  });

  describe('parse method', () => {
    it('should parse RFC5432 correctly', () => {
      const logEntry =
        '<165>1 2022-01-01T00:00:00.000Z localhost myApp 123 12345 [ABC@1234 key="value"] Test message';

      const syslog = parse(logEntry);

      assertEquals(syslog.hostName, 'localhost');
      assertEquals(syslog.appName, 'myApp');
      assertEquals(syslog.procId, 123);
      assertEquals(syslog.msgId, '12345');
      assertEquals(
        JSON.stringify(syslog.structuredData),
        JSON.stringify({ 'ABC@1234': { key: 'value' } }),
      );
      assertEquals(syslog.message, 'Test message');
    });

    it('should parse RFC3164 correctly', () => {
      const logEntry =
        "<165>Aug 24 1987 05:34:00 mymachine myproc[10]: %% It's time to make the do-nuts.  %%  Ingredients: Mix=OK, Jelly=OK #Devices: Mixer=OK, Jelly_Injector=OK, Frier=OK # Transport: Conveyer1=OK, Conveyer2=OK # %%";
      // '<165>Aug 24 05:34:00 CST 1987 mymachine myproc[10]: %% It\'s time to make the do-nuts.  %%  Ingredients: Mix=OK, Jelly=OK #Devices: Mixer=OK, Jelly_Injector=OK, Frier=OK # Transport: Conveyer1=OK, Conveyer2=OK # %%';

      const syslog = parse(logEntry);

      assertEquals(syslog.hostName, 'mymachine');
      assertEquals(syslog.appName, 'myproc');
      assertEquals(syslog.procId, 10);
      assertEquals(
        syslog.message,
        "%% It's time to make the do-nuts.  %%  Ingredients: Mix=OK, Jelly=OK #Devices: Mixer=OK, Jelly_Injector=OK, Frier=OK # Transport: Conveyer1=OK, Conveyer2=OK # %%",
      );
    });
  });

  describe('Validate log entry', () => {
    const syslog = Syslog();

    // Test initial properties
    assertEquals(syslog.version, '1');
    assertEquals(syslog.facility, 16); // LOCAL0

    // Test getters
    assertEquals(syslog.pri, 128); // facility * 8 + severity
    // assertEquals(syslog.prival, 128); // same as pri
    // assertEquals(typeof syslog.isoDateTime, 'string');
    // assertEquals(typeof syslog.bsdDateTime, 'string');

    // Test setters
    syslog.version = '1';
    assertEquals(syslog.version, '1');

    syslog.pri = 165;
    assertEquals(syslog.facility, 20); // Math.floor(165 / 8)
    assertEquals(syslog.severity, 5); // 165 % 8

    syslog.dateTime = new Date('2022-01-01T00:00:00Z');
    assertEquals(
      syslog.dateTime.getTime(),
      new Date('2022-01-01T00:00:00Z').getTime(),
    );

    syslog.severity = 6;
    assertEquals(syslog.severity, 6);

    syslog.facility = 22;
    assertEquals(syslog.facility, 22);

    syslog.msgId = '12345';
    assertEquals(syslog.msgId, '12345');

    syslog.hostName = ' localhost ';
    assertEquals(syslog.hostName, 'localhost');

    syslog.appName = ' myApp ';
    assertEquals(syslog.appName, 'myApp');

    syslog.procId = 123;
    assertEquals(syslog.procId, 123);

    syslog.structuredData = { 'example@123': { key: 'value' } };
    assertEquals(syslog.structuredData, { 'example@123': { key: 'value' } });

    syslog.message = ' Test message ';
    assertEquals(syslog.message, 'Test message');

    // Test invalid setters
    assertThrows(
      () => {
        (syslog as Record<string, unknown>).version = '2';
      },
      Error,
      'Invalid version',
    );
    assertThrows(
      () => {
        syslog.pri = 192;
      },
      Error,
      'Invalid pri',
    );
    assertThrows(
      () => {
        (syslog as Record<string, unknown>).dateTime = 'invalid';
      },
      Error,
      'Invalid dateTime provided',
    );
    assertThrows(
      () => {
        (syslog as Record<string, unknown>).severity = 8;
      },
      Error,
      'Invalid severity',
    );
    assertThrows(
      () => {
        (syslog as Record<string, unknown>).facility = 24;
      },
      Error,
      'Invalid facility',
    );
    assertThrows(
      () => {
        syslog.structuredData = { 'invalid': { key: 'value' } };
      },
      Error,
      'Invalid structuredData id invalid',
    );
    assertThrows(
      () => {
        syslog.structuredData = { 'example@123': { 'invalid key': 'value' } };
      },
      Error,
      'Invalid structuredData key invalid key',
    );
    assertThrows(
      () => {
        syslog.structuredData = { 'example@123': { key: ' invalid value ' } };
      },
      Error,
      'Invalid structuredData value',
    );
  });
});
