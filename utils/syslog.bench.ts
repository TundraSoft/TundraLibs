import {
  parse,
  stringify,
  SyslogFacilities,
  SyslogSeverities,
} from './syslog.ts';

Deno.bench({
  name: 'utils.syslog - Parse RFC5424 format',
}, () => {
  parse('<34>1 2023-01-30T12:30:45Z myhostname myapp 8814 ID47 - message');
});

Deno.bench({
  name: 'utils.syslog - Parse RFC3164 format',
}, () => {
  parse('<34>Oct 11 22:14:15 myhostname app[123]: message');
});

Deno.bench({
  name: 'utils.syslog - Stringify syslog object',
}, () => {
  stringify({
    facility: SyslogFacilities.USER,
    severity: SyslogSeverities.NOTICE,
    timestamp: new Date(),
    hostname: 'myhostname',
    appName: 'myapp',
    processId: 8814,
    messageId: 'ID47',
    message: 'Test message',
  });
});
