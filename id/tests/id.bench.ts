import {
  alphabets,
  alphaNumeric,
  alphaNumericCase,
  cryptoKey,
  nanoId,
  numbers,
  password,
  passwordGenerator,
  sequenceId,
} from '../mod.ts';

Deno.bench({
  name:
    `[library='id' mode='nanoid'] Generate nanoid of length 10 characters using alphabets`,
}, () => {
  nanoId(10, alphabets);
});

Deno.bench({
  name:
    `[library='id' mode='nanoid'] Generate nanoid of length 16 characters using alphabets`,
}, () => {
  nanoId(16, alphabets);
});

Deno.bench({
  name:
    `[library='id' mode='nanoid'] Generate nanoid of length 32 characters using alphabets`,
}, () => {
  nanoId(32, alphabets);
});

// Numbers only

Deno.bench({
  name:
    `[library='id' mode='nanoid'] Generate nanoid of length 10 characters using nummeric`,
}, () => {
  nanoId(10, numbers);
});

Deno.bench({
  name:
    `[library='id' mode='nanoid'] Generate nanoid of length 16 characters using nummeric`,
}, () => {
  nanoId(16, numbers);
});

Deno.bench({
  name:
    `[library='id' mode='nanoid'] Generate nanoid of length 32 characters using nummeric`,
}, () => {
  nanoId(32, numbers);
});

// AlphaNumeric only

Deno.bench({
  name:
    `[library='id' mode='nanoid'] Generate nanoid of length 10 characters using alphaNumeric`,
}, () => {
  nanoId(10, alphaNumeric);
});

Deno.bench({
  name:
    `[library='id' mode='nanoid'] Generate nanoid of length 16 characters using alphaNumeric`,
}, () => {
  nanoId(16, alphaNumeric);
});

Deno.bench({
  name:
    `[library='id' mode='nanoid'] Generate nanoid of length 32 characters using alphaNumeric`,
}, () => {
  nanoId(32, alphaNumeric);
});

// AlphaNumeric only

Deno.bench({
  name:
    `[library='id' mode='nanoidCase'] Generate nanoid of length 10 characters using alphaNumericCase`,
}, () => {
  nanoId(10, alphaNumericCase);
});

Deno.bench({
  name:
    `[library='id' mode='nanoidCase'] Generate nanoid of length 16 characters using alphaNumericCase`,
}, () => {
  nanoId(16, alphaNumericCase);
});

Deno.bench({
  name:
    `[library='id' mode='nanoid'] Generate nanoid of length 32 characters using alphaNumericCase`,
}, () => {
  nanoId(32, alphaNumericCase);
});

// AlphaNumeric only

Deno.bench({
  name:
    `[library='id' mode='nanoidCase'] Generate nanoid of length 10 characters using password`,
}, () => {
  nanoId(10, alphaNumericCase);
});

Deno.bench({
  name:
    `[library='id' mode='nanoidCase'] Generate nanoid of length 16 characters using password`,
}, () => {
  nanoId(16, password);
});

Deno.bench({
  name:
    `[library='id' mode='nanoid'] Generate nanoid of length 32 characters using password`,
}, () => {
  nanoId(32, password);
});

Deno.bench({
  name: `[library='id' mode='sequenceId'] Generate sequenceId`,
}, () => {
  sequenceId();
});

Deno.bench({
  name: `[library='id' mode='sequenceId'] Generate sequenceId - Overriding`,
}, () => {
  sequenceId(134);
});

Deno.bench({
  name:
    `[library='id' mode='passwordGenerator'] Generate 21 characters password`,
}, () => {
  passwordGenerator(21);
});

Deno.bench({
  name:
    `[library='id' mode='cryptoKey'] Generate cryptoKey of length 10 characters`,
}, () => {
  cryptoKey(10);
});

Deno.bench({
  name:
    `[library='id' mode='cryptoKey'] Generate cryptoKey of length 10 characters with prefix`,
}, () => {
  cryptoKey(10, 'TLIB-');
});

Deno.bench({
  name:
    `[library='id' mode='cryptoKey'] Generate cryptoKey of length 16 characters`,
}, () => {
  cryptoKey(16);
});

Deno.bench({
  name:
    `[library='id' mode='cryptoKey'] Generate cryptoKey of length 16 characters with prefix`,
}, () => {
  cryptoKey(16, 'TLIB-');
});

Deno.bench({
  name:
    `[library='id' mode='cryptoKey'] Generate cryptoKey of length 32 characters`,
}, () => {
  cryptoKey(32);
});

Deno.bench({
  name:
    `[library='id' mode='cryptoKey'] Generate cryptoKey of length 32 characters with prefix`,
}, () => {
  cryptoKey(32, 'TLIB-');
});
