import { bench } from '@tundralibs/compat/bench';
import { getFreePort } from './getFreePort.ts';

bench({
  name: 'utils.getFreePort - Fetch an unused port number',
}, () => {
  getFreePort();
});
