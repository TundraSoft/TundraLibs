import { Options } from "../options/mod.ts";
import AbstractClient from "./AbstractClient.ts";
import { Database } from "./Database.ts";
import type {
  FieldDefinition,
  Filters,
  ModelConfig,
  QueryOptions,
  QueryPagination,
  QueryResult,
  QuerySorting,
} from "./types.ts";

import {
  BulkUniqueKeyUpdate,
  InvalidModelConfiguration,
  PrimaryKeyUpdate,
} from "./Errors.ts";

/**
 * BaseModel
 */
export class BaseModel<T> extends Options<ModelConfig<T>> {
  protected _connection!: AbstractClient;
  protected _columns: Record<keyof T, string>;
  protected _primaryKeys: Array<string> = [];
  protected _uniqueKeys: Array<string> = [];
  protected _notNull: Array<string> = [];

  constructor(schema: Partial<ModelConfig<T>>) {
    const defaultConfig: Partial<ModelConfig<T>> = {
      connection: "default",
      pagesize: 10,
      enabled: {
        insert: true,
        update: true,
        delete: true,
        truncate: true,
      },
    };
    super(schema, defaultConfig);
    if (this._hasOption("table") === false) {
      throw new InvalidModelConfiguration("table");
    }
    if (this._hasOption("columns") === false) {
      throw new InvalidModelConfiguration("columns", this._getOption("table"));
    }
    // Lets parse the config
    const columnAlias: Partial<Record<keyof T, string>> = {};
    for (
      const [column, columnDef] of Object.entries(this._getOption("columns"))
    ) {
      const cd = columnDef as FieldDefinition;
      // Process column
      columnAlias[column as keyof T] = (cd.name) ? cd.name : column;
      if (cd.isPrimary) {
        this._primaryKeys.push(column);
      }
      if (cd.isUnique) {
        this._uniqueKeys.push(column);
      }
      if (cd.isNullable === undefined || cd.isNullable === false) {
        this._notNull.push(column);
      }
      // Process validations
    }
    this._columns = columnAlias as Record<keyof T, string>;
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
    if (!paging && (this._getOption("pagesize") || 0) > 0) {
      paging = {
        size: this._getOption("pagesize") || 0,
        page: 0,
      };
    }
    const options: QueryOptions<T> = {
      schema: this._getOption("schema"),
      table: this._getOption("table"),
      columns: this._columns,
      filters: filters,
      sort: sort,
      paging: paging,
    };
    return await this._connection.select<T>(options);
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
    if (this._getOption("enabled")?.insert === false) {
      throw new Error("Insert operation not allowed");
    }
    await this._init();
    const options: QueryOptions<T> = {
      schema: this._getOption("schema"),
      table: this._getOption("table"),
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
    if (this._getOption("enabled")?.update === false) {
      throw new Error("Update operation not allowed");
    }
    await this._init();
    const options: QueryOptions<T> = {
      schema: this._getOption("schema"),
      table: this._getOption("table"),
      columns: this._columns,
      filters: filter,
    };
    // Check data, we cannot update primary keys
    const rowCount = await this._connection.count<T>(options);
    // We never allow updating PK
    for (const key in this._primaryKeys) {
      if (data[this._primaryKeys[key] as keyof T]) {
        throw new PrimaryKeyUpdate(
          this._primaryKeys[key],
          this._getOption("table"),
        );
      }
    }
    // Cannot do a bulk update if unique key is present
    if (rowCount.totalRows) {
      if (rowCount.totalRows > 1 && this._uniqueKeys.length > 0) {
        for (const key in this._uniqueKeys) {
          if (data[this._uniqueKeys[key] as keyof T]) {
            throw new BulkUniqueKeyUpdate(
              this._uniqueKeys[key],
              this._getOption("table"),
            );
          }
        }
      }
    }
    // Ok other validations to be put here
    options.data = [data];
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
    if (this._getOption("enabled")?.delete === false) {
      throw new Error("Delete operation not allowed");
    }
    await this._init();
    const options: QueryOptions<T> = {
      schema: this._getOption("schema"),
      table: this._getOption("table"),
      columns: this._columns,
      filters: filter,
    };
    return await this._connection.delete<T>(options);
  }

  // public validate(record: Partial<T>): boolean {
  //   return true;
  // }

  // public async checkUnique(record: Partial<T>): Promise<number> {
  //   const filter: Filters<T> = {},
  //     pk: Partial<Record<keyof T, FilterOperators<T>>> = {},
  //     others: Array<Partial<Record<keyof T, FilterOperators<T>>>> = []
  //   for(const [column, value] of Object.entries(record)) {
  //     if(this._primaryKeys.indexOf(column) >= -1) {
  //       pk[column as keyof T] = {
  //         $ne: value
  //       };
  //     } else {
  //       const filt:Partial<Record<keyof T, FilterOperators<T>>> = {}
  //       filt[column as keyof T] = {
  //         $eq: value
  //       }
  //       others.push(filt);
  //     }
  //   }
  //   filter["$and"] = {...pk, ...{"$or": others}};
  //   const op = await this._connection.count()
  //   throw new Error("sdfdf");
  // }

  /**
   * _init
   * Initialize the model
   */
  protected async _init() {
    if (!this._connection) {
      this._connection = await Database.getDatabase(
        this._getOption("connection"),
      );
    }
  }
}
