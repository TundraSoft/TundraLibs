import { bench } from '@tundralibs/compat/bench';
import { sequenceID } from './mod.ts';

bench({
  name: `id.Generate sequenceId`,
}, () => {
  sequenceID();
});

bench({
  name: `id.Generate sequenceId Overriding`,
}, () => {
  sequenceID(134);
});
