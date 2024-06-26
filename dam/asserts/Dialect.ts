import type { Dialects, SQLDialects } from '../types/Dialects.ts';

export const assertSQLDialect = (x: unknown): x is SQLDialects => {
  return typeof x === 'string' && ['MARIA', 'POSTGRES', 'SQLITE'].includes(x);
};

export const assertDialect = (x: unknown): x is Dialects => {
  return assertSQLDialect(x) || x === 'MONGO';
};
