import { getFreePort } from './getFreePort.ts';

Deno.bench({
  name: `[library='utils' mode='getFreePort'] Fetch an unused port number`,
}, () => {
  getFreePort();
});
