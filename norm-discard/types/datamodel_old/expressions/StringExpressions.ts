export type UUIDExpression = 'NEW_UUID';
export type GUIDExpression = 'NEW_GUID';
export type ConcatExpression = {
  concat: Array<StringExpressions | string>;
};
export type SubstringExpression = {
  substring: [StringExpressions | string, number, number];
};
export type ReplaceExpression = {
  replace: [StringExpressions | string, string, string];
};
export type LowerExpression = {
  lower: StringExpressions | string;
};
export type UpperExpression = {
  upper: StringExpressions | string;
};
export type TrimExpression = {
  trim: StringExpressions | string;
};
export type LengthExpression = {
  length: StringExpressions | string;
};
export type LeftExpression = {
  left: [StringExpressions | string, number];
};
export type RightExpression = {
  right: [StringExpressions | string, number];
};
export type LpadExpression = {
  lpad: [StringExpressions | string, number, string];
};
export type RpadExpression = {
  rpad: [StringExpressions | string, number, string];
};
export type PositionExpression = {
  position: [StringExpressions | string, StringExpressions | string];
};
export type StrposExpression = {
  strpos: [StringExpressions | string, StringExpressions | string];
};
export type RepeatExpression = {
  repeat: [StringExpressions | string, number];
};
export type ReverseExpression = {
  reverse: StringExpressions | string;
};
export type StrcmpExpression = {
  // strcmp: [StringExpressions | string, StringExpressions | string];
  expr: 'STRCMP';
  args: [StringExpressions | string, StringExpressions | string];
};
export type SpaceExpression = {
  expr: 'SPACE';
  args: [StringExpressions | string, number];
};

export type StringExpressions =
  | UUIDExpression
  | GUIDExpression
  | ConcatExpression
  | SubstringExpression
  | ReplaceExpression
  | LowerExpression
  | UpperExpression
  | TrimExpression
  | LengthExpression
  | LeftExpression
  | RightExpression
  | LpadExpression
  | RpadExpression
  | PositionExpression
  | StrposExpression
  | RepeatExpression
  | ReverseExpression
  | StrcmpExpression
  | SpaceExpression;

const _d: StringExpressions = {
  expr: 'STRCMP',
  args: ['a', { expr: 'SPACE', args: ['a', 1] }],
};
