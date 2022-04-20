const alphabets = "abcdefghijklmnopqrstuvwxyz";
const numbers = "0123456789";
const alphaNumericCase = alphabets + numbers;
const alphaNumeric = alphaNumericCase + alphabets.toUpperCase();
const webSafe = alphabets + "_" + numbers + "-" + alphabets.toUpperCase();
const password = "!@$%^&*" + webSafe;

export {
  alphabets,
  alphaNumeric,
  alphaNumericCase,
  numbers,
  password,
  webSafe,
};
