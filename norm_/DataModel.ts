import type {
  ColumnDefinition,
  ModelType,
  SchemaDefinition,
} from './types/mod.ts';
import type { DeepWritable } from '../utils/mod.ts';
const model = {
  User: {
    name: 'Users',
    schema: 'UserGroup',
    type: 'TABLE',
    columns: {
      Id: { name: 'id', type: 'UUID' },
      Name: { type: 'VARCHAR', pattern: '/^a-z0-9$/i' },
      DOB: { type: 'DATE' },
      RollNo: { type: 'INTEGER', range: [1, 44] },
      Profile: {
        type: 'JSON',
        structure: { FullName: 'VARCHAR', Bio: 'VARCHAR' },
        nullable: true,
      },
    },
    primaryKeys: ['Id'],
    uniqueKeys: {
      name: ['Name'],
    },
  },
} as const;

type DataModelType = DeepWritable<typeof model>;

type Primitives = string | number | bigint | Date | boolean; // undefined | null
type ValidatorFunction<T> = (value: T) => T;

const requiredValidator = <T extends Primitives>(
  model: string,
  column: string,
): ValidatorFunction<T> => {
  return (value: T) => {
    if (value === undefined || value === null) {
      throw new Error('Value must be defined!');
    }
    return value;
  };
};

const lovValidator = <T extends Primitives>(
  model: string,
  column: string,
  lov: Array<T>,
): ValidatorFunction<T> => {
  return (value: T) => {
    if (!lov.includes(value)) {
      throw new Error('Value not part of list');
    }
    return value;
  };
};

const rangeValidator = <T extends Primitives>(
  model: string,
  column: string,
  from: T,
  to: T,
): ValidatorFunction<T> => {
  return (value: T) => {
    if (value < from || value > to) {
      throw new Error('Out of Range');
    }
    return value;
  };
};

const patternValidator = <T extends Primitives>(
  model: string,
  column: string,
  pattern: string | RegExp,
): ValidatorFunction<T> => {
  const reg = new RegExp(pattern);
  return (value: T) => {
    if (reg.test(value.toString()) === false) {
      throw new Error('Pattern mismatch');
    }
    return value;
  };
};

const buildValidators = <
  S extends SchemaDefinition,
  TN extends keyof S = keyof S,
>(model: S, name: TN): ModelType<S, TN> => {
  const a = {} as ModelType<S, TN>;
  Object.entries(model[name].columns).forEach(([name, d]) => {
    if (!Object.keys(d).includes('$expr')) {
      const cd = d as ColumnDefinition;
      // Extract validations
    }
  });
  return a;
};

const a = buildValidators<DataModelType>(model as DataModelType, 'User');

// const a = requiredValidator<string>('abc', 'xyz');
// const b = lovValidator<string>('abc', 'ddd', ['a', 'b', 'c'])
