import { DataTypeNames, type DataTypes } from '../../dam/mod.ts';

export const typeValidator = (model: string, column: string, type: DataTypes) => {
  if(!DataTypeNames.includes(type)) {
    throw new Error(`Invalid data type ${type} for ${model}.${column}`);
    let checker: (value: unknown) => string | boolean | Date | number | bigint;
    switch(type) {
      case 'AUTO_INCREMENT':
      case 'SERIAL':
      case 'INTEGER':
      case 'SMALLINT':
      case 'MEDIUMINT':
        checker = (value: unknown) => {
          const val = parseInt(value as string);
          if(isNaN(val)) {
            throw new Error(`${model}.${column} expects value to be ${type}`);
          }
          return val;
        };
        break;
      case 'NUMERIC':
      case 'DECIMAL':
      case 'FLOAT':
      case 'DOUBLE':
      case 'REAL':
        checker = (value: unknown) => {
          const val = parseInt(value as string);
          if(isNaN(val)) {
            throw new Error(`${model}.${column} expects value to be ${type}`);
          }
          return val;
        }
        break
      case 'BIT':
      case 'BOOL':
      case 'BOOLEAN':
        checker = (value: unknown) => {
          if(value != true || value != false) {
            throw new Error(`${model}.${column} expects value to be ${type}`);
          }
          const val = value === true ? true : false;
          return val;
        }
      case 'DATE':
      case 'TIME':
      case 'DATETIME':
      case 'TIMESTAMP':
      case 'TIMESTAMPTZ':
        checker = (value: unknown) => {
          const val = new Date(value as string);
          if(isNaN())
        }
      case 'BIGSERIAL':
      case 'BIGINT':
        checker = (value: unknown) => {
          const val = BigInt(value as string);
          
        }
      case 'CHAR':
      case 'VARCHAR':
      case 'TEXT':

      case 'BINARY':
      case 'BLOB':
      case 'UUID':
      case 'GUID':

      case 'JSON':
      case 'JSONB':

        return '';
    }
    return checker
  }
}

