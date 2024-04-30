import type { DateExpressions } from './Date.ts';
import { NumberExpressions } from './Number.ts';
import { UUIDExpressions } from './UUID.ts';
type Substr = {
  $expr: 'SUBSTR';
  $args: [
    string | StringExpressions,
    number | NumberExpressions,
    number | NumberExpressions,
  ];
};

type Concat = {
  $expr: 'CONCAT';
  $args: (string | StringExpressions)[];
};

type Replace = {
  $expr: 'REPLACE';
  $args: [
    StringExpressions | string,
    StringExpressions | string,
    StringExpressions | string,
  ];
};

type Lower = {
  $expr: 'LOWER';
  $args: UUIDExpressions | StringExpressions | string;
};

type Upper = {
  $expr: 'UPPER';
  $args: UUIDExpressions | StringExpressions | string;
};

type Trim = {
  $expr: 'TRIM';
  $args: UUIDExpressions | StringExpressions | string;
};

type DateFormat = {
  $expr: 'DATE_FORMAT';
  $args: [DateExpressions, string];
};

type Encrypt = {
  $expr: 'ENCRYPT';
  $args: [
    string | StringExpressions | NumberExpressions | DateExpressions,
    string,
  ];
};

type Decrypt = {
  $expr: 'DECRYPT';
  $args: [string, string];
};

type Hash = {
  $expr: 'HASH';
  $args: [string | StringExpressions];
};

export type StringExpressions =
  | Substr
  | Concat
  | Replace
  | Lower
  | Upper
  | Trim
  | DateFormat
  | Encrypt
  | Decrypt
  | Hash;
