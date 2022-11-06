import { AbstractClient } from "./AbstractClient.ts";
import { DatabaseManager } from "./DatabaseManager.ts"
import type { ModelDefinition, ModelType, QueryFilter, Sorting, Pagination, QueryResult, SelectQuery, TruncateTableQuery, DeleteQuery } from "./types/mod.ts";
import { DefaultValidator } from './types/mod.ts';
import { GuardianProxy, Struct } from "../guardian/mod.ts";

export class Model<
  S extends ModelDefinition = ModelDefinition,
  T extends ModelType<S> = ModelType<S>,
> {
  protected _definition: S;
  protected _connectionName: string;
  protected _connection!: AbstractClient;
  protected _name: string;
  protected _schema?: string;
  protected _table: string;
  protected _isView = false;
  protected _aliasMap: Record<keyof T, string> = {} as Record<keyof T, string>;
  protected _notNulls: Array<keyof T> = [];
  protected _identityColumns: Array<keyof T> = [];
  protected _notNullOnce: Array<keyof T> = [];
  protected _disableUpdate: Array<keyof T> = [];
  protected _primaryKeys: Array<keyof T> = [];
  protected _uniqueKeys: Record<string, Array<keyof T>> = {};
  protected _foreignKeys: Record<string, {
    model?: string;
    schema?: string;
    table?: string, 
    columnMap: Record<string, string>;
  }> = {};
  // deno-lint-ignore no-explicit-any
  protected _validator: GuardianProxy<any>;
  protected _permissions: {
    select: boolean;
    insert: boolean;
    update: boolean;
    delete: boolean;
    truncate: boolean;
  } = {
    select: true,
    insert: true,
    update: true,
    delete: false, 
    truncate: false,
  }


  constructor(definition: S) {
    this._definition = definition;
    this._connectionName = definition.connection;
    // Check if it exists
    if(DatabaseManager.has(this._connectionName) === false) {
      throw new Error(`Connection ${this._connectionName} does not exist`);
    }
    // Process and validate the model definition
    this._name = definition.name.trim();
    if(definition.schema) {
      this._schema = definition.schema.trim();
    }
    this._table = definition.table.trim();
    if(definition.permissions) {
      Object.entries(definition.permissions).forEach(([key, value]) => {
        this._permissions[key as keyof typeof this._permissions] = value;
      });
    }
    if(definition.isView) {
      this._isView = true;
      this._permissions.insert = false;
      this._permissions.update = false;
      this._permissions.delete = false;
      this._permissions.truncate = false;
    }
    // Validation definition
    // deno-lint-ignore no-explicit-any
    const validator: Record<string, GuardianProxy<any>> = {};
    // Cycle through the columns and validate the definition
    for (const [name, columnDefinition] of Object.entries(definition.columns)) {
      // Add to column map
      this._aliasMap[name as keyof T] = (columnDefinition.name || name) as string;
      // Now we go through the data type
      if(['SERIAL', 'SMALLSERIAL', 'BIGSERIAL', 'AUTO_INCRIEMENT'].includes(columnDefinition.type.toUpperCase())) {
        this._identityColumns.push(name as keyof T);
      }
      // Not Nullable check
      if(columnDefinition.isNullable === undefined || columnDefinition.isNullable === false) {
        // Ignore if datatype is an identity column
        if(!this._identityColumns.includes(name as keyof T)) {
          this._notNulls.push(name as keyof T);
        }
      }
      // Columns where updates are disabled
      if (columnDefinition.disableUpdate === true) {
        this._disableUpdate.push(name as keyof T);
      }
      // Not null once data is available
      if (columnDefinition.notNullOnce === true && !this._disableUpdate.includes(name as keyof T)) {
        this._notNullOnce.push(name as keyof T);
      }
      // Validator
      const hasValidation = (columnDefinition.validation !== undefined);
      if (hasValidation) {
        validator[name] = columnDefinition.validation;
      } else {
        validator[name] = DefaultValidator[columnDefinition.type];

        // Add length spec if possible
        if (columnDefinition.length && typeof columnDefinition.length === "number") {
          validator[name].max(columnDefinition.length);
        }

        // Finally add optional
        if (columnDefinition.isNullable) {
          validator[name].optional();
        }
      }
    }
    this._validator = Struct(validator, `Validation failed for model ${this.name}`, 'PARTIAL');
    // Primary key
    if(definition.primaryKey) {
      definition.primaryKey.forEach((key) => {
        if(this._aliasMap[key as keyof T] === undefined) {
          throw new Error(`Primary key ${key} is not defined in model ${this.name}`);
        }
        this._primaryKeys.push(key as keyof T);
      });
    }
    if(definition.uniqueKeys) {
      for(const [key, value] of Object.entries(definition.uniqueKeys)) {
        value.forEach((column) => {
          if(this._aliasMap[column as keyof T] === undefined) {
            throw new Error(`Unique key ${key} is not defined in model ${this.name}`);
          }
        });
        this._uniqueKeys[key] = Array.from(value) as Array<keyof T>;
      }
    }
    // Foreign keys
    if(definition.foreignKeys) {
      for(const [key, value] of Object.entries(definition.foreignKeys)) {
        if(value.model === undefined && value.table === undefined) {
          throw new Error(`Either Model name or table name must be defined for foreign key ${key} in model ${this.name}`);
        }
        if(value.table === undefined) {
          // Model name is present, try to look for it
          // TODO: Implement this
        }
        // Loop through column and ensure it is present here
        for(const [column, foreignColumn] of Object.entries(value.columnMap)) {
          if(this._aliasMap[column as keyof T] === undefined) {
            throw new Error(`Foreign key ${key} is not defined in model ${this.name}`);
          }
          // Check if foreign column is present in remote model
          // TODO : Implement this
          // Check data type
          // TODO : Implement this
        }
        this._foreignKeys[key] = {
          model: value.model,
          schema: value.schema,
          table: value.table,
          columnMap: value.columnMap,
        };
      }
    }
    // Done!
  }

  get name(): string {
    return this._name;
  }

  get isView(): boolean {
    return this._isView;
  }

  get schema(): string | undefined {
    return this._schema;
  }

  get table(): string {
    return this._table;
  }

  hasColumn(name: string): boolean {
    name = name.trim().toLowerCase();
    const colNames = Object.keys(this._aliasMap).map((key) => key.toLowerCase().trim());
    return colNames.includes(name);
  }

  getColumnName(name: keyof T): string {
    const colName = this._aliasMap[name];
    if(colName === undefined) {
      throw new Error(`Column ${name as string} is not defined in model ${this.name}`);
    }
    return colName;
  }

  isNullable(name: keyof T): boolean {
    return this._notNulls.includes(name);
  }

  isIdentity(name: keyof T): boolean {
    return this._identityColumns.includes(name);
  }

  /**
   * select
   * Perform a select operation on the table
   *
   * @param filters Filters<T> Filter condition
   * @param sort QuerySorting<T> Sorting options
   * @param paging QueryPaging Pagination options
   * @returns QueryResult<T>
   */
  public async select(
    filters?: QueryFilter<T>,
    sort?: Sorting<T>,
    paging?: Pagination,
  ): Promise<QueryResult<T>> {
    if (this._permissions.select === false) {
      // throw new ModelPermission(
      //   "select",
      //   this.name,
      //   this._connection.name,
      // );
      throw new Error("Permission denied");
    }
    if (!paging && (this._definition.pageSize || 0) > 0) {
      paging = {
        limit: this._definition.pageSize || 0,
        page: 1,
      };
    }
    const options: SelectQuery<T> = {
      type: "SELECT", 
      schema: this.schema,
      table: this.table,
      columns: this._aliasMap,
      filters: filters,
      sorting: sort,
      pagination: paging,
    };
    await this._init();
    return await this._connection.select<T>(options);
  }

  /**
   * count
   *
   * Count the number of rows in the table. Supports filtering.
   *
   * @param filters Filters<T> Filter condition
   * @returns QueryResult<T>
   */
  public async count(
    filters?: QueryFilter<T>,
  ): Promise<QueryResult<T>> {
    if (this._permissions.select === false) {
      // throw new ModelPermission(
      //   "select",
      //   this.name,
      //   this._connection.name,
      // );
      throw new Error("Permission denied");
    }
    const options: SelectQuery<T> = {
      type: "COUNT", 
      schema: this.schema,
      table: this.table,
      columns: this._aliasMap,
      filters: filters,
    };
    await this._init();
    return await this._connection.count<T>(options);
  }




  /**
   * delete
   *
   * Deletes records in the table.
   *
   * @param filter Filters<T> Filter condition basis which to delete
   * @returns QueryResult<T>
   */
  public async delete(filter?: QueryFilter<T>): Promise<QueryResult<T>> {
    if (this._permissions.delete === false) {
      // throw new ModelPermission(
      //   "delete",
      //   this.name,
      //   this._connection.name,
      // );
      throw new Error("Permission denied");
    }
    await this._init();

    const options: DeleteQuery<T> = {
      type: "DELETE",
      schema: this.schema,
      table: this.table,
      columns: this._aliasMap,
      filters: filter,
    };

    return await this._connection.delete<T>(options);
  }
  
  /**
   * truncate
   *
   * Truncates the table
   */
  public async truncate(): Promise<void> {
    if (this._permissions.truncate === false) {
      // throw new ModelPermission(
      //   "truncate",
      //   this.name,
      //   this._connection.name,
      // );
      throw new Error("Permission denied");
    }
    await this._init();
    const options: TruncateTableQuery = {
      type: "TRUNCATE",
      schema: this.schema,
      table: this.table,
    };

    await this._connection.truncateTable(options);
  }

  /**
   * _init
   *
   * Initialize the model
   */
  protected async _init() {
    if (!this._connection) {
      this._connection = await DatabaseManager.get(this._connectionName);
    }
  }
}