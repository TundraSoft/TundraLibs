import { DAMTranslatorError } from '../Translator.ts';
import type { Dialects, QueryTypes } from '../../mod.ts';
export class DAMQueryTypeMismatch extends DAMTranslatorError {
  declare meta: { dialect: Dialects; queryType: QueryTypes };

  constructor(
    meta: {
      dialect: Dialects;
      queryType: QueryTypes;
      value?: string;
    },
    cause?: Error,
  ) {
    let message = 'Invalid query type ${value} passed for ${queryType}';
    if (meta.value === undefined) {
      message = 'Missing query type in definition for ${queryType}';
    }
    super(
      message,
      meta,
      cause,
    );
  }
}
