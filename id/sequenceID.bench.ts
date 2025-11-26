import { sequenceID } from './mod.ts';

Deno.bench({
  name: `id.Generate sequenceId`,
}, () => {
  sequenceID();
});

Deno.bench({
  name: `id.Generate sequenceId Overriding`,
}, () => {
  sequenceID(134);
});
