export type Typeof = {
  'string': string;
  'number': number;
  'object': object; // eslint-disable-line @typescript-eslint/ban-types
  'boolean': boolean;
  'symbol': symbol;
  'bigint': bigint;
  'date': Date;
  'undefined': undefined;
};

type FunctionParameter = unknown;
function typeCast<T extends keyof Typeof, P extends FunctionParameter = Typeof[T]> (type: T) {
  return (arg: P): Typeof[T] => {
    if(typeof arg !== type || arg === null) {
      throw TypeError(`Expected ${type} got ${typeof arg}`)
    }
    return arg as Typeof[T];
  }
}

const stringType = typeCast('string'), 
  numberType = typeCast('number'), 
  booleanType = typeCast('boolean'), 
  bigintType = typeCast('bigint'), 
  dateType = typeCast('date'), 
  objectType = typeCast('object')

export const DataTypes = {
  "VARCHAR": typeCast('string'), 
  "NUMBER": typeCast('number')
}

export const enum DataTypes2 {
  "VARCHAR" = "VARCHAR",
  "CHARACTER" = "CHARACTER",
  "NVARCHAR" = "NVARCHAR",
  "TEXT" = "TEXT",
  "STRING" = "STRING",
  "UUID" = "UUID",
  "GUID" = "GUID",
  "NUMERIC" = "NUMERIC",
  "NUMBER" = "NUMBER",
  "DECIMAL" = "DECIMAL",
  "INTEGER" = "INTEGER",
  "SMALLINT" = "SMALLINT",
  "TINYINT" = "TINYINT",
  "FLOAT" = "FLOAT",
  "SERIAL" = "SERIAL",
  "BIGINTEGER" = "BIGINTEGER",
  "BIGSERIAL" = "BIGSERIAL",
  "BOOLEAN" = "BOOLEAN",
  "BINARY" = "BINARY",
  "DATE" = "DATE",
  "DATETIME" = "DATETIME",
  "TIME" = "TIME",
  "TIMESTAMP" = "TIMESTAMP",
  "JSON" = "JSON",
}

type ValidatorFunction<T> = (value?: T, ...args: unknown[]) => boolean;

type SchemaColumnDefinition<T> = {
  name?: string;
  dataType: keyof typeof DataTypes; 
  isNullable: boolean;
  validators?: Array<ValidatorFunction<T>>, 
}

type SchemaDefinition<T> = {
  connection?: string;
  schema?: string;
  table: string;
  columns: {
    [key: string]: SchemaColumnDefinition<T>
  };
  primaryKeys: Array<keyof SchemaDefinition<T>['columns']>;
  uniqueKeys: Record<string, Array<keyof SchemaDefinition<T>['columns']>>;
}

const Schema = <S extends SchemaDefinition<unknown>>(
  s: S
) => {
  // Validate definition here
  console.log(s.columns);
  return s as S;
};

const UserSchema = Schema({
  schema: 'public', 
  table: 'User', 
  columns: {
    id: {
      dataType: DataTypes2.NUMBER, 
      // type: 'string', 
      isNullable: false, 
    }, 
    name: {
      dataType: DataTypes2.VARCHAR, 
      isNullable: true
    }
  }, 
  primaryKeys: ['id'], 
  uniqueKeys: {'dummy': ['name']}
})

type PartialPartial<T, K extends keyof T> = Partial<Pick<T, K>> & Omit<T, K> extends
  infer O ? { [P in keyof O]: O[P] } : never;

type KeysMatching<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T];

type ExtractType<T extends { [K in keyof T]: SchemaColumnDefinition<any> }> = PartialPartial<{
  [K in keyof T]: ReturnType<typeof DataTypes[T[K]['dataType']]>
}, KeysMatching<T, { isNullable: true }>>

// type ExtractColumns<T, K extends keyof T> = Pick<T, K>;

// type columns = ExtractColumns<typeof UserSchema, 'columns'>;

type User = ExtractType<typeof UserSchema.columns>

class Model<S extends SchemaDefinition<unknown>, T extends ExtractType<S['columns']> = ExtractType<S['columns']>> {
  constructor(private schema: S) { }
  b(): T {
    return {} as T;
  }
}

const cunt = new Model({
  schema: 'public', 
  table: 'User', 
  columns: {
    id: {
      dataType: DataTypes2.NUMBER, 
      // type: 'string', 
      isNullable: false, 
    }, 
    name: {
      dataType: DataTypes2.VARCHAR, 
      isNullable: true
    }
  }, 
  primaryKeys: ['id'], 
  uniqueKeys: {'dummy': ['name']}
});
const a = cunt.b()