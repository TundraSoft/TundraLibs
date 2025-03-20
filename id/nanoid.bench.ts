import {
  ALPHA_NUMERIC,
  ALPHA_NUMERIC_CASE,
  ALPHABETS,
  nanoID,
  NUMBERS,
  PASSWORD,
  WEB_SAFE,
} from './mod.ts';

Deno.bench({
  name: `Generate nanoID of length 10 characters using alphabets`,
}, () => {
  nanoID(10, ALPHABETS);
});

Deno.bench({
  name: `Generate nanoID of length 16 characters using alphabets`,
}, () => {
  nanoID(16, ALPHABETS);
});

Deno.bench({
  name: `Generate nanoID of length 32 characters using alphabets`,
}, () => {
  nanoID(32, ALPHABETS);
});

// Numbers only

Deno.bench({
  name: `Generate nanoID of length 10 characters using nummeric`,
}, () => {
  nanoID(10, NUMBERS);
});

Deno.bench({
  name: `Generate nanoID of length 16 characters using nummeric`,
}, () => {
  nanoID(16, NUMBERS);
});

Deno.bench({
  name: `Generate nanoID of length 32 characters using nummeric`,
}, () => {
  nanoID(32, NUMBERS);
});

// AlphaNumeric only

Deno.bench({
  name: `Generate nanoID of length 10 characters using alphaNumeric`,
}, () => {
  nanoID(10, ALPHA_NUMERIC);
});

Deno.bench({
  name: `Generate nanoID of length 16 characters using alphaNumeric`,
}, () => {
  nanoID(16, ALPHA_NUMERIC);
});

Deno.bench({
  name: `Generate nanoID of length 32 characters using alphaNumeric`,
}, () => {
  nanoID(32, ALPHA_NUMERIC);
});

// AlphaNumeric only

Deno.bench({
  name: `Generate nanoID of length 10 characters using alphaNumericCase`,
}, () => {
  nanoID(10, ALPHA_NUMERIC_CASE);
});

Deno.bench({
  name: `Generate nanoID of length 16 characters using alphaNumericCase`,
}, () => {
  nanoID(16, ALPHA_NUMERIC_CASE);
});

Deno.bench({
  name: `Generate nanoID of length 32 characters using alphaNumericCase`,
}, () => {
  nanoID(32, ALPHA_NUMERIC_CASE);
});

// Password

Deno.bench({
  name: `Generate nanoID of length 10 characters using password`,
}, () => {
  nanoID(10, PASSWORD);
});

Deno.bench({
  name: `Generate nanoID of length 16 characters using password`,
}, () => {
  nanoID(16, PASSWORD);
});

Deno.bench({
  name: `Generate nanoID of length 32 characters using password`,
}, () => {
  nanoID(32, PASSWORD);
});

// WEB_SAFE

Deno.bench({
  name: `Generate nanoID of length 10 characters using WEB_SAFE`,
}, () => {
  nanoID(10, WEB_SAFE);
});

Deno.bench({
  name: `Generate nanoID of length 16 characters using WEB_SAFE`,
}, () => {
  nanoID(16, WEB_SAFE);
});

Deno.bench({
  name: `Generate nanoID of length 32 characters using WEB_SAFE`,
}, () => {
  nanoID(32, WEB_SAFE);
});
