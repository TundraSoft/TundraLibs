import { simpleID } from './mod.ts';

const sid = simpleID(0, 4);

Deno.bench({
  name: `Generate simpleID of length 4`,
}, () => {
  sid();
});

Deno.bench({
  name: `Generate simpleID of length 6`,
}, () => {
  sid();
});

Deno.bench({
  name: `Generate simpleID of length 8`,
}, () => {
  sid();
});
