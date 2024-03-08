import { parse, Syslog } from '../Syslog.ts';
import { assertEquals, describe, it } from '../../dev.dependencies.ts';

// describe('Syslog', () => {
//   it('Test toString method', () => {
//     const syslog = Syslog();
//     syslog.hostName = 'localhost';
//     syslog.appName = 'myApp';
//     syslog.procId = 123;
//     syslog.msgId = '12345';
//     syslog.pri = 165;
//     syslog.structuredData = {
//       'ABC@1234': { key: 'value' },
//     };

//     const expectedOutput = '<165>1 ' +
//       syslog.dateTime.toISOString() +
//       ' localhost myApp 123 12345 [ABC@1234 key="value"] Test message';

//     assertEquals(syslog.toString(), expectedOutput);
//   });

//   it('Test parse method', () => {
//     const logEntry =
//       '<165>1 2022-01-01T00:00:00.000Z localhost myApp 123 12345 [ABC@1234 key="value"] Test message';

//     const syslog = parse(logEntry);

//     assertEquals(syslog.hostName, 'localhost');
//     assertEquals(syslog.appName, 'myApp');
//     assertEquals(syslog.procId, 123);
//     assertEquals(syslog.msgId, '12345');
//     assertEquals(JSON.stringify(syslog.structuredData), JSON.stringify({ 'ABC@1234': {key: 'value' }}));
//     assertEquals(syslog.message, 'Test message');
//   });
// });

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
});
