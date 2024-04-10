import { getFreePort } from './getFreePort.ts';

Deno.bench({
  name: 'utils/getFreePort - Fetch an unused port number',
}, () => {
  getFreePort();
});
