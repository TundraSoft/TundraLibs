import type { Expressions } from '../expressions/mod.ts';
export type TranslatorProcessColumns = {
  columns: string[];
  expressions?: Record<string, Expressions>;
};
