import AbstractClient from "./AbstractClient.ts";
import { Database } from "./Database.ts";
// import { DataTypeMap, DataTypes } from "./types.ts";
import type {
  FilterOperators,
  Filters,
  QueryOptions,
  QueryPagination,
  QueryResult,
  QuerySorting,
  SchemaDefinition,
} from "./types.ts";

import type {
  ErrorList,
  GuardianProxy,
  StructValidatorFunction,
} from "../guardian/mod.ts";
import { Struct } from "../guardian/mod.ts";
// import { InvalidSchemaDefinition } from "./Errors.ts";

/**
 * Model
 *
 * Define a model. A model is the representation of a table. This class will help interact with
 * the table by writing CRUD statements on the fly and even perform data validations
 */
export class Model<T> {
  protected _connection!: AbstractClient;
  protected _schema: SchemaDefinition;
  protected _primaryKeys: Array<keyof T> = [];
  protected _identityKeys: Array<keyof T> = [];
  protected _uniqueKeys: Record<string, Array<keyof T>> = {};
  protected _columns: Record<keyof T, string>;
  protected _notNulls: Array<keyof T> = [];
  // deno-lint-ignore no-explicit-any
  protected _validators: StructValidatorFunction<any>;

  constructor(schema: SchemaDefinition) {
    this._schema = schema;
    // Process the schema
    if (!this._schema.connection) {
      this._schema.connection = "default";
    }
    // Create column alias mapping
    const columnAlias: Partial<Record<keyof T, string>> = {};
    // deno-lint-ignore no-explicit-any
    const validator: { [key: string]: GuardianProxy<any> } = {};
    for (const [column, definition] of Object.entries(this._schema.columns)) {
      columnAlias[column as keyof T] = (definition.name)
        ? definition.name
        : column;
      // Is it a PK
      if (definition.isPrimary === true) {
        this._primaryKeys.push(column as keyof T);
      }
      if (
        ["AUTO_INCREMENT", "SERIAL", "BIGSERIAL"].includes(definition.dataType)
      ) {
        this._identityKeys.push(column as keyof T);
      }
      if (definition.uniqueKey !== undefined) {
        if (this._uniqueKeys[definition.uniqueKey] === undefined) {
          this._uniqueKeys[definition.uniqueKey] = [];
        }
        this._uniqueKeys[definition.uniqueKey].push(column as keyof T);
      }
      // Is it nullable?
      if (
        !definition.isNullable === undefined || definition.isNullable === false
      ) {
        this._notNulls.push(column as keyof T);
      }
      if (definition.validator) {
        validator[column] = definition.validator;
      }
    }
    this._columns = columnAlias as Record<keyof T, string>;
    this._validators = Struct(
      validator,
      "Data does not conform to the schema",
      "PARTIAL",
    );
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
    filters?: Filters<T>,
    sort?: QuerySorting<T>,
    paging?: QueryPagination,
  ): Promise<QueryResult<T>> {
    await this._init();
    if (!paging && (this._schema.pageSize || 0) > 0) {
      paging = {
        size: this._schema.pageSize || 0,
        page: 1,
      };
    }
    const options: QueryOptions<T> = {
      schema: this._schema.schema,
      table: this._schema.table,
      columns: this._columns,
      filters: filters,
      sort: sort,
      paging: paging,
    };
    return await this._connection.select<T>(options);
  }

  /**
   * count
   *
   * Count the number of rows in the table. Supports filtering.
   *
   * @param filters Filters<T> Filter condition
   * @param sort QuerySorting<T> Sorting options
   * @param paging QueryPaging Pagination options
   * @returns QueryResult<T>
   */
  public async count(
    filters?: Filters<T>,
  ): Promise<QueryResult<T>> {
    await this._init();
    const options: QueryOptions<T> = {
      schema: this._schema.schema,
      table: this._schema.table,
      columns: this._columns,
      filters: filters,
    };
    return await this._connection.count<T>(options);
  }

  /**
   * insert
   * Insert record(s) into the table. If the schema definition has insert set to
   * disabled, then insert will be blocked
   *
   * @param data Array<Partial<T>>> The data to be inserted
   * @returns QueryResult<T>
   */
  public async insert(data: Array<Partial<T>>): Promise<QueryResult<T>> {
    if (this._schema.feature && this._schema.feature?.insert === false) {
      throw new Error(
        `[module=norm] Inserting not permitted for ${this._schema.table}`,
      );
    }
    await this._init();
    // Check bulk insert

    // Validate data
    const errors: { [key: number]: ErrorList } = {};
    data.forEach((row, ind) => {
      try {
        data[ind] = this._validators(row);
        // Identity columns to be removed
        if (this._identityKeys.length > 0) {
          this._identityKeys.forEach((key) => {
            delete row[key];
          });
        }
        // All columns which are not null must be present
        this._notNulls.forEach((key) => {
          if (row[key] === undefined) {
            throw new Error(
              `[module=norm] Column ${key} cannot be set as null`,
            );
          }
        });
        // Unique key check
      } catch (e) {
        // push all errors
        errors[ind] = e.toJSON();
      }
    });
    console.log("daf");
    if (Object.keys(errors).length > 0) {
      // @TODO - Make this better
      throw new Error(
        `[module=norm] Data does not conform to the schema definition. ${
          JSON.stringify(errors)
        }`,
      );
    }
    const options: QueryOptions<T> = {
      schema: this._schema.schema,
      table: this._schema.table,
      columns: this._columns,
      data: data,
    };
    return await this._connection.insert<T>(options);
  }

