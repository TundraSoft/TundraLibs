import type { Dialects, QueryTypes } from '../../mod.ts';
import { DAMTranslatorError } from '../Translator.ts';

export class DAMInvalidAggregate extends DAMTranslatorError {
  declare meta: {
    dialect: Dialects;
    type?: QueryTypes; // QueryTypes in which error occured
    column?: string; // Column name in which error occured
    aggregate?: string; // Aggregate type in which error occured
  };

  constructor(
    meta: {
      dialect: Dialects;
      type?: string;
      column?: string;
      aggregate?: string;
    },
    cause?: Error,
  ) {
    super('Invalid/Miconfigured aggregate', meta, cause);
  }

  type(): string | undefined {
    return this.meta.type;
  }

  column(): string | undefined {
    return this.meta.column;
  }

  aggregate(): string | undefined {
    return this.meta.aggregate;
  }
}
