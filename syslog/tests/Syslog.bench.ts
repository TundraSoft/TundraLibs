import { parse, Syslog } from '../Syslog.ts';

Deno.bench('Syslog - Build', () => {
  const a = Syslog();
  // a.version = '1';
  a.dateTime = new Date();
  a.severity = 1;
  a.facility = 1;
  a.msgId = 'sdf';
  a.hostName = 'sdf';
  a.appName = 'sdf';
  a.procId = 1;
  a.structuredData = {
    'exampleSDID@32473': {
      'iut': '3',
      'eventSource': 'Application',
      'eventID': '1011',
    },
  };
  a.message = 'sdf';
  // a.toString();
});

Deno.bench('Parse RFC5432', () => {
  const logEntry =
    '<165>1 2022-01-01T00:00:00.000Z localhost myApp 123 12345 [ABC@1234 key="value"] Test message';
  parse(logEntry);
  // console.log(syslog);
});

Deno.bench('Syslog - Parse RFC3164', () => {
  const logEntry =
    "<165>Aug 24 05:34:00 CST 1987 mymachine myproc[10]: %% It's time to make the do-nuts.  %%  Ingredients: Mix=OK, Jelly=OK #Devices: Mixer=OK, Jelly_Injector=OK, Frier=OK # Transport: Conveyer1=OK, Conveyer2=OK # %%";
  parse(logEntry);
  // console.log(syslog);
});

Deno.bench('Convert toString', () => {
  const a = Syslog();
  a.dateTime = new Date();
  a.severity = 1;
  a.facility = 1;
  a.msgId = 'sdf';
  a.hostName = 'sdf';
  a.appName = 'sdf';
  a.procId = 1;
  a.structuredData = {
    'exampleSDID@32473': {
      'iut': '3',
      'eventSource': 'Application',
      'eventID': '1011',
    },
  };
  a.message = 'sdf';
  // b.start();
  a.toString();
  // b.end();
});
