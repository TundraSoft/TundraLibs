export type TLSOptions = {
  enabled: boolean, 
  ca: string[], 
  enforce: boolean
}
export type ConnectionOptions = {
  dialect: "POSTGRES" | "MYSQL", 
  database?: string, 
  hostname: string, 
  user: string, 
  password?: string, 
  port?: number, 
  poolSize?: number, 
  tls?: Partial<TLSOptions>, 
}

export type ClientEvents = {
  connect(): void;
  close(): void;
  error(message: string): void;
  longQuery(query: string): void;
}

const enum JsTypes {
  "VARCHAR" = "string", 
  "CHARACTER" = "string", 
  "NVARCHAR" = "string", 
  "TEXT" = "string", 
  "STRING" = "string", 
  "UUID" = "string", 
  "NUMERIC" = "number", 
  "NUMBER" = "number", 
  "DECIMAL" = "number", 
  "INTEGER" = "number", 
  "SMALLINT" = "number", 
  "TINYINT" = "number", 
  "FLOAT" = "number", 
  "SERIAL" = "number", 
  "BIGINTEGER" = "BigInt", 
  "BIGSERIAL" = "BigInt", 
  "BOOLEAN" = "boolean", 
  "BINARY" = "boolean", 
  "DATE" = "Date", 
  "DATETIME" = "Date", 
  "TIME" = "Date", 
  "TIMESTAMP" = "Date", 
  "JSON" = "json", 
};

type DBTypes = keyof typeof JsTypes;

// Validations
export type ValidationInput = string | number | BigInt | boolean | Date | JSON;
export type ValidationFunction = (col: string, data: ValidationInput, ...args: unknown[]) => boolean;

type DBField = {
  name?: string, 
  type: DBTypes, 
  encrypt?: boolean, // Should value be encrypted?
  nullable?: boolean, // Is this nullable
  primary?: boolean, // Is this primary key
  unique?: boolean, // Is this unique key (will become true if PK)
  generator?: string, // Use a generator for value
  validation?: ValidationFunction, // Validation
}

type DBTable = {
  schema?: string, 
  table: string, 
  encryptionKey?: string, 
  allowed?: {
    insert?: boolean, 
    update?: boolean, 
    delete?: boolean, 
  }
  fields: {
    [key: string]: DBField
  }
}

// type TableSchema<T extends DBTable> = {
//   // [Prop in Property]: string
//   [Property in keyof T]: T[Property]['type'];
// }

import DataValidators from "./DataValidators.ts";

type UserSchema = {
  id: string, 
  countryId: number, 
  mobile: number, 
  firstName?: string, 
  middleName?: string, 
  lastName?: string, 
  dob?: Date, 
  email?: string, 
  createdDate: Date
}

type UserRegister = Pick<UserSchema, "countryId" | "mobile" | "email">;

const UserSchemaConfig: DBTable = {
  schema: "public", 
  table: "Users", 
  fields: {
    id: {
      name: "Id", 
      type: "VARCHAR", 
      encrypt: true, 
      nullable: false, 
      primary: true, 
      unique: true, 
      validation: DataValidators.notNull
    }, 
    countryId: {
      type: "INTEGER", 
      nullable: false, 
    }, 
    mobile: {
      type: "INTEGER", 
      encrypt: true, 
      primary: true, 
    }, 
    firstName: {
      type: "STRING", 
      name: "FirstName", 
    }, 
    middleName: {
      type: "STRING", 
      name: "MiddleName", 
    }, 
    lastName: {
      type: "STRING", 
      name: "LastName", 
    }, 
    dob: {
      name: "DOB", 
      type: "DATE"
    }, 
    email: {
      type: "VARCHAR", 
    }, 
    createdDate: {
      type: "DATE"
    }
  }
};

class BaseModel<T> {
  protected _schema: DBTable;
  protected _primaryKeys: Array<string> = [];
  protected _uniqueKeys: Array<string> = [];
  protected _notNullKeys: Array<string> = [];
  
  constructor(schema: DBTable) {
    this._schema = schema;
    // Process schema
    this.__processSchema();
  }

  select() {}

  insert(data: T|T[]) {
    // Check if all required data is present
    
    // Generate insert statement

  }

  update() {}

  delete() {}

  validate(data: T[]): boolean[];
  validate(data: T): boolean;

  validate(data: T | T[]): boolean | boolean[] {
    if(Array.isArray(data)) {
      const retval: boolean[] = []
      data.forEach((value) => retval.push(this.validate(value)));
      return retval;
    }
    // Check if all validation requirements are met
    // Check if all not nulls are filled
    this._notNullKeys.forEach((value, key) => {
    })
    // Check if unique keys are filled
    this._uniqueKeys.forEach((value, key) => {
    })
    // Check if all PK's are filled
    this._primaryKeys.forEach((value, key) => {
    })
    return true;
  }
  
  // Called when data is to be sent to db
  protected _preProcess() {}

  // Called when data fetched from db
  protected _postProcess() {}

  private __processSchema() {
    for(const key in this._schema.fields) {
      if(this._schema.fields[key].primary) {
        this._primaryKeys.push(key);
      }
      if(this._schema.fields[key].unique && this._uniqueKeys.indexOf(key) == -1) {
        this._uniqueKeys.push(key);
      }
    }
  }
}

const a = new BaseModel<UserSchema>(UserSchemaConfig);