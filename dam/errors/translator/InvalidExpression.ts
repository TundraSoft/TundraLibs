import type { Dialects, QueryTypes } from '../../mod.ts';
import { DAMTranslatorError } from '../Translator.ts';

export class DAMInvalidExpression extends DAMTranslatorError {
  declare meta: {
    dialect: Dialects;
    type?: QueryTypes; // QueryTypes in which error occured
    column?: string; // Column name in which error occured
    expression?: string; // Aggregate type in which error occured
  };

  constructor(
    meta: {
      dialect: Dialects;
      type?: string;
      column?: string;
      expression?: string;
    },
    cause?: Error,
  ) {
    super('Invalid/Miconfigured expression', meta, cause);
  }

  type(): string | undefined {
    return this.meta.type;
  }

  column(): string | undefined {
    return this.meta.column;
  }

  expression(): string | undefined {
    return this.meta.expression;
  }
}
