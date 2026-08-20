import { bench } from '@tundralibs/compat/bench';
import { simpleID } from './mod.ts';

const sid = simpleID(0, 4);

bench({
  name: `id.Generate simpleID of length 4`,
}, () => {
  sid();
});

bench({
  name: `id.Generate simpleID of length 6`,
}, () => {
  sid();
});

bench({
  name: `id.Generate simpleID of length 8`,
}, () => {
  sid();
});
