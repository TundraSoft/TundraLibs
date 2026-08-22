// Hands-on exploration of rAPId's JOB (cron) and SOCKET (WebSocket)
// transports — manual triggerJob(), a scheduled job's actual registration,
// and a WebSocket round trip via @tundralibs/rpc's Client. Scratch only.
import { Application } from '../Application.ts';
import { Client } from '../../rpc/Client.ts';

const app = await Application.initialize({
  name: 'explore',
  mode: 'DEVELOPMENT',
  server: { port: 4010 },
});

let ticks = 0;
app.job('heartbeat', '*/1 * * * *', () => {
  ticks++;
  return { content: { ticks } };
});

app.socket('echo', (ctx) => ({ content: { echoed: ctx.args.params } }));

await app.start();
console.log(`started on ${app.port}`);

// 1. Manual job trigger — bypasses the schedule entirely.
const jobResult = await app.triggerJob('heartbeat');
console.log('triggerJob result:', JSON.stringify(jobResult));
const jobResult2 = await app.triggerJob('heartbeat');
console.log(
  'triggerJob result (2nd call, same process):',
  JSON.stringify(jobResult2),
);

// 2. WebSocket round trip.
const ws = new Client({
  url: `ws://localhost:4010/ws`,
  reconnect: { enabled: false },
});
await ws.connect();
const echoed = await ws.command('echo', { hello: 'world' });
console.log('socket echo result:', JSON.stringify(echoed));
await ws.close();

await app.stop();
console.log('stopped cleanly');
