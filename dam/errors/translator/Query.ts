import type { QueryTypes } from '../../mod.ts';
import { TranslatorError } from '../Translator.ts';

export class BaseQueryError extends TranslatorError {
  declare meta: { dialect: string; queryType: QueryTypes };
  constructor(
    message: string,
    meta: {
      dialect: string;
      queryType: QueryTypes;
    },
    cause?: Error,
  ) {
    super(
      message,
      meta,
      cause,
    );
  }

  get queryType(): string {
    return this.meta.queryType;
  }
}

export class QueryTypeMismatch extends BaseQueryError {
  declare meta: { dialect: string; queryType: QueryTypes };

  constructor(
    meta: {
      dialect: string;
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

export class MissingColumnDefinition extends BaseQueryError {
  declare meta: { dialect: string; queryType: QueryTypes; column: string };

  constructor(
    meta: {
      dialect: string;
      queryType: QueryTypes;
      column: string;
    },
    cause?: Error,
  ) {
    super(
      'Unknown column ${column} used in ${queryType} query',
      meta,
      cause,
    );
  }
}

export class InvalidQueryExpression extends BaseQueryError {
  declare meta: { dialect: string; queryType: QueryTypes; expression: string };

  constructor(
    meta: {
      dialect: string;
      queryType: QueryTypes;
      expression: string;
    },
    cause?: Error,
  ) {
    super(
      'Invalid query expression: ${expression}',
      meta,
      cause,
    );
  }
}

export class InvalidQueryAggregation extends BaseQueryError {
  declare meta: { dialect: string; queryType: QueryTypes; aggregation: string };

  constructor(
    meta: {
      dialect: string;
      queryType: QueryTypes;
      aggregation: string;
    },
    cause?: Error,
  ) {
    super(
      'Invalid query aggregation: ${aggregation}',
      meta,
      cause,
    );
  }
}

export class InvalidQueryFilter extends BaseQueryError {
  declare meta: { dialect: string; queryType: QueryTypes; filter: string };

  constructor(
    meta: {
      dialect: string;
      queryType: QueryTypes;
      filter: string;
    },
    cause?: Error,
  ) {
    super(
      'Invalid query filter: ${filter}',
      meta,
      cause,
    );
  }
}

export class InvalidSortOrder extends BaseQueryError {
  declare meta: {
    dialect: string;
    queryType: QueryTypes;
    column: string;
    order: string;
  };

  constructor(
    meta: {
      dialect: string;
      queryType: QueryTypes;
      order: string;
    },
    cause?: Error,
  ) {
    super(
      'Invalid sort order: ${order}',
      meta,
      cause,
    );
  }
}
