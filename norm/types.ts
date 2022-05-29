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
  default?: Function, // default value
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
  dob?: Date, 
  email?: string, 
  createdDate: Date
}

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
  
  constructor(schema: DBTable) {
    this._schema = schema;
    // Process schema
    this.__processSchema();
  }

  insert(data: Partial<T>|Partial<T>[]) {
    // Check if all required data is present
    // Validate
  }

  validate(data: Partial<T>): boolean {
    // Check if all validation requirements are met
    // Check if all PK's are filled
    // Check if all not nulls are filled
    // Check if 
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
      if(this._schema.fields[key].unique) {
        this._uniqueKeys.push(key);
      }
      
    }
  }
}

const a = new BaseModel<UserSchema>(UserSchemaConfig);