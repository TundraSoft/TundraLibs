import type { SchemaDefinition, TableDefinition } from '../types/mod.ts';
import { isValidName } from './isValidName.ts';
import { NORMInvalidNameError } from '../errors/mod.ts';

export const TableValidator = (name: string, schema: SchemaDefinition) => {
  if (isValidName(name, true)) {
    throw new NORMInvalidNameError({
      model: name,
      value: name,
      item: 'table',
      isDBName: true,
    });
  }
  const table = schema[name] as TableDefinition;
  if (!table) {
    throw new NORMTableConfigError({
      model: name,
      item: 'table',
    });
  }
};
