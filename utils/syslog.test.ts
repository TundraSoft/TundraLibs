import * as asserts from '$asserts';
import { SyslogFacilities, SyslogSeverities } from './mod.ts';
import { parse, stringify } from './syslog.ts';

Deno.test('utils.Syslog', async (s) => {
  await s.step('parse', async (t) => {
    await t.step('RFC5424 test #1', () => {
      const logLine =
        '<165>1 2022-01-01T00:00:00.000Z localhost - 123 12345 [ABC@1234 key="value"] Test message';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facility, SyslogFacilities.LOCAL4);
      asserts.assertEquals(parsed.severity, SyslogSeverities.NOTICE);
      asserts.assertEquals(parsed.hostname, 'localhost');
      asserts.assertEquals(parsed.appName, undefined);
      asserts.assertEquals(parsed.processId, 123);
      asserts.assertEquals(parsed.messageId, '12345');
      asserts.assertEquals(parsed.message, 'Test message');
    });

    await t.step('RFC5424 test #2', () => {
      const logLine =
        '<34>1 2003-10-11T22:14:15.003Z mymachine.example.com su - ID47 [exampleSDID@32473 iut="3"] Hello';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facility, SyslogFacilities.AUTH);
      asserts.assertEquals(parsed.severity, SyslogSeverities.CRITICAL);
      asserts.assertEquals(parsed.hostname, 'mymachine.example.com');
      asserts.assertEquals(parsed.appName, 'su');
      asserts.assertEquals(parsed.messageId, 'ID47');
      asserts.assert(parsed.message.includes('Hello'));
    });

    await t.step('RFC5424 test #3', () => {
      const logLine =
        '<190>1 2021-06-15T13:15:00.123Z webserver app - ID42 [meta@123 param="true"] Request processed';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facility, SyslogFacilities.LOCAL7);
      asserts.assertEquals(parsed.severity, SyslogSeverities.INFO);
      asserts.assertEquals(parsed.hostname, 'webserver');
      asserts.assertEquals(parsed.appName, 'app');
      asserts.assertEquals(parsed.messageId, 'ID42');
      asserts.assert(parsed.message.includes('Request processed'));
      asserts.assertEquals(parsed.structuredData!['meta@123'], {
        param: 'true',
      });
    });

    await t.step('RFC5424 test #4', () => {
      const logLine =
        '<46>1 2020-12-25T07:01:59.999Z dbserver db - 678 [dbwarn@4567 val="high" desc="potential issue"] Query took too long';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facility, SyslogFacilities.SYSLOG);
      asserts.assertEquals(parsed.severity, SyslogSeverities.INFO);
      asserts.assertEquals(parsed.hostname, 'dbserver');
      asserts.assertEquals(parsed.appName, 'db');
      asserts.assertEquals(parsed.messageId, '678');
      asserts.assert(parsed.message.includes('Query took too long'));
      asserts.assertEquals(parsed.structuredData!['dbwarn@4567'], {
        val: 'high',
        desc: 'potential issue',
      });
    });

    await t.step('RFC5424 test #5', () => {
      const logLine =
        '<46>1 2020-12-25T07:01:59.999Z - - - - - Query took too long';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facility, SyslogFacilities.SYSLOG);
      asserts.assertEquals(parsed.severity, SyslogSeverities.INFO);
      asserts.assertEquals(parsed.hostname, undefined);
      asserts.assertEquals(parsed.appName, undefined);
      asserts.assertEquals(parsed.messageId, undefined);
      asserts.assert(parsed.message.includes('Query took too long'));
    });

    await t.step('RFC3164 test #1', () => {
      const logLine = '<34>Oct 11 22:14:15 mymachine su[230]: hello world';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facility, SyslogFacilities.AUTH);
      asserts.assertEquals(parsed.severity, SyslogSeverities.CRITICAL);
      asserts.assertEquals(parsed.hostname, 'mymachine');
      asserts.assertEquals(parsed.appName, 'su');
      asserts.assertEquals(parsed.processId, 230);
      asserts.assertEquals(parsed.message, 'hello world');
    });

    await t.step('RFC3164 test #2', () => {
      const logLine =
        `<165>Aug 24 1987 05:34:00 mymachine myproc[10]: sample text`;
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facility, SyslogFacilities.LOCAL4);
      asserts.assertEquals(parsed.severity, SyslogSeverities.NOTICE);
      asserts.assertEquals(parsed.hostname, 'mymachine');
      asserts.assertEquals(parsed.appName, 'myproc');
      asserts.assertEquals(parsed.processId, 10);
      asserts.assertEquals(parsed.message, 'sample text');
    });

    await t.step('RFC3164 test #3', () => {
      const logLine =
        `<13>Mar 15 14:23:01 host1 service[101]: Service started successfully`;
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facility, SyslogFacilities.USER);
      asserts.assertEquals(parsed.severity, SyslogSeverities.NOTICE);
      asserts.assertEquals(parsed.hostname, 'host1');
      asserts.assertEquals(parsed.appName, 'service');
      asserts.assertEquals(parsed.processId, 101);
      asserts.assertEquals(parsed.message, 'Service started successfully');
    });

    await t.step('RFC3164 test #4', () => {
      const logLine =
        `<4>Sep 10 22:17:04 anotherhost sshd[324]: User logged in`;
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facility, SyslogFacilities.KERN);
      asserts.assertEquals(parsed.severity, SyslogSeverities.WARNING);
      asserts.assertEquals(parsed.hostname, 'anotherhost');
      asserts.assertEquals(parsed.appName, 'sshd');
      asserts.assertEquals(parsed.processId, 324);
      asserts.assertEquals(parsed.message, 'User logged in');
    });

    await t.step('RFC3164 test #5', () => {
      const logLine = `<4>Sep 10 22:17:04 - sshd[324]: User logged in`;
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facility, SyslogFacilities.KERN);
      asserts.assertEquals(parsed.severity, SyslogSeverities.WARNING);
      asserts.assertEquals(parsed.hostname, undefined);
      asserts.assertEquals(parsed.appName, 'sshd');
      asserts.assertEquals(parsed.processId, 324);
      asserts.assertEquals(parsed.message, 'User logged in');
    });

    await t.step('facilityName and severityName properties', () => {
      const logLine =
        '<165>1 2022-01-01T00:00:00.000Z localhost - 123 12345 [ABC@1234 key="value"] Test message';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facilityName, 'LOCAL4');
      asserts.assertEquals(parsed.severityName, 'NOTICE');
    });

    await t.step('RFC3164 facilityName and severityName', () => {
      const logLine = '<34>Oct 11 22:14:15 mymachine su[230]: hello world';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facilityName, 'AUTH');
      asserts.assertEquals(parsed.severityName, 'CRITICAL');
    });
  });

  await s.step('Error cases', async (t) => {
    await t.step('Empty input', () => {
      asserts.assertThrows(() => parse(''), Error, 'Empty log message');
    });

    await t.step('Invalid priority', () => {
      asserts.assertThrows(
        () => parse('<192>1 2022-01-01T00:00:00.000Z - - - - -'),
        Error,
        'Invalid priority value: 192',
      );
    });

    await t.step('Invalid RFC5424 format', () => {
      asserts.assertThrows(
        () => parse('<>1 2022-01-01T00:00:00.000Z - - - - -'),
        Error,
        'Invalid RFC5424 format: Missing priority value',
      );
    });

    await t.step('Invalid RFC3164 format - Missing priority value', () => {
      // More explicit test case with empty angle brackets
      asserts.assertThrows(
        () => parse('<> Oct 11 22:14:15 mymachine su[230]: hello world'),
        Error,
        'Invalid/Unsupported syslog format',
      );

      // Also test without angle brackets at all
      asserts.assertThrows(
        () => parse('Oct 11 22:14:15 mymachine su[230]: hello world'),
        Error,
        'Invalid/Unsupported syslog format', // Will trigger the first check
      );
    });
  });

  await s.step('Edge cases', async (t) => {
    await t.step('Maximum valid priority', () => {
      const logLine = '<191>1 2022-01-01T00:00:00.000Z - - - - -';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facility, SyslogFacilities.LOCAL7);
      asserts.assertEquals(parsed.severity, SyslogSeverities.DEBUG);
    });

    await t.step('Multiple structured data elements', () => {
      const logLine =
        '<165>1 2022-01-01T00:00:00.000Z - - - - [test@1 a="1"][test@2 b="2"] message';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.structuredData?.['test@1']?.['a'], '1');
      asserts.assertEquals(parsed.structuredData?.['test@2']?.['b'], '2');
    });

    await t.step('Structured data with special characters', () => {
      const logLine =
        '<165>1 2022-01-01T00:00:00.000Z - - - - [test@1 key="value with spaces"] message';
      const parsed = parse(logLine);
      asserts.assertEquals(
        parsed.structuredData?.['test@1']?.['key'],
        'value with spaces',
      );
    });

    await t.step('Invalid processId in RFC5424', () => {
      const logLine =
        '<165>1 2022-01-01T00:00:00.000Z localhost - abc 12345 - Test message';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.processId, undefined);
    });

    await t.step('Invalid processId in RFC3164', () => {
      const logLine = '<34>Oct 11 22:14:15 mymachine su[abc]: hello world';
      asserts.assertThrows(
        () => parse(logLine),
        Error,
        'Invalid/Unsupported syslog format',
      );
      // const parsed = parse(logLine);
      // asserts.assertEquals(parsed.processId, undefined);
    });

    await t.step('Empty structured data element values', () => {
      const logLine =
        '<165>1 2022-01-01T00:00:00.000Z - - - - [test@1 key=""] message';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.structuredData?.['test@1']?.['key'], '');
    });

    await t.step('Truly malformed structured data', () => {
      // This should be properly handled instead of throwing an uncaught error
      const logLine =
        '<165>1 2022-01-01T00:00:00.000Z - - - - [incomplete message';
      const parsed = parse(logLine);
      // Even with malformed structured data, we should get a valid object back
      asserts.assertEquals(typeof parsed, 'object');
      asserts.assertEquals(parsed.facility, SyslogFacilities.LOCAL4);
    });
  });

  await s.step('stringify', async (t) => {
    await t.step('Basic message', () => {
      const obj = {
        facility: SyslogFacilities.LOCAL0,
        severity: SyslogSeverities.ERROR,
        timestamp: new Date('2022-01-01T00:00:00.000Z'),
        message: 'Test message',
      };
      asserts.assertEquals(
        stringify(obj),
        '<131>1 2022-01-01T00:00:00.000Z - - - - Test message',
      );
    });

    await t.step('With structured data only', () => {
      const obj = {
        facility: SyslogFacilities.LOCAL0,
        severity: SyslogSeverities.ERROR,
        timestamp: new Date('2022-01-01T00:00:00.000Z'),
        message: '',
        structuredData: {
          'test@123': { key: 'value' },
        },
      };
      asserts.assertEquals(
        stringify(obj),
        '<131>1 2022-01-01T00:00:00.000Z - - - - [test@123 key="value"] ',
      );
    });

    await t.step('Invalid input validation', () => {
      const obj = {
        facility: SyslogFacilities.LOCAL0,
        severity: SyslogSeverities.ERROR,
        timestamp: new Date(),
        processId: -1,
        message: 'test',
      };
      asserts.assertThrows(
        () => stringify(obj),
        Error,
        'Invalid process ID',
      );
    });

    await t.step('Missing required fields', () => {
      const obj = {
        facility: SyslogFacilities.LOCAL0,
        severity: SyslogSeverities.ERROR,
        timestamp: new Date(),
        message: '',
      };
      asserts.assertThrows(
        () => stringify(obj),
        Error,
        'Either message or structured data must be provided',
      );
    });

    await t.step('With facilityName and severityName', () => {
      const obj = {
        facility: SyslogFacilities.LOCAL0,
        facilityName: SyslogFacilities[SyslogFacilities.LOCAL0],
        severity: SyslogSeverities.ERROR,
        severityName: SyslogSeverities[SyslogSeverities.ERROR],
        timestamp: new Date('2022-01-01T00:00:00.000Z'),
        message: 'Test message',
      };
      asserts.assertEquals(
        stringify(obj),
        '<131>1 2022-01-01T00:00:00.000Z - - - - Test message',
      );
    });

    await t.step('RFC5424 version is included', () => {
      const obj = {
        facility: SyslogFacilities.LOCAL0,
        severity: SyslogSeverities.ERROR,
        timestamp: new Date('2022-01-01T00:00:00.000Z'),
        message: 'Test message',
      };
      const result = stringify(obj);
      asserts.assert(
        result.includes('>1 '),
        'RFC5424 version number should be included',
      );
    });

    asserts.assertEquals(
      stringify({
        facility: SyslogFacilities.LOCAL4,
        severity: SyslogSeverities.NOTICE,
        hostname: 'localhost',
        processId: 123,
        messageId: '12345',
        message: 'Test message',
        timestamp: new Date('2022-01-01T00:00:00.000Z'),
        appName: undefined,
        structuredData: {
          'ABC@1234': {
            key: 'value',
          },
        },
      }),
      '<165>1 2022-01-01T00:00:00.000Z localhost - 123 12345 [ABC@1234 key="value"] Test message',
    );
  });
});
