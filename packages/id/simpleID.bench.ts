import { bench } from '@tundralibs/compat/bench';
import { simpleID } from './mod.ts';

// `minLen` is the minimum counter-pad width, not the total length. Use a
// distinct generator per case so each bench actually exercises its own width
// (the previous version reused one minLen=4 generator under all three labels).
const sid4 = simpleID(0, 4);
const sid8 = simpleID(0, 8);
const sidMicro = simpleID(0, 4, true);

bench({
  name: `id.Generate simpleID (minLen 4)`,
}, () => {
  sid4();
});

bench({
  name: `id.Generate simpleID (minLen 8)`,
}, () => {
  sid8();
});

// The includeMicroseconds path is the meaningfully different one — it adds a
// Date.now() read and the sub-millisecond disambiguator formatting per call.
bench({
  name: `id.Generate simpleID with microseconds disambiguator`,
}, () => {
  sidMicro();
});
