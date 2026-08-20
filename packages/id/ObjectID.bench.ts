import { bench } from '@tundralibs/compat/bench';
import { ObjectID } from './mod.ts';

const oid = ObjectID(0);
bench({
  name: `id.Generate - ObjectID`,
}, () => {
  oid();
});

const oid2 = ObjectID(0, 'adw');
bench({
  name: `id.Generate - ObjectID with manual machine id`,
}, () => {
  oid2();
});
