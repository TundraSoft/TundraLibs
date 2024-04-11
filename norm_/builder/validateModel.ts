import type {
  ColumnDefinition,
  SchemaDefinition,
  TableDefinition,
  ViewDefinition,
} from '../types/mod.ts';
import {
  DataTypeNames,
  ExpressionNames,
  type Expressions,
} from '../../dam/mod.ts';
import type { DeepReadOnly, DeepWritable } from '../../utils/mod.ts';

export const validateModel = <TConfig extends SchemaDefinition>(
  model: TConfig,
) => {
  const schemaNames: string[] = [],
    tables: Record<string, TableDefinition> = {},
    views: Record<string, ViewDefinition> = {};

  Object.entries(model).forEach(([name, model]) => {
    if (model.schema && !schemaNames.includes(model.schema)) {
      schemaNames.push(model.schema);
    }
    // Generic components
    if (model.name === undefined) {
      // Set the const name itself as the table/view name
      model.name = name;
    }
    if (tables[name] || views[name]) {
      throw new Error(`Model ${name} already exists`);
    }

    if (model.type === undefined) {
      throw new Error(`Model ${name} is missing a type`);
    }

    if (model.columns === undefined) {
      throw new Error(`Column definitions are missing for model ${name}`);
    }

    Object.entries(model.columns).forEach(([columnName, column]) => {
      if (!Object.keys(column).includes('$expr')) {
        column = column as ColumnDefinition;
        if (column.name === undefined) {
          column.name = columnName;
        }
        if (!DataTypeNames.includes(column.type)) {
          throw new Error(
            `Invalid data type ${column.type} for column ${columnName} in model ${name}`,
          );
        }
        const { lov, range } = {
          lov: undefined,
          range: undefined,
          ...column,
        } as {
          lov?: Array<string | bigint | Date>;
          range?: [number, number] | [bigint, bigint] | [Date, Date];
        };
        if (range) {
          if (range.length !== 2) {
            throw new Error(
              `Invalid range for column ${columnName} in model ${name}`,
            );
          }
          if (range[0] > range[1]) {
            throw new Error(
              `Invalid range for column ${columnName} in model ${name}`,
            );
          }
        }
        if (lov) {
          if (!Array.isArray(lov)) {
            throw new Error(
              `Invalid list of values for column ${columnName} in model ${name}`,
            );
          }
        }
      } else {
        column = column as Expressions;
        if (column.$expr === undefined) {
          throw new Error(
            `Invalid expression for column ${columnName} in model ${name}`,
          );
        }
        if (!ExpressionNames.includes(column.$expr)) {
          throw new Error(
            `Invalid expression type for column ${columnName} in model ${name}`,
          );
        }
      }
    });

    if (model.type === 'TABLE') {
      tables[name] = model;
    } else {
      views[name] = model;
    }
  });
};

import { DataModel } from '../tests/testdata/DataModel.ts';

validateModel(DataModel as unknown as SchemaDefinition);
