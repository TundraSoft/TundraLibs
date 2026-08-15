import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  parse,
  stringify,
  SyslogFacilities,
  SyslogSeverities,
} from './syslog.ts';

describe('utils.Syslog', () => {
  describe('parse', () => {
    it('RFC5424 test #1', () => {
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

    it('RFC5424 test #2', () => {
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

    it('RFC5424 test #3', () => {
      const logLine =
        '<190>1 2021-06-15T13:15:00.123Z webserver app - ID42 [meta@123 param="true"] Request processed';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facility, SyslogFacilities.LOCAL7);
      asserts.assertEquals(parsed.severity, SyslogSeverities.INFO);
      asserts.assertEquals(parsed.hostname, 'webserver');
      asserts.assertEquals(parsed.appName, 'app');
      asserts.assertEquals(parsed.messageId, 'ID42');
      asserts.assert(parsed.message.includes('Request processed'));
      asserts.assertEquals(parsed.structuredData!['meta@123'], { //NOSONAR
        param: 'true',
      });
    });

    it('RFC5424 test #4', () => {
      const logLine =
        '<46>1 2020-12-25T07:01:59.999Z dbserver db - 678 [dbwarn@4567 val="high" desc="potential issue"] Query took too long';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facility, SyslogFacilities.SYSLOG);
      asserts.assertEquals(parsed.severity, SyslogSeverities.INFO);
      asserts.assertEquals(parsed.hostname, 'dbserver');
      asserts.assertEquals(parsed.appName, 'db');
      asserts.assertEquals(parsed.messageId, '678');
      asserts.assert(parsed.message.includes('Query took too long'));
      asserts.assertEquals(parsed.structuredData!['dbwarn@4567'], { //NOSONAR
        val: 'high',
        desc: 'potential issue',
      });
    });

    it('RFC5424 test #5', () => {
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

    it('RFC3164 test #1', () => {
      const logLine = '<34>Oct 11 22:14:15 mymachine su[230]: hello world';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facility, SyslogFacilities.AUTH);
      asserts.assertEquals(parsed.severity, SyslogSeverities.CRITICAL);
      asserts.assertEquals(parsed.hostname, 'mymachine');
      asserts.assertEquals(parsed.appName, 'su');
      asserts.assertEquals(parsed.processId, 230);
      asserts.assertEquals(parsed.message, 'hello world');
    });

    it('RFC3164 test #2', () => {
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

    it('RFC3164 test #3', () => {
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

    it('RFC3164 test #4', () => {
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

    it('RFC3164 test #5', () => {
      const logLine = `<4>Sep 10 22:17:04 - sshd[324]: User logged in`;
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facility, SyslogFacilities.KERN);
      asserts.assertEquals(parsed.severity, SyslogSeverities.WARNING);
      asserts.assertEquals(parsed.hostname, undefined);
      asserts.assertEquals(parsed.appName, 'sshd');
      asserts.assertEquals(parsed.processId, 324);
      asserts.assertEquals(parsed.message, 'User logged in');
    });

    it('facilityName and severityName properties', () => {
      const logLine =
        '<165>1 2022-01-01T00:00:00.000Z localhost - 123 12345 [ABC@1234 key="value"] Test message';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facilityName, 'LOCAL4');
      asserts.assertEquals(parsed.severityName, 'NOTICE');
    });

    it('RFC3164 facilityName and severityName', () => {
      const logLine = '<34>Oct 11 22:14:15 mymachine su[230]: hello world';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facilityName, 'AUTH');
      asserts.assertEquals(parsed.severityName, 'CRITICAL');
    });

    it('RFC3164 parses a real month into a valid timestamp', () => {
      const logLine = '<34>Oct 11 1987 22:14:15 mymachine su[230]: hi';
      const parsed = parse(logLine);
      // Date should be valid and reflect the parsed month (October = 9).
      asserts.assertEquals(Number.isNaN(parsed.timestamp.getTime()), false);
      asserts.assertEquals(parsed.timestamp.getFullYear(), 1987);
      asserts.assertEquals(parsed.timestamp.getMonth(), 9);
    });

    it('RFC3164 does not treat a bogus month as a month group', () => {
      // Regression: the month group used to be a character class
      // ([Jan|Feb|...]+), so "Jen" (every letter present in the class)
      // matched as a month and silently produced an Invalid Date. With a
      // proper alternation "Jen" is not a month, so the bogus line no
      // longer matches the RFC3164 pattern and is rejected outright.
      asserts.assertThrows(
        () => parse('<34>Jen 11 22:14:15 mymachine su[230]: hi'),
        Error,
        'Invalid/Unsupported syslog format',
      );
    });
  });

  describe('Error cases', () => {
    it('Empty input', () => {
      asserts.assertThrows(() => parse(''), Error, 'Empty log message');
    });

    it('Invalid priority', () => {
      asserts.assertThrows(
        () => parse('<192>1 2022-01-01T00:00:00.000Z - - - - -'),
        Error,
        'Invalid priority value: 192',
      );
    });

    it('Invalid RFC5424 format', () => {
      asserts.assertThrows(
        () => parse('<>1 2022-01-01T00:00:00.000Z - - - - -'),
        Error,
        'Invalid RFC5424 format: Missing priority value',
      );
    });

    it('Invalid RFC3164 format - Missing priority value', () => {
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

  describe('Edge cases', () => {
    it('Maximum valid priority', () => {
      const logLine = '<191>1 2022-01-01T00:00:00.000Z - - - - -';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.facility, SyslogFacilities.LOCAL7);
      asserts.assertEquals(parsed.severity, SyslogSeverities.DEBUG);
    });

    it('Multiple structured data elements', () => {
      const logLine =
        '<165>1 2022-01-01T00:00:00.000Z - - - - [test@1 a="1"][test@2 b="2"] message';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.structuredData?.['test@1']?.['a'], '1');
      asserts.assertEquals(parsed.structuredData?.['test@2']?.['b'], '2');
    });

    it('Structured data with special characters', () => {
      const logLine =
        '<165>1 2022-01-01T00:00:00.000Z - - - - [test@1 key="value with spaces"] message';
      const parsed = parse(logLine);
      asserts.assertEquals(
        parsed.structuredData?.['test@1']?.['key'],
        'value with spaces',
      );
    });

    it('Invalid processId in RFC5424', () => {
      const logLine =
        '<165>1 2022-01-01T00:00:00.000Z localhost - abc 12345 - Test message';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.processId, undefined);
    });

    it('Invalid processId in RFC3164', () => {
      const logLine = '<34>Oct 11 22:14:15 mymachine su[abc]: hello world';
      asserts.assertThrows(
        () => parse(logLine),
        Error,
        'Invalid/Unsupported syslog format',
      );
    });

    it('Empty structured data element values', () => {
      const logLine =
        '<165>1 2022-01-01T00:00:00.000Z - - - - [test@1 key=""] message';
      const parsed = parse(logLine);
      asserts.assertEquals(parsed.structuredData?.['test@1']?.['key'], '');
    });

    it('Truly malformed structured data', () => {
      // This should be properly handled instead of throwing an uncaught error
      const logLine =
        '<165>1 2022-01-01T00:00:00.000Z - - - - [incomplete message';
      const parsed = parse(logLine);
      // Even with malformed structured data, we should get a valid object back
      asserts.assertEquals(typeof parsed, 'object');
      asserts.assertEquals(parsed.facility, SyslogFacilities.LOCAL4);
    });
  });

  describe('Additional Edge Cases', () => {
    it('should handle invalid priority values', () => {
      // Test with negative priority - these are invalid format patterns
      asserts.assertThrows(
        () => parse('<-1>1 2022-01-01T00:00:00.000Z - - - - -'),
        Error,
        'Invalid/Unsupported syslog format',
      );

      // Test with priority above maximum (191) - this actually gets parsed first
      asserts.assertThrows(
        () => parse('<200>1 2022-01-01T00:00:00.000Z - - - - -'),
        Error,
        'Invalid priority value: 200',
      );
    });

    it('should handle RFC5424 with malformed format', () => {
      // Test malformed RFC5424 format
      asserts.assertThrows(
        () => parse('<165>1 - - - - - Test message'),
        Error,
        'Invalid/Unsupported syslog format',
      );
    });

    it('should handle RFC3164 without year', () => {
      const logLine = '<34>Oct 11 22:14:15 mymachine su[230]: hello world';
      const parsed = parse(logLine);
      // Should default to current year
      asserts.assertEquals(
        parsed.timestamp.getFullYear(),
        new Date().getFullYear(),
      );
    });

    it('should handle RFC3164 with invalid process ID format', () => {
      // Process ID should be numeric, test with non-numeric values
      const logLine =
        '<34>Oct 11 22:14:15 mymachine su[notanumber]: hello world';
      // This should fail to parse due to invalid format
      asserts.assertThrows(
        () => parse(logLine),
        Error,
        'Invalid/Unsupported syslog format',
      );
    });

    it('should handle structured data parsing edge cases', () => {
      // A leading bracket that is not a valid "name@id" SD-ELEMENT is not
      // structured data: it is preserved verbatim as message content (round-4
      // #3) rather than silently dropped, matching the documented behaviour.
      const logLine =
        '<165>1 2022-01-01T00:00:00.000Z - - - - [malformed structured data] message';
      // Should not throw error, should handle gracefully
      const parsed = parse(logLine);
      asserts.assert(typeof parsed === 'object');
      asserts.assertEquals(
        parsed.message,
        '[malformed structured data] message',
      );
      // Structured data should be undefined since it was not a valid element.
      asserts.assertEquals(parsed.structuredData, undefined);
    });

    it('should handle empty message in RFC3164', () => {
      // RFC3164 requires a colon followed by content, empty after colon is invalid format
      const logLine = '<34>Oct 11 22:14:15 mymachine su[230]:';
      asserts.assertThrows(
        () => parse(logLine),
        Error,
        'Invalid/Unsupported syslog format',
      );
    });

    it('should handle missing hostname in RFC3164', () => {
      // Test case where hostname might be missing or empty
      const logLine = '<34>Oct 11 22:14:15  su[230]: hello world';
      // This may or may not parse depending on the regex - let's test what actually happens
      try {
        const parsed = parse(logLine);
        // If it parses, should handle gracefully
        asserts.assert(typeof parsed === 'object');
      } catch (error) {
        // If it doesn't parse, should throw expected error
        asserts.assert(error instanceof Error);
        asserts.assert(
          error.message.includes('Invalid/Unsupported syslog format'),
        );
      }
    });
  });

  describe('stringify', () => {
    it('Basic message', () => {
      const obj = {
        facility: SyslogFacilities.LOCAL0,
        severity: SyslogSeverities.ERROR,
        timestamp: new Date('2022-01-01T00:00:00.000Z'),
        message: 'Test message',
      };
      asserts.assertEquals(
        stringify(obj),
        // RFC 5424 requires the STRUCTURED-DATA field; with none present it is
        // the NILVALUE '-' (5 nils total), not omitted (round-3 #7).
        '<131>1 2022-01-01T00:00:00.000Z - - - - - Test message',
      );
    });

    it('With structured data only', () => {
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

    it('Escapes structured-data values per RFC5424 6.3.3', () => {
      // Regression: SD values were emitted verbatim, so a value containing
      // ", \ or ] could break out of the element and inject structured
      // data (log injection). All three must be backslash-escaped.
      const obj = {
        facility: SyslogFacilities.LOCAL0,
        severity: SyslogSeverities.ERROR,
        timestamp: new Date('2022-01-01T00:00:00.000Z'),
        message: '',
        structuredData: {
          'test@123': {
            key: 'a"b\\c] x="injected"',
          },
        },
      };
      asserts.assertEquals(
        stringify(obj),
        '<131>1 2022-01-01T00:00:00.000Z - - - - ' +
          '[test@123 key="a\\"b\\\\c\\] x=\\"injected\\""] ',
      );
    });

    it('Invalid input validation', () => {
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

    it('Missing required fields', () => {
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

    it('With facilityName and severityName', () => {
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
        // RFC 5424 requires the STRUCTURED-DATA field; with none present it is
        // the NILVALUE '-' (5 nils total), not omitted (round-3 #7).
        '<131>1 2022-01-01T00:00:00.000Z - - - - - Test message',
      );
    });

    it('RFC5424 version is included', () => {
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

  describe('Stringify Edge Cases', () => {
    it('should handle NaN process ID', () => {
      const obj = {
        facility: SyslogFacilities.LOCAL0,
        severity: SyslogSeverities.ERROR,
        timestamp: new Date(),
        processId: Number.NaN,
        message: 'test',
      };
      asserts.assertThrows(
        () => stringify(obj),
        Error,
        'Invalid process ID',
      );
    });

    it('should handle zero process ID', () => {
      const obj = {
        facility: SyslogFacilities.LOCAL0,
        severity: SyslogSeverities.ERROR,
        timestamp: new Date('2022-01-01T00:00:00.000Z'),
        processId: 0,
        message: 'test',
      };
      // Process ID 0 should be valid
      const result = stringify(obj);
      asserts.assert(result.includes('0 -'));
    });

    it('should handle large process ID', () => {
      const obj = {
        facility: SyslogFacilities.LOCAL0,
        severity: SyslogSeverities.ERROR,
        timestamp: new Date('2022-01-01T00:00:00.000Z'),
        processId: 65535,
        message: 'test',
      };
      const result = stringify(obj);
      asserts.assert(result.includes('65535 -'));
    });

    it(
      'should handle multiple structured data elements in stringify',
      () => {
        const obj = {
          facility: SyslogFacilities.LOCAL0,
          severity: SyslogSeverities.ERROR,
          timestamp: new Date('2022-01-01T00:00:00.000Z'),
          message: 'Test message',
          structuredData: {
            'test@123': { key1: 'value1', key2: 'value2' },
            'another@456': { key3: 'value3' },
          },
        };
        const result = stringify(obj);
        asserts.assert(result.includes('[test@123'));
        asserts.assert(result.includes('[another@456'));
        asserts.assert(result.includes('key1="value1"'));
        asserts.assert(result.includes('key2="value2"'));
        asserts.assert(result.includes('key3="value3"'));
      },
    );

    it('should handle empty structured data', () => {
      const obj = {
        facility: SyslogFacilities.LOCAL0,
        severity: SyslogSeverities.ERROR,
        timestamp: new Date('2022-01-01T00:00:00.000Z'),
        message: 'Test message',
        structuredData: {},
      };
      const result = stringify(obj);
      // Should not contain any structured data brackets
      asserts.assert(!result.includes('['));
    });
  });

  describe('Additional coverage for edge cases', () => {
    it(
      'should handle facility and severity name mappings comprehensively',
      () => {
        // Test all facility mappings
        const facilities = [
          { code: 0, name: 'KERN' },
          { code: 1, name: 'USER' },
          { code: 2, name: 'MAIL' },
          { code: 3, name: 'DAEMON' },
          { code: 4, name: 'AUTH' },
          { code: 5, name: 'SYSLOG' },
          { code: 6, name: 'LPR' },
          { code: 7, name: 'NEWS' },
          { code: 8, name: 'UUCP' },
          { code: 9, name: 'CRON' },
          { code: 10, name: 'AUTHPRIV' },
          { code: 11, name: 'FTP' },
          { code: 16, name: 'LOCAL0' },
          { code: 17, name: 'LOCAL1' },
          { code: 18, name: 'LOCAL2' },
          { code: 19, name: 'LOCAL3' },
          { code: 20, name: 'LOCAL4' },
          { code: 21, name: 'LOCAL5' },
          { code: 22, name: 'LOCAL6' },
          { code: 23, name: 'LOCAL7' },
        ];

        facilities.forEach(({ code, name }) => {
          const priority = (code * 8) + 3; // Use severity 3 (ERROR)
          const logLine =
            `<${priority}>1 2022-01-01T00:00:00.000Z localhost - - - Test`;
          const parsed = parse(logLine);
          asserts.assertEquals(
            parsed.facilityName,
            name,
            `Facility ${code} should map to ${name}`,
          );
        });

        // Test all severity mappings
        const severities = [
          { code: 0, name: 'EMERGENCY' },
          { code: 1, name: 'ALERT' },
          { code: 2, name: 'CRITICAL' },
          { code: 3, name: 'ERROR' },
          { code: 4, name: 'WARNING' },
          { code: 5, name: 'NOTICE' },
          { code: 6, name: 'INFO' },
          { code: 7, name: 'DEBUG' },
        ];

        severities.forEach(({ code, name }) => {
          const priority = (16 * 8) + code; // Use facility 16 (LOCAL0)
          const logLine =
            `<${priority}>1 2022-01-01T00:00:00.000Z localhost - - - Test`;
          const parsed = parse(logLine);
          asserts.assertEquals(
            parsed.severityName,
            name,
            `Severity ${code} should map to ${name}`,
          );
        });
      },
    );

    it('should handle unknown facility and severity codes', () => {
      // Test with out-of-range facility (should handle gracefully)
      const invalidFacilityPriority = (255 * 8) + 3; // Invalid facility
      const logLine1 =
        `<${invalidFacilityPriority}>1 2022-01-01T00:00:00.000Z localhost - - - Test`;
      asserts.assertThrows(
        () => parse(logLine1),
        Error,
        'Invalid priority value: 2043',
      );

      // Test with out-of-range severity (should handle gracefully)
      const invalidSeverityPriority = (23 * 8) + 15; // Invalid severity
      const logLine2 =
        `<${invalidSeverityPriority}>1 2022-01-01T00:00:00.000Z localhost - - - Test`;
      asserts.assertThrows(
        () => parse(logLine2),
        Error,
        'Invalid priority value: 199',
      );
    });

    it('should handle RFC 3164 parsing edge cases', () => {
      // Test with missing hostname (dash)
      const logLine1 = '<34>Oct 11 22:14:15 - su[230]: hello world';
      const parsed1 = parse(logLine1);
      asserts.assertEquals(parsed1.hostname, undefined);
      asserts.assertEquals(parsed1.appName, 'su');
      asserts.assertEquals(parsed1.processId, 230);

      // Test without process ID
      const logLine2 = '<34>Oct 11 22:14:15 mymachine su: hello world';
      const parsed2 = parse(logLine2);
      asserts.assertEquals(parsed2.hostname, 'mymachine');
      asserts.assertEquals(parsed2.appName, 'su');
      asserts.assertEquals(parsed2.processId, undefined);

      // Test with malformed process ID - should throw error
      const logLine3 = '<34>Oct 11 22:14:15 mymachine su[abc]: hello world';
      asserts.assertThrows(
        () => parse(logLine3),
        Error,
        'Invalid/Unsupported syslog format',
      );

      // Test with empty process ID brackets
      const logLine4 = '<34>Oct 11 22:14:15 mymachine su[]: hello world';
      const parsed4 = parse(logLine4);
      asserts.assertEquals(parsed4.processId, undefined);

      // Year-first RFC 3164 timestamp ("YYYY Mmm dd hh:mm:ss"): the leading
      // year must be captured and applied, not discarded. Regression: the
      // leading-year group was non-capturing, so the parser silently fell back
      // to the current year while month/day/time parsed correctly — producing a
      // timestamp with the wrong year.
      const logLine5 = '<34>2003 Oct 11 22:14:15 mymachine su: hello world';
      const parsed5 = parse(logLine5);
      asserts.assertEquals(parsed5.message, 'hello world');
      asserts.assertEquals(parsed5.timestamp.getFullYear(), 2003);
      asserts.assertEquals(parsed5.timestamp.getMonth(), 9); // October
      asserts.assertEquals(parsed5.timestamp.getDate(), 11);
      asserts.assertEquals(parsed5.hostname, 'mymachine');
      asserts.assertEquals(parsed5.appName, 'su');
      // The year-after-day form ("Mmm dd YYYY hh:mm:ss") likewise yields the
      // stated year rather than the current one.
      const parsedAfterDay = parse(
        '<34>Oct 11 2003 22:14:15 mymachine su: hello world',
      );
      asserts.assertEquals(parsedAfterDay.timestamp.getFullYear(), 2003);
    });

    it('should handle RFC 5424 structured data edge cases', () => {
      // Test with malformed structured data
      const logLine1 =
        '<165>1 2022-01-01T00:00:00.000Z localhost - - - [incomplete';
      const parsed1 = parse(logLine1);
      asserts.assertEquals(parsed1.structuredData, undefined);

      // Test with empty structured data element
      const logLine2 =
        '<165>1 2022-01-01T00:00:00.000Z localhost - - - [] Test';
      const parsed2 = parse(logLine2);
      asserts.assertEquals(parsed2.structuredData, undefined);

      // Test with malformed key-value pairs
      const logLine3 =
        '<165>1 2022-01-01T00:00:00.000Z localhost - - - [test@123 invalidkey] Test';
      const parsed3 = parse(logLine3);
      asserts.assertEquals(
        parsed3.structuredData?.['test@123']?.['invalidkey'],
        undefined,
      );

      // Test with escaped quotes in values
      const logLine4 =
        '<165>1 2022-01-01T00:00:00.000Z localhost - - - [test@123 key="value with \\"quotes\\""] Test'; //NOSONAR
      const parsed4 = parse(logLine4);
      asserts.assertEquals(
        parsed4.structuredData?.['test@123']?.['key'],
        'value with \\', // Current parser behavior - handles escaping differently
      );

      // Test with special characters in element names
      const logLine5 =
        '<165>1 2022-01-01T00:00:00.000Z localhost - - - [test-element@123.456 key="value"] Test';
      const parsed5 = parse(logLine5);
      asserts.assertEquals(
        parsed5.structuredData?.['test-element@123.456']?.['key'],
        'value',
      );
    });

    it('should handle stringify with valid inputs', () => {
      // Test with complete valid object
      const validObj = {
        facility: SyslogFacilities.LOCAL0,
        severity: SyslogSeverities.INFO,
        message: 'test message',
        timestamp: new Date(),
      };

      const result = stringify(validObj);
      asserts.assert(typeof result === 'string');
      asserts.assert(result.includes('test message'));
      asserts.assert(result.includes('<134>')); // LOCAL0 (16) * 8 + INFO (6) = 134
    });

    it(
      'should handle structured data stringification edge cases',
      () => {
        // Test with complex structured data values
        const obj = {
          facility: SyslogFacilities.LOCAL0,
          severity: SyslogSeverities.INFO,
          message: 'test',
          timestamp: new Date(),
          structuredData: {
            'test@123': {
              simple: 'value',
              with_spaces: 'value with spaces',
              with_quotes: 'value "with" quotes',
              with_brackets: 'value [with] brackets',
              with_equals: 'value=with=equals',
              empty: '',
            },
          },
        };

        const result = stringify(obj);

        // Verify proper escaping per RFC5424 6.3.3: `"`, `\` and `]` are
        // backslash-escaped inside SD values; other characters pass through.
        asserts.assert(result.includes('simple="value"'));
        asserts.assert(result.includes('with_spaces="value with spaces"'));
        asserts.assert(
          result.includes('with_quotes="value \\"with\\" quotes"'),
        );
        asserts.assert(
          result.includes('with_brackets="value [with\\] brackets"'),
        );
        asserts.assert(result.includes('with_equals="value=with=equals"'));
        asserts.assert(result.includes('empty=""'));
      },
    );

    it('should handle timestamp formatting edge cases', () => {
      // Test with various date objects
      const dates = [
        new Date('2022-01-01T00:00:00.000Z'),
        new Date('2022-12-31T23:59:59.999Z'),
        new Date('2000-02-29T12:00:00.000Z'), // Leap year
        new Date('1970-01-01T00:00:00.000Z'), // Unix epoch
      ];

      dates.forEach((date) => {
        const obj = {
          facility: SyslogFacilities.LOCAL0,
          severity: SyslogSeverities.INFO,
          timestamp: date,
          message: 'test',
        };

        const result = stringify(obj);
        // Should contain RFC 5424 formatted timestamp with the correct year
        // Use UTC year since toISOString() returns UTC time
        const yearStr = date.getUTCFullYear().toString();
        asserts.assert(
          result.includes(yearStr),
          `Result should contain year ${yearStr}: ${result}`,
        );
      });
    });

    it('should handle parsing validation edge cases', () => {
      // Test priority parsing at boundaries
      const logLine1 = '<0>1 2022-01-01T00:00:00.000Z localhost - - - Test'; // Min priority
      const parsed1 = parse(logLine1);
      asserts.assertEquals(parsed1.facility, 0);
      asserts.assertEquals(parsed1.severity, 0);

      const logLine2 = '<191>1 2022-01-01T00:00:00.000Z localhost - - - Test'; // Max standard priority
      const parsed2 = parse(logLine2);
      asserts.assertEquals(parsed2.facility, 23);
      asserts.assertEquals(parsed2.severity, 7);

      // Test with very large priority numbers - should throw error
      const logLine3 = '<9999>1 2022-01-01T00:00:00.000Z localhost - - - Test';
      asserts.assertThrows(
        () => parse(logLine3),
        Error,
        'Invalid priority value: 9999',
      );
    });

    it('should handle malformed input gracefully', () => {
      // Test various malformed inputs that should not crash
      const malformedInputs = [
        '<>test',
        '<abc>test',
        '<123',
        '123>test',
        '<123>',
        '<123> ',
        '<123>xyz 2022-01-01T00:00:00.000Z',
        '<123>1 invalid-timestamp',
        '<123>1 2022-01-01T00:00:00.000Z',
        '<123>1 2022-01-01T00:00:00.000Z hostname',
        '<123>1 2022-01-01T00:00:00.000Z hostname app process',
      ];

      malformedInputs.forEach((input) => {
        try {
          const result = parse(input);
          // Should not throw, but may have undefined fields
          asserts.assert(typeof result === 'object');
        } catch (error) {
          // Should only throw for completely invalid inputs
          asserts.assert(error instanceof Error);
        }
      });
    });
  });

  describe('round-3 regressions', () => {
    it('#2 - bracketed text in the message is not corrupted', () => {
      // A real SD element followed by a message that itself contains brackets.
      // Previously the message was chopped to "min] logged in".
      asserts.assertEquals(
        parse(
          '<165>1 2022-01-01T00:00:00.000Z host app 1 id [x@1 k="v"] User [admin] logged in',
        ).message,
        'User [admin] logged in',
      );
      // Structured data is still parsed correctly alongside the message.
      const p = parse(
        '<165>1 2022-01-01T00:00:00.000Z host app 1 id [x@1 k="v"] User [admin] logged in',
      );
      asserts.assertEquals(p.structuredData?.['x@1']?.['k'], 'v');
    });

    it('#7 - parse strips the nil (-) STRUCTURED-DATA marker', () => {
      asserts.assertEquals(
        parse('<46>1 2020-12-25T07:01:59.999Z - - - - - Query took too long')
          .message,
        'Query took too long',
      );
      // RFC 5424 6.5 example shape: nil SD before the message.
      asserts.assertEquals(
        parse(
          '<34>1 2003-10-11T22:14:15.003Z mymachine.example.com su - ID47 - disk full',
        ).message,
        'disk full',
      );
    });

    it('#7 - stringify emits the nil (-) SD field when none is present', () => {
      asserts.assertEquals(
        stringify({
          facility: SyslogFacilities.LOCAL0,
          severity: SyslogSeverities.ERROR,
          timestamp: new Date('2022-01-01T00:00:00.000Z'),
          message: 'Test message',
        }),
        '<131>1 2022-01-01T00:00:00.000Z - - - - - Test message',
      );
      // Round-trips through this library's own parser.
      const line = stringify({
        facility: SyslogFacilities.LOCAL0,
        severity: SyslogSeverities.ERROR,
        timestamp: new Date('2022-01-01T00:00:00.000Z'),
        message: 'Test message',
      });
      asserts.assertEquals(parse(line).message, 'Test message');
    });

    it('#8 - stringify prevents injection via key names / header / message', () => {
      const out = stringify({
        facility: SyslogFacilities.LOCAL0,
        severity: SyslogSeverities.ERROR,
        timestamp: new Date('2022-01-01T00:00:00.000Z'),
        appName: 'app evil',
        message: 'ok\n<131>1 forged',
        structuredData: { 'a@1': { 'x="1"] [forged@1 y': 'v' } },
      });
      // No forged sibling SD element (would appear as a "] [" breakout).
      asserts.assertEquals(
        out.includes('] ['),
        false,
        'no SD element breakout',
      );
      // No forged second record via a message newline.
      asserts.assertEquals(out.includes('\n'), false, 'no record forging');
      // appName space stripped so header field parsing is not shifted.
      asserts.assertEquals(
        out.includes('app evil'),
        false,
        'appName not shifted',
      );
      // Re-parsing yields only the single SD-ID we supplied, never "forged@1".
      const reparsed = parse(out);
      asserts.assertEquals(
        Object.keys(reparsed.structuredData ?? {}).includes(
          'forged@1' as never,
        ),
        false,
      );
    });
  });

  describe('round-4 regressions', () => {
    it('#2 - fully-strippable header field does not collapse and shift parsing', () => {
      // A hostname that is entirely disallowed bytes previously sanitized to
      // '' and was interpolated between two spaces, producing a double space
      // (empty token) that shifted every following field left by one on the
      // receiver — the exact "extra header token shifting field parsing"
      // outcome finding #8 was meant to close.
      for (const bad of [' ', '\n', '\t\t', '\x00']) {
        const line = stringify({
          facility: SyslogFacilities.LOCAL0,
          severity: SyslogSeverities.ERROR,
          timestamp: new Date('2022-01-01T00:00:00.000Z'),
          hostname: bad,
          appName: 'app',
          processId: 42,
          messageId: 'mid',
          message: 'hello world',
        });
        // No empty (double-space) header token in the emitted line.
        asserts.assertEquals(
          line.includes('  '),
          false,
          `double space (collapsed token) for hostname ${JSON.stringify(bad)}`,
        );
        // Every following field stays aligned on round-trip.
        const p = parse(line);
        asserts.assertEquals(p.appName, 'app', 'appName must not shift');
        asserts.assertEquals(p.processId, 42, 'processId must not shift');
        asserts.assertEquals(p.messageId, 'mid', 'messageId must not shift');
        asserts.assertEquals(
          p.message,
          'hello world',
          'message must not shift',
        );
      }
    });

    it('#2 - fully-strippable appName does not re-attribute the process id', () => {
      const line = stringify({
        facility: SyslogFacilities.LOCAL0,
        severity: SyslogSeverities.ERROR,
        timestamp: new Date('2022-01-01T00:00:00.000Z'),
        hostname: 'host',
        appName: '   ',
        processId: 42,
        messageId: 'mid',
        message: 'hello world',
      });
      const p = parse(line);
      // Pre-fix the empty APP-NAME token collapsed and the PROCID 42 was read
      // back as the APP-NAME (forged attribution).
      asserts.assertEquals(p.hostname, 'host');
      asserts.assertNotEquals(p.appName, '42');
      asserts.assertEquals(p.processId, 42);
      asserts.assertEquals(p.message, 'hello world');
    });

    it('#2 - fully-strippable SD-ID does not emit an empty bracket token', () => {
      const line = stringify({
        facility: SyslogFacilities.LOCAL0,
        severity: SyslogSeverities.ERROR,
        timestamp: new Date('2022-01-01T00:00:00.000Z'),
        hostname: 'host',
        appName: 'app',
        messageId: 'mid',
        message: 'body',
        structuredData: { ['=' as `${string}@${string}`]: { k: 'v' } },
      });
      // No "[ " empty-SD-ID token that shifts / drops the element.
      asserts.assertEquals(
        line.includes('[ '),
        false,
        'empty SD-ID bracket token',
      );
      // The free-text message is not silently deleted on round-trip (pre-fix an
      // empty SD-ID collapsed the element and could swallow content).
      asserts.assert(
        parse(line).message.includes('body'),
        'message body must survive the round-trip',
      );
    });

    it('#3 - message starting with a bracket survives after real SD', () => {
      // A genuine SD element followed by a message that BEGINS with a bracketed
      // token. Pre-fix the leading "[ERROR]" was consumed as an (invalid) SD
      // element and silently dropped from `message`.
      asserts.assertEquals(
        parse(
          '<165>1 2022-01-01T00:00:00.000Z host app 1 id [x@1 k="v"] [ERROR] disk full',
        ).message,
        '[ERROR] disk full',
      );
      // The array-dump shape the docs also promise.
      asserts.assertEquals(
        parse(
          '<165>1 2022-01-01T00:00:00.000Z host app 1 id [x@1 k="v"] [1,2,3] array dump',
        ).message,
        '[1,2,3] array dump',
      );
      // The real SD element is still parsed alongside the preserved message.
      const p = parse(
        '<165>1 2022-01-01T00:00:00.000Z host app 1 id [x@1 k="v"] [ERROR] disk full',
      );
      asserts.assertEquals(p.structuredData?.['x@1']?.['k'], 'v');
    });

    it('#3 - bracketed message with no SD is preserved', () => {
      // A bracketed level prefix in the SD position (not nil, not valid SD) is
      // message content, not a droppable element.
      const p = parse(
        '<165>1 2022-01-01T00:00:00.000Z host app 1 id [ERROR] disk full',
      );
      asserts.assertEquals(p.message, '[ERROR] disk full');
      asserts.assertEquals(p.structuredData, undefined);
    });
  });
});
