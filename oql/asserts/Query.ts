import type { DDLQuery, DDLTypes, DMLQuery, DMLTypes } from '../types/Query.ts';
import { assertEntityName } from './EntityName.ts';
import { assertQueryFilters } from './Filter.ts';
import { assertColumnDefinition } from './Column.ts';
import { assertExpression } from './Expression.ts';
import { assertAggregate } from './Aggregate.ts';

/**
 * Validate the common parts of a DDL query
 * @param query - The DDL query to validate
 * @throws {TypeError} If the query is invalid
 */
const validateDDLQueryBase: (
  query: unknown,
) => asserts query is { type: DDLTypes; schema?: string } = (
  query: unknown,
): asserts query is { type: DDLTypes; schema?: string } => {
  if (!query || typeof query !== 'object') {
    throw new TypeError('DDL query must be an object');
  }

  // Check type property
  if (!('type' in query) || typeof query.type !== 'string') {
    throw new TypeError('DDL query must have a string "type" property');
  }

  const validDDLTypes: DDLTypes[] = [
    'CREATE_SCHEMA',
    'DROP_SCHEMA',
    'CREATE_TABLE',
    'DROP_TABLE',
    'ALTER_TABLE',
    'CREATE_VIEW',
    'ALTER_VIEW',
    'DROP_VIEW',
    'CREATE_INDEX',
    'DROP_INDEX',
  ];

  if (!validDDLTypes.includes(query.type as DDLTypes)) {
    throw new TypeError(
      `DDL query type must be one of: ${validDDLTypes.join(', ')}`,
    );
  }

  // Check schema if present
  if ('schema' in query && query.schema !== undefined) {
    if (typeof query.schema !== 'string') {
      throw new TypeError('DDL query schema must be a string');
    }
    try {
      assertEntityName(query.schema);
    } catch (error) {
      throw new TypeError(`Invalid schema name: ${(error as Error).message}`);
    }
  }
};

/**
 * Asserts that the input is a valid DDL query
 * @param query - The query to validate
 * @param type - Optional specific DDL type to validate against
 * @throws {TypeError} If the query is invalid
 */
export const assertDDLQuery: <T extends DDLTypes = DDLTypes>(
  query: unknown,
  type?: T,
) => asserts query is DDLQuery<T> = <T extends DDLTypes = DDLTypes>(
  query: unknown,
  type?: T,
): asserts query is DDLQuery<T> => {
  validateDDLQueryBase(query);

  // Check if the type matches the expected type
  if (type && query.type !== type) {
    throw new TypeError(`Expected DDL query type ${type}, got ${query.type}`);
  }

  const q = query as Record<string, unknown>;

  // Validate properties based on the DDL type
  switch (q.type as DDLTypes) {
    case 'CREATE_SCHEMA':
    case 'DROP_SCHEMA':
      if (!q.schema) {
        throw new TypeError(`${q.type} requires a schema property`);
      }
      break;

    case 'CREATE_TABLE':
      if (typeof q.name !== 'string') {
        throw new TypeError('CREATE_TABLE requires a string name property');
      }
      assertEntityName(q.name);

      if (!Array.isArray(q.columns)) {
        throw new TypeError('CREATE_TABLE requires columns to be an array');
      }

      for (const column of q.columns) {
        assertColumnDefinition(column);
      }

      // Check primaryKeys if present
      if (q.primaryKeys !== undefined && !Array.isArray(q.primaryKeys)) {
        throw new TypeError('primaryKeys must be an array');
      }

      // Check uniqueKeys if present
      if (q.uniqueKeys && typeof q.uniqueKeys !== 'object') {
        throw new TypeError('uniqueKeys must be an object');
      }

      // Check foreignKeys if present
      if (q.foreignKeys && typeof q.foreignKeys !== 'object') {
        throw new TypeError('foreignKeys must be an object');
      }

      // Check indexes if present
      if (q.indexes && typeof q.indexes !== 'object') {
        throw new TypeError('indexes must be an object');
      }
      break;

    case 'DROP_TABLE':
    case 'DROP_VIEW':
    case 'DROP_INDEX':
      if (typeof q.name !== 'string') {
        throw new TypeError(`${q.type} requires a string name property`);
      }
      assertEntityName(q.name);
      break;

    case 'CREATE_INDEX':
      if (typeof q.name !== 'string') {
        throw new TypeError('CREATE_INDEX requires a string name property');
      }
      assertEntityName(q.name);

      if (typeof q.table !== 'string') {
        throw new TypeError('CREATE_INDEX requires a string table property');
      }
      assertEntityName(q.table);

      if (!Array.isArray(q.columns)) {
        throw new TypeError('CREATE_INDEX requires columns to be an array');
      }

      for (const column of q.columns) {
        if (typeof column !== 'string') {
          throw new TypeError('CREATE_INDEX columns must be strings');
        }
      }
      break;

    case 'ALTER_TABLE':
      if (typeof q.name !== 'string') {
        throw new TypeError('ALTER_TABLE requires a string name property');
      }
      assertEntityName(q.name);

      // At least one operation must be specified
      if (
        !q.dropColumns && !q.addColumns && !q.renameColumns &&
        !q.alterColumns && !q.addForeignKeys && !q.dropForeignKeys &&
        !q.addUniqueKeys && !q.dropUniqueKeys
      ) {
        throw new TypeError('ALTER_TABLE requires at least one operation');
      }

      // Check addColumns if present
      if (q.addColumns !== undefined) {
        if (!Array.isArray(q.addColumns)) {
          throw new TypeError('addColumns must be an array');
        }

        for (const column of q.addColumns) {
          assertColumnDefinition(column);
        }
      }

      // Check alterColumns if present
      if (q.alterColumns !== undefined) {
        if (!Array.isArray(q.alterColumns)) {
          throw new TypeError('alterColumns must be an array');
        }

        for (const column of q.alterColumns) {
          assertColumnDefinition(column);
        }
      }
      break;

    case 'CREATE_VIEW':
    case 'ALTER_VIEW':
      if (typeof q.name !== 'string') {
        throw new TypeError(`${q.type} requires a string name property`);
      }
      assertEntityName(q.name);

      if (!q.query) {
        throw new TypeError(`${q.type} requires a query property`);
      }

      if (typeof q.query !== 'string') {
        try {
          assertDMLQuery(q.query, 'SELECT');
        } catch (error) {
          throw new TypeError(
            `${q.type} query must be a string or valid SELECT query: ${
              (error as Error).message
            }`,
          );
        }
      }
      break;
  }
};