  /**
   * update
   * Update record(s). Using filters either a single record or multiple records can
   * be updated
   *
   * @param data Partial<T> Information to be updated
   * @param filter Filters<T> The filter condition basis which to update
   * @returns QueryResult<T>
   */
  public async update(
    data: Partial<T>,
    filter?: Filters<T>,
  ): Promise<QueryResult<T>> {
    if (this._schema.feature && this._schema.feature?.update === false) {
      throw new Error(
        `[module=norm] Updating not permitted for ${this._schema.table}`,
      );
    }
    await this._init();

    // Only data is passed so we create filter if PK is present in data
    if (filter === undefined) {
      // Check if PK is passed
      let pkPresent = true;
      this._primaryKeys.forEach((pk) => {
        if (data[pk] === undefined || data[pk] === null) {
          pkPresent = false;
        }
      });
      if (pkPresent) {
        // remove PK from data & set filter
        const pkFilter: { [key: string]: unknown } = {};
        this._primaryKeys.forEach((pk) => {
          pkFilter[String(pk)] = {
            $eq: data[pk as keyof T],
          };
          delete data[pk];
        });
        filter = pkFilter as Filters<T>;
      }
    }
    // For sanity sake, we check updated row count, if it is > 1 then we check if unique keys are being updated
    const options: QueryOptions<T> = {
      schema: this._schema.schema,
      table: this._schema.table,
      columns: this._columns,
      filters: filter,
    };
    // Check data, we cannot update primary keys
    const rowCount = await this._connection.count<T>(options);
    if (rowCount.totalRows > 1) {
      // Check unique key violation
      // let ukPresent = false;
      for (const [name, keys] of Object.entries(this._uniqueKeys)) {
        keys.forEach((columnName) => {
          if (data[columnName] !== undefined) {
            throw new Error(
              `[module=norm] Unique key column "${columnName}" of "${name}" present in a bulk update!`,
            );
          }
        });
      }
    }
    // Validate row and update!
    console.log("adsf");
    const errors = this.validateRow(data);
    console.log("af44");
    if (Object.keys(errors).length > 0) {
      throw new Error(
        `[module=norm] Validation of data passed for insert failed. ${
          JSON.stringify(errors)
        }`,
      );
    }

    // Ok other validations to be put here

    options.data = [data];
    console.log(options);
    return await this._connection.update<T>(options);
  }

  /**
   * delete
   * Deletes records in the table.
   *
   * @param filter Filters<T> Filter condition basis which to delete
   * @returns QueryResult<T>
   */
  public async delete(filter?: Filters<T>): Promise<QueryResult<T>> {
    if (this._schema.feature && this._schema.feature.delete === false) {
      throw new Error(
        `[module=norm] Delete not permitted for ${this._schema.table}`,
      );
    }
    const options: QueryOptions<T> = {
      schema: this._schema.schema,
      table: this._schema.table,
      columns: this._columns,
      filters: filter,
    };

    await this._init();
    return await this._connection.delete<T>(options);
  }

  /**
   * truncate
   *
   * Truncates the table
   */
  public async truncate(): Promise<void> {
    if (this._schema.feature && this._schema.feature.truncate === false) {
      throw new Error(
        `[module=norm] Delete not permitted for ${this._schema.table}`,
      );
    }
    const options: QueryOptions<T> = {
      schema: this._schema.schema,
      table: this._schema.table,
      columns: this._columns,
    };
    await this._init();
    await this._connection.truncate(options);
  }

  /**
   * checkConstraints
   *
   * Checks if the "constraints" - PrimaryKey and UniqueKey constraints are not violated
   * Typically called in insert and update
   *
   * @param data T The data to check
   * @returns boolean
   */
  public async checkConstraints(data: Partial<T>): Promise<boolean> {
    const finalFilter: Filters<T> = {};
    finalFilter.$and = [];
    const pkFilter: { [Property in keyof T]?: FilterOperators<T[Property]> } =
      {};
    const ukFilters: Filters<T> = {};
    ukFilters.$or = [];
    let shouldExec = false;
    // const ukFilter: Array<{[Property in keyof T]?: FilterOperators<T[Property]>}> = []
    this._primaryKeys.forEach((key) => {
      if (data[key as keyof T]) {
        pkFilter[key as keyof T] = { $neq: data[key as keyof T] };
      }
    });
    if (Object.keys(pkFilter).length > 0) {
      // hasPK = true;
      finalFilter.$and.push(pkFilter);
    }
    // If Unique keys are present then check if they are unique
    for (const [_name, keys] of Object.entries(this._uniqueKeys)) {
      const tmpFilter: {
        [Property in keyof T]?: FilterOperators<T[Property]>;
      } = {};
      // Build query to check
      keys.forEach((col) => {
        if (data[col as keyof T]) {
          tmpFilter[col as keyof T] = {
            $eq: data[col as keyof T],
          };
        }
      });
      if (Object.keys(tmpFilter).length > 0) {
        ukFilters.$or.push(tmpFilter);
      }
    }
    if (Object.keys(ukFilters).length > 0) {
      shouldExec = true;
      finalFilter.$and.push(ukFilters);
    }
    // Do not run, if no unique keys found
    if (shouldExec === false) {
      return true;
    }
    console.log(finalFilter);
    // Run count
    const op = await this.count(finalFilter);
    // If pkFilter is present, then op should be 0, else 1
    return op.totalRows == 0;
  }

  public validateRow(data: T | Partial<T>): ErrorList {
    try {
      this._validators(data);
    } catch (e) {
      return e.toJSON();
    }
    return {} as ErrorList;
  }
  /**
   * _init
   * Initialize the model
   */
  protected async _init() {
    if (!this._connection) {
      this._connection = await Database.getDatabase(
        this._schema.connection,
      );
    }
  }
}
