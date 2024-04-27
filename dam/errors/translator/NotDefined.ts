import { DAMTranslatorError } from '../Translator.ts';
import type { Dialects, QueryTypes } from '../../mod.ts';
export class DAMNotDefined extends DAMTranslatorError {
  declare meta: {
    dialect: Dialects;
    queryType: QueryTypes;
    type: 'COLUMN' | 'EXPRESSION' | 'AGGREGATE' | 'RELATED_COLUMN';
    value: string;
  };

  constructor(
    meta: {
      dialect: Dialects;
      queryType: QueryTypes;
      type: 'COLUMN' | 'EXPRESSION' | 'AGGREGATE' | 'RELATED_COLUMN';
      value: string;
    },
    cause?: Error,
  ) {
    super(
      '${type} ${value} not defined for ${queryType}',
      meta,
      cause,
    );
  }
}