/**
 * Validate the common parts of a DML query
 * @param query - The DML query to validate
 * @throws {TypeError} If the query is invalid
 */
const validateDMLQueryBase: (
  query: unknown,
) => asserts query is { type: DMLTypes; table: string; schema?: string } = (
  query: unknown,
): asserts query is { type: DMLTypes; table: string; schema?: string } => {
  if (!query || typeof query !== 'object') {
    throw new TypeError('DML query must be an object');
  }

  // Check type property
  if (!('type' in query) || typeof query.type !== 'string') {
    throw new TypeError('DML query must have a string "type" property');
  }

  const validDMLTypes: DMLTypes[] = [
    'INSERT',
    'UPSERT',
    'UPDATE',
    'DELETE',
    'SELECT',
    'TRUNCATE',
  ];

  if (!validDMLTypes.includes(query.type as DMLTypes)) {
    throw new TypeError(
      `DML query type must be one of: ${validDMLTypes.join(', ')}`,
    );
  }

  // Check table property
  if (!('table' in query) || typeof query.table !== 'string') {
    throw new TypeError('DML query must have a string "table" property');
  }

  try {
    assertEntityName(query.table);
  } catch (error) {
    throw new TypeError(`Invalid table name: ${(error as Error).message}`);
  }

  // Check schema if present
  if ('schema' in query && query.schema !== undefined) {
    if (typeof query.schema !== 'string') {
      throw new TypeError('DML query schema must be a string');
    }
    try {
      assertEntityName(query.schema);
    } catch (error) {
      throw new TypeError(`Invalid schema name: ${(error as Error).message}`);
    }
  }
};

/**
 * Asserts that the input is a valid DML query
 * @param query - The query to validate
 * @param type - Optional specific DML type to validate against
 * @throws {TypeError} If the query is invalid
 */
