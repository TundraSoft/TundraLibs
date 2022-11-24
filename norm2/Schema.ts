import { DataTypes, ModelDefinition, ModelType } from "./types/mod.ts";
import { Model } from './Model.ts';
import { DatabaseManager } from "./DatabaseManager.ts";

DatabaseManager.register('default', {
  dialect: 'POSTGRES',
  host: 'localhost',
  port: 49153,
  userName: 'postgres',
  password: 'postgrespw',
  database: 'postgres',
});

export type SchemaDefinition = Record<string, ModelDefinition>;

// Basically the Schema Config definition
export type SchemaType<SchemaDefinition extends Record<string, ModelDefinition>> = {
  [Key in keyof SchemaDefinition]: ModelType<SchemaDefinition[Key]>;
}

let _inst: Schema<SchemaDefinition, SchemaType<SchemaDefinition>>;

export class Schema<SD extends SchemaDefinition = SchemaDefinition, ST extends SchemaType<SD> = SchemaType<SD>> {
  protected static _instance: Schema;

  private _models: Record<string, Model> = {};
  private _schema: SchemaDefinition = {};

  protected constructor(schema: SD) {
    this._schema = schema;
    this._init();
  }

  public static init<SD extends SchemaDefinition>(schema: SchemaDefinition) {
    if(!_inst) {
      _inst = new Schema<typeof schema>(schema);
    }
    return _inst;
  }

  private _init() {
    for (const [key, value] of Object.entries(this._schema)) {
      this._models[key] = new Model(value);
    }
  }

  public get<T extends keyof ST>(name: T): Model<ModelDefinition, ST[T]> {
    return this._models[name as keyof SchemaDefinition] as Model<ModelDefinition, ST[T]>;
  }
}

const schema = {
  Users: {
    name: 'Users', 
    table: 'Users', 
    schema: 'public', 
    connection: 'default',
    columns: {
      id: {
        type: "INTEGER", 
      }, 
      name: {
        type: DataTypes.VARCHAR,
        isNullable: true
      }, 
      email: {
        type: DataTypes.VARCHAR,
        isNullable: true
      }
    }
  }, 
  Groups: {
    name: 'Groups',
    table: 'Groups',
    schema: 'public',
    connection: 'default',
    columns: {
      id: {
        type: DataTypes.INTEGER,
      },
      name: {
        type: DataTypes.VARCHAR,
        isNullable: true
      }, 
    }, 
  }
} as const;

type dfdf = SchemaType<typeof schema>;
const Schemas = Schema.init<typeof schema>(schema);

Schemas.get('Users'); 