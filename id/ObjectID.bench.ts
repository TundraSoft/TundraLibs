import { ObjectID } from './mod.ts';

const oid = ObjectID(0);
Deno.bench({
  name: `Generate ObjectID`,
}, () => {
  oid();
});

const oid2 = ObjectID(0, 'adw');
Deno.bench({
  name: `Generate ObjectID with manual machine id`,
}, () => {
  oid2();
});