export const assertDMLQuery: <T extends DMLTypes = DMLTypes>(
  query: unknown,
  type?: T,
) => asserts query is DMLQuery<T> = <T extends DMLTypes = DMLTypes>(
  query: unknown,
  type?: T,
): asserts query is DMLQuery<T> => {
  validateDMLQueryBase(query);

  // Check if the type matches the expected type
  if (type && query.type !== type) {
    throw new TypeError(`Expected DML query type ${type}, got ${query.type}`);
  }

  const q = query as Record<string, unknown>;

  // Check columns property for all types except TRUNCATE
  if (q.type !== 'TRUNCATE') {
    if (!('columns' in q) || !Array.isArray(q.columns)) {
      throw new TypeError(`${q.type} requires columns to be an array`);
    }

    for (const column of q.columns) {
      if (typeof column !== 'string') {
        throw new TypeError(`Column names in ${q.type} must be strings`);
      }
    }
  }

  // Validate properties based on the DML type
  switch (q.type as DMLTypes) {
    case 'TRUNCATE':
      // No additional validation needed
      break;

    case 'INSERT':
    case 'UPSERT':
      if (!('data' in q) || !Array.isArray(q.data)) {
        throw new TypeError(
          `${q.type} requires data to be an array of records`,
        );
      }

      if (
        q.data.length > 0 &&
        (typeof q.data[0] !== 'object' || q.data[0] === null)
      ) {
        throw new TypeError(`${q.type} data must contain objects`);
      }

      if (q.type === 'UPSERT') {
        if (!('conflictColumns' in q) || !Array.isArray(q.conflictColumns)) {
          throw new TypeError('UPSERT requires conflictColumns to be an array');
        }

        for (const column of q.conflictColumns) {
          if (typeof column !== 'string') {
            throw new TypeError('Conflict columns must be strings');
          }
        }
      }
      break;

    case 'UPDATE':
      if (!('data' in q) || typeof q.data !== 'object' || q.data === null) {
        throw new TypeError('UPDATE requires data to be an object');
      }

      if ('filters' in q && q.filters !== undefined) {
        try {
          assertQueryFilters(q.filters);
        } catch (error) {
          throw new TypeError(
            `Invalid UPDATE filters: ${(error as Error).message}`,
          );
        }
      }
      break;

    case 'DELETE':
      if ('filters' in q && q.filters !== undefined) {
        try {
          assertQueryFilters(q.filters);
        } catch (error) {
          throw new TypeError(
            `Invalid DELETE filters: ${(error as Error).message}`,
          );
        }
      }
      break;

    case 'SELECT': {
      if (!('project' in q) || !Array.isArray(q.project)) {
        throw new TypeError('SELECT requires project to be an array');
      }

      // Validate project columns
      const validProjectColumns = new Set<string>();

      // Add table columns to valid set
      if (Array.isArray(q.columns)) {
        for (const col of q.columns) {
          if (typeof col === 'string') {
            validProjectColumns.add(col);
          }
        }
      }

      // Add expression keys to valid set
      if (
        q.expressions && typeof q.expressions === 'object' &&
        q.expressions !== null
      ) {
        for (const key of Object.keys(q.expressions)) {
          validProjectColumns.add(key);
        }
      }

      // Add join tables with $ prefix to valid set
      if (q.joins && typeof q.joins === 'object' && q.joins !== null) {
        for (const key of Object.keys(q.joins)) {
          validProjectColumns.add(`$${key}`);
        }
      }

      // Validate each project column
      for (const column of q.project) {
        if (typeof column !== 'string') {
          throw new TypeError('Project columns must be strings');
        }

        // Skip validation for expression results and join tables with $ prefix
        if (column.startsWith('$') || validProjectColumns.has(column)) {
          continue;
        }

        throw new TypeError(
          `Invalid project column '${column}'. Must be a table column, an expression result, or a join table reference`,
        );
      }

      // Check expressions if present
      if ('expressions' in q && q.expressions !== undefined) {
        if (typeof q.expressions !== 'object' || q.expressions === null) {
          throw new TypeError('Expressions must be an object');
        }

        for (const [key, expr] of Object.entries(q.expressions)) {
          if (expr === undefined) continue;

          try {
            // Try as expression first
            assertExpression(expr);
          } catch {
            try {
              // Try as aggregate if not an expression
              assertAggregate(expr);
            } catch {
              throw new TypeError(
                `Expression '${key}' must be a valid expression or aggregate`,
              );
            }
          }
        }
      }

      // Check filters if present
      if ('filters' in q && q.filters !== undefined) {
        try {
          assertQueryFilters(q.filters);
        } catch (error) {
          throw new TypeError(
            `Invalid SELECT filters: ${(error as Error).message}`,
          );
        }
      }

      // Check having if present
      if ('having' in q && q.having !== undefined) {
        try {
          assertQueryFilters(q.having);
        } catch (error) {
          throw new TypeError(
            `Invalid SELECT having: ${(error as Error).message}`,
          );
        }
      }

      // Check joins if present
      if ('joins' in q && q.joins !== undefined) {
        if (typeof q.joins !== 'object' || q.joins === null) {
          throw new TypeError('Joins must be an object');
        }

        for (const [relation, joinDef] of Object.entries(q.joins)) {
          if (typeof joinDef !== 'object' || joinDef === null) {
            throw new TypeError(
              `Join definition for '${relation}' must be an object`,
            );
          }

          if (!('table' in joinDef) || typeof joinDef.table !== 'string') {
            throw new TypeError(
              `Join '${relation}' must have a string table property`,
            );
          }

          assertEntityName(joinDef.table);

          if (!('columns' in joinDef) || !Array.isArray(joinDef.columns)) {
            throw new TypeError(
              `Join '${relation}' must have columns as an array`,
            );
          }

          if (
            !('on' in joinDef) || typeof joinDef.on !== 'object' ||
            joinDef.on === null
          ) {
            throw new TypeError(
              `Join '${relation}' must have an 'on' object for join conditions`,
            );
          }
        }
      }

      // Check limit if present
      if (
        'limit' in q && q.limit !== undefined && typeof q.limit !== 'number'
      ) {
        throw new TypeError('Limit must be a number');
      }

      // Check offset if present
      if (
        'offset' in q && q.offset !== undefined && typeof q.offset !== 'number'
      ) {
        throw new TypeError('Offset must be a number');
      }

      // Check orderBy if present
      if ('orderBy' in q && q.orderBy !== undefined) {
        if (typeof q.orderBy !== 'object' || q.orderBy === null) {
          throw new TypeError('orderBy must be an object');
        }

        for (
          const direction of Object.values(q.orderBy as Record<string, unknown>)
        ) {
          if (direction !== 'ASC' && direction !== 'DESC') {
            throw new TypeError(
              "orderBy values must be either 'ASC' or 'DESC'",
            );
          }
        }
      }
      break;
    }
  }
};
