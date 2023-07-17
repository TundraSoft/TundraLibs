import {
  alphabets,
  alphaNumeric,
  alphaNumericCase,
  nanoid,
  numbers,
  password,
  sequenceId,
} from '../mod.ts';

Deno.bench({
  name:
    `[library='nanoid' mode='nanoid'] Generate nanoid of length 10 characters using alphabets`,
}, () => {
  nanoid(10, alphabets);
});

Deno.bench({
  name:
    `[library='nanoid' mode='nanoid'] Generate nanoid of length 16 characters using alphabets`,
}, () => {
  nanoid(16, alphabets);
});

Deno.bench({
  name:
    `[library='nanoid' mode='nanoid'] Generate nanoid of length 32 characters using alphabets`,
}, () => {
  nanoid(32, alphabets);
});

// Numbers only

Deno.bench({
  name:
    `[library='nanoid' mode='nanoid'] Generate nanoid of length 10 characters using nummeric`,
}, () => {
  nanoid(10, numbers);
});

Deno.bench({
  name:
    `[library='nanoid' mode='nanoid'] Generate nanoid of length 16 characters using nummeric`,
}, () => {
  nanoid(16, numbers);
});

Deno.bench({
  name:
    `[library='nanoid' mode='nanoid'] Generate nanoid of length 32 characters using nummeric`,
}, () => {
  nanoid(32, numbers);
});

// AlphaNumeric only

Deno.bench({
  name:
    `[library='nanoid' mode='nanoid'] Generate nanoid of length 10 characters using alphaNumeric`,
}, () => {
  nanoid(10, alphaNumeric);
});

Deno.bench({
  name:
    `[library='nanoid' mode='nanoid'] Generate nanoid of length 16 characters using alphaNumeric`,
}, () => {
  nanoid(16, alphaNumeric);
});

Deno.bench({
  name:
    `[library='nanoid' mode='nanoid'] Generate nanoid of length 32 characters using alphaNumeric`,
}, () => {
  nanoid(32, alphaNumeric);
});

// AlphaNumeric only

Deno.bench({
  name:
    `[library='nanoid' mode='nanoidCase'] Generate nanoid of length 10 characters using alphaNumericCase`,
}, () => {
  nanoid(10, alphaNumericCase);
});

Deno.bench({
  name:
    `[library='nanoid' mode='nanoidCase'] Generate nanoid of length 16 characters using alphaNumericCase`,
}, () => {
  nanoid(16, alphaNumericCase);
});

Deno.bench({
  name:
    `[library='nanoid' mode='nanoid'] Generate nanoid of length 32 characters using alphaNumericCase`,
}, () => {
  nanoid(32, alphaNumericCase);
});

// AlphaNumeric only

Deno.bench({
  name:
    `[library='nanoid' mode='nanoidCase'] Generate nanoid of length 10 characters using password`,
}, () => {
  nanoid(10, alphaNumericCase);
});

Deno.bench({
  name:
    `[library='nanoid' mode='nanoidCase'] Generate nanoid of length 16 characters using password`,
}, () => {
  nanoid(16, password);
});

Deno.bench({
  name:
    `[library='nanoid' mode='nanoid'] Generate nanoid of length 32 characters using password`,
}, () => {
  nanoid(32, password);
});

Deno.bench({
  name: `[library='nanoid' mode='sequenceId'] Generate sequenceId`,
}, () => {
  sequenceId();
});

Deno.bench({
  name: `[library='nanoid' mode='sequenceId'] Generate sequenceId - Overriding`,
}, () => {
  sequenceId(134);
});
