import { Syslog } from './Syslog.ts';
import { assertEquals } from '/root/dev.dependencies.ts';

Deno.test({
  name: 'Check if log is generated successfully',
  fn() {
    const obj = new Syslog('Log message entry'),
      dt = new Date();
    obj.prival = 164;
    obj.hostName = 'serv1.google.com';
    obj.msgId = '123';
    obj.dateTime = dt;
    assertEquals(
      `<164>1 ${dt.toISOString()} serv1.google.com - - 123 - Log message entry`,
      obj.toString(),
    );
    // Test different formats
  },
});

//#region Test RFC5424 parsing
// const op1 = Syslog.parse(
//     "<165>1 2003-08-24T05:14:15.000003-07:00 192.0.2.1 myproc 8710 - - %% It's time to make the do-nuts.",
//   ),
//   op2 = Syslog.parse(
//     "<34>1 2003-10-11T22:14:15.003Z mymachine.example.com su - ID47 - BOM'su root' failed for lonvick on /dev/pts/8",
//   ),
//   op3 = Syslog.parse(
//     '<165>1 2003-10-11T22:14:15.003Z mymachine.example.com evntslog - ID47 [exampleSDID@32473 iut="3" eventSource="Applica\' adfsdf \'tion" eventID="1011"] BOMAn application event log entry...',
//   ),
//   op4 = Syslog.parse(
//     '<165>1 2003-10-11T22:14:15.003Z mymachine.example.com evntslog - ID47 [exampleSDID@32473 iut="3" eventSource="Application" eventID="1011"][examplePriority@32473 class="high"]',
//   );

//#endregion Test RFC5424 parsing

//#region Test RFC3164 parsing
// const op5 = Syslog.parse(
//     "<34>Oct 11 22:14:15 mymachine su[123]: 'su root' failed for lonvick on /dev/pts/8",
//   ),
//   op6 = Syslog.parse(
//     "<32>Mar 05 2011 22:21:02: %ASA-6-302013: Built inbound TCP connection 401 for outside:123.123.123.123/4413 (123.123.123.123/4413) to net:BOX/25 (BOX/25)",
//   ),
//   op7 = Syslog.parse(
//     "<191>94103: 51w2d: DHCPD: assigned IP address 10.10.1.94 to client 0100.01c4.21d3.b3",
//   ),
//   op8 = Syslog.parse(
//     "<13>Mar 15 11:22:40 myhost.com     0    11,03/15/12,11:22:38,§ó·s,10.10.10.171,,40C6A91373B6,",
//   ),
//   op9 = Syslog.parse(
//     "Mar 15 11:22:40 myhost.com     0    11,03/15/12,11:22:38,§ó·s,10.10.10.171,,40C6A91373B6,",
//   );
// console.log(op5)
// console.log(op6)
// console.log(op7)
// console.log(op9);
//#endregion Test RFC3164 parsing
