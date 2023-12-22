import { Syslog } from '../Syslog.ts';
import { assertEquals } from '../../dev.dependencies.ts';

Deno.test({
  name: 'Syslog - Test toString method',
  fn(): void {
    const syslog = new Syslog('Test message');
    syslog.hostName = 'localhost';
    syslog.appName = 'myApp';
    syslog.procId = 123;
    syslog.msgId = '12345';
    syslog.prival = 165;
    syslog.setStructuredData('ABC@1234', { key: 'value' });

    const expectedOutput = '<165>1 ' +
      syslog.dateTime.toISOString() +
      ' localhost myApp 123 12345 [ABC@1234 key="value"] Test message';

    assertEquals(syslog.toString(), expectedOutput);
  },
});

Deno.test({
  name: 'Syslog - Test parse method',
  fn(): void {
    const logEntry =
      '<165>1 2022-01-01T00:00:00.000Z localhost myApp 123 12345 [ABC@1234 key="value"] Test message';

    const syslog = Syslog.parse(logEntry);

    assertEquals(syslog.hostName, 'localhost');
    assertEquals(syslog.appName, 'myApp');
    assertEquals(syslog.procId, 123);
    assertEquals(syslog.msgId, '12345');
    assertEquals(syslog.getStructuredData('ABC@1234'), { key: 'value' });
    assertEquals(syslog.message, 'Test message');
  },
});
