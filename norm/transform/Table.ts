import type {
  ColumnDefinition,
  SchemaDefinition,
  TableDefinition,
} from '../types/mod.ts';

export const transform = (schema: SchemaDefinition) => {
};
// Transform to DAM compatible structure

export const transformTable = (name: string, table: TableDefinition) => {
  const damStructure: {
      source: string;
      schema?: string;
      columns: string[];
      expressions?: [];
    } = {
      source: table.name,
      schema: table.schema,
      columns: [],
    },
    expressions: string[] = [],
    normalizeExpressionColumns = (expression: any) => {
      const args = Array.isArray(expression.$args)
        ? expression.$args
        : [expression.$args];
      args.forEach((arg: string) => {
        if (arg.startsWith('$')) {
          if (!damStructure.columns.includes(arg.substring(1))) {
            throw new Error(`Column ${arg} not found in columns`);
          }
        } else if (
          typeof arg === 'object' && Object.keys(arg).includes('$expr')
        ) {
          normalizeExpressionColumns(arg);
        }
      });
    };

  Object.entries(table.columns).forEach(([columnName, column]) => {
    if (!Object.keys(column).includes('$expr')) {
      const name = (column as ColumnDefinition).name || columnName;
      damStructure.columns.push(name);
    }
  });
  // Ok now process expressions
  Object.entries(table.columns).forEach(([columnName, column]) => {
    if (Object.keys(column).includes('$expr')) {
      // Replace $args with actual column names
    }
  });
};
