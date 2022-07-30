import { AbstractClient } from "./AbstractClient.ts";
import { Database } from "./Database.ts";
import type {
  CountQueryOptions,
  CreateTableOptions,
  DeleteQueryOptions,
  // FilterOperators,
  Filters,
  InsertQueryOptions,
  ModelDefinition,
  ModelType,
  QueryOptions,
  QueryPagination,
  QueryResult,
  QuerySorting,
  SelectQueryOptions,
  UpdateQueryOptions,
} from "./types/mod.ts";

import type {
  ErrorList,
  GuardianProxy,
  // StructValidatorFunction,
} from "../guardian/mod.ts";
import {
  // Guardian,
  Struct,
  // type
} from "../guardian/mod.ts";

import {
  ModelNotNull,
  ModelPermission,
  ModelPrimaryKeyUpdate,
} from "./Errors.ts";
/**
 * Model
 *
 * Define a model. A model is the representation of a table. This class will help interact with
 * the table by writing CRUD statements on the fly and even perform data validations
 */
// export class Models<S extends ModelDefinition, T extends ModelType<S> = ModelType<S>> {
// }

// export class Model<T> {
export class Model<
  S extends ModelDefinition,
  T extends ModelType<S> = ModelType<S>,
> {
  protected _connection!: AbstractClient;
  protected _schema?: string;
  protected _table: string;
  protected _pageSize?: number;

  protected _model: ModelDefinition;
  protected _primaryKeys: Array<keyof T> = [];
  protected _identityKeys: Array<keyof T> = [];
  protected _uniqueKeys: Record<string, Array<keyof T>> = {};
  protected _columns: Record<keyof T, string>;
  protected _notNulls: Array<keyof T> = [];
  // deno-lint-ignore no-explicit-any
  protected _validator: GuardianProxy<any>;

  constructor(model: S) {
    this._model = model;
    this._schema = model.schema;
    this._table = model.table;
    this._pageSize = model.pageSize;

    const columnAlias: Partial<Record<keyof T, string>> = {};
    // deno-lint-ignore no-explicit-any
    const validator: { [key: string]: GuardianProxy<any> } = {};
    for (const [column, definition] of Object.entries(this._model.columns)) {
      const hasValidation = (definition.validator !== undefined);
      if (hasValidation) {
        validator[column] = definition.validator;
      }
      // Define validations
      // const validator: GuardianProxy<any> = hasValidation ? definition.validator : Guardian;
      columnAlias[column as keyof T] = definition.name || column;
      if (definition.isPrimary) {
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
      if (
        (definition.isNullable === undefined ||
          definition.isNullable === false) &&
        !this._identityKeys.includes(column as keyof T)
      ) {
        this._notNulls.push(column as keyof T);
      }
    }
    this._columns = columnAlias as Record<keyof T, string>;
    this._validator = Struct(
      validator,
      `Validation failed for model ${this._model.table}`,
      "PARTIAL",
    );
  }

  get schema(): string | undefined {
    return this._schema;
  }

  get table(): string {
    return this._table;
  }

  get schemaTable(): string {
    return `${
      this._schema !== undefined ? `${this._schema}.` : ""
    }${this._table}`;
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
    if (!paging && (this._model.pageSize || 0) > 0) {
      paging = {
        size: this._model.pageSize || 0,
        page: 1,
      };
    }
    const options: SelectQueryOptions<T> = {
      schema: this._model.schema,
      table: this._model.table,
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
    const options: CountQueryOptions<T> = {
      schema: this._model.schema,
      table: this._model.table,
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
    if (this._model.feature && this._model.feature.insert === false) {
      throw new ModelPermission(
        "insert",
        this._model.table,
        this._model.connection,
      );
    }
    if (
      this._model.feature && this._model.feature.bulkInsert === false &&
      data.length > 1
    ) {
      throw new ModelPermission(
        "insert-bulk",
        this._model.table,
        this._model.connection,
      );
    }
    const errors: { [key: number]: ErrorList } = {};
    let insertColumns: Array<keyof T> = this._notNulls;
    data.forEach((element, index) => {
      try {
        data[index] = this._validator(element);
        // Remove identity columns
        this._identityKeys.forEach((key) => {
          delete data[index][key];
        });
        // Check not null columns are present
        this._notNulls.forEach((key) => {
          if (data[index][key] === undefined || data[index][key] === null) {
            throw new ModelNotNull(
              String(key),
              this._model.table,
              this._model.connection,
            );
          }
        });
        // Add the rest of the keys as insert columns
        const keys = Object.keys(data[index]) as Array<keyof T>;
        insertColumns = Array.from(
          new Set<keyof T>([...insertColumns, ...keys]).values(),
        );
      } catch (e) {
        // Set error
        errors[index] = e;
      }
    });
    // Check if there is error

    await this._init();
    const options: InsertQueryOptions<T> = {
      schema: this._model.schema,
      table: this._model.table,
      columns: this._columns,
      insertColumns: insertColumns,
      data: data,
    };
    return await this._connection.insert<T>(options);
  }

  /**
   * update
   * Update record(s). Using filters either a single record or multiple records can
   * be updated.
   * If only data is passed, it will check if PK column is present, if so it will move
   * the same as filter and attempt and update.
   * PrimaryKey column (PK Column) cannot be updated! Pass them only if you want to generate
   * the filter (and pass filter as null)
   *
   * @param data Partial<T> Information to be updated
   * @param filter Filters<T> The filter condition basis which to update
   * @returns QueryResult<T>
   */
  public async update(
    data: Partial<T>,
    filter?: Filters<T>,
  ): Promise<QueryResult<T>> {
    if (this._model.feature && this._model.feature.update === false) {
      throw new ModelPermission(
        "update",
        this._model.table,
        this._model.connection,
      );
    }
    // Validate row
    try {
      data = this._validator(data);
      // Check if not null columns if present is not set to null
      this._notNulls.forEach((key) => {
        if (data[key] && data[key] === null) {
          throw new ModelNotNull(
            String(key),
            this._model.table,
            this._model.connection,
          );
        }
      });
    } catch (e) {
      // Set error
      console.log(e);
    }

    if (filter === undefined) {
      // Check if filter can be built (PK columns)
      const pkFilter: { [key: string]: unknown } = {};
      this._primaryKeys.forEach((pk) => {
        pkFilter[String(pk)] = {
          $eq: data[pk as keyof T],
        };
        // Delete from filter
        delete data[pk];
      });
      filter = pkFilter as Filters<T>;
    }

    // Disallow PK from being updated
    this._primaryKeys.forEach((pk) => {
      if (data[pk as keyof T] !== undefined) {
        throw new ModelPrimaryKeyUpdate(
          String(pk),
          this._model.table,
          this._model.connection,
        );
      }
    });

    // Are we updating one or multiple rows?
    const rowCount = await this.count(filter);
    if (rowCount.totalRows > 1) {
      // Check bulk update
      if (this._model.feature && this._model.feature.bulkUpdate === false) {
        throw new ModelPermission(
          "update-bulk",
          this._model.table,
          this._model.connection,
        );
      }
    }

    const options: UpdateQueryOptions<T> = {
      schema: this._model.schema,
      table: this._model.table,
      columns: this._columns,
      filters: filter,
      data: data,
    };
    await this._init();
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
    if (this._model.feature && this._model.feature.delete === false) {
      throw new ModelPermission(
        "delete",
        this._model.table,
        this._model.connection,
      );
    }
    // Get row count
    const rowCount = await this.count(filter);
    if (rowCount.totalRows > 1) {
      if (this._model.feature && this._model.feature.bulkDelete === false) {
        throw new ModelPermission(
          "delete-bulk",
          this._model.table,
          this._model.connection,
        );
      }
    }
    const options: DeleteQueryOptions<T> = {
      schema: this._model.schema,
      table: this._model.table,
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
    if (this._model.feature && this._model.feature.truncate === false) {
      throw new ModelPermission(
        "truncate",
        this._model.table,
        this._model.connection,
      );
    }
    const options: QueryOptions<T> = {
      schema: this._model.schema,
      table: this._model.table,
      columns: this._columns,
    };
    await this._init();
    await this._connection.truncate(options);
  }

  public async createTable(
    dropCreate?: boolean,
    backup?: string,
  ): Promise<void> {
    // create the table structure
    const options: CreateTableOptions = {
      schema: this._model.schema,
      table: this._model.table,
      dropCreate: (dropCreate === true) ? true : false,
      backup: backup,
      columns: {},
    };
    for (const [name, definition] of Object.entries(this._model.columns)) {
      options.columns[definition.name || name] = {
        type: definition.dataType,
        isNullable: definition.isNullable,
      };
    }
    // Get the actual column names
    this._primaryKeys.forEach((key) => {
      if (options.primaryKeys === undefined) {
        options.primaryKeys = [];
      }
      options.primaryKeys.push(this._columns[key as keyof T]);
    });
    for (const [name, columns] of Object.entries(this._uniqueKeys)) {
      columns.forEach((key) => {
        if (options.uniqueKeys === undefined) {
          options.uniqueKeys = {};
        }
        if (options.uniqueKeys[name] === undefined) {
          options.uniqueKeys[name] = [];
        }
        options.uniqueKeys[name].push(this._columns[key as keyof T]);
      });
    }
    await this._init();
    await this._connection.createTable(options);
  }

  public async dropTable(): Promise<void> {
    await this._init();
    await this._connection.dropTable(this.table, this.schema);
  }

  // public async drop(): Promise<void> {}

  // public async sync(): Promise<void> {}

  /**
   * _init
   *
   * Initialize the model
   */
  protected async _init() {
    if (!this._connection) {
      this._connection = await Database.get(this._model.connection);
    }
  }
}
