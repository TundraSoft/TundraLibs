import { sequenceID } from './mod.ts';

Deno.bench({
  name: `Generate sequenceId`,
}, () => {
  sequenceID();
});

Deno.bench({
  name: `Generate sequenceId - Overriding`,
}, () => {
  sequenceID(134);
});
