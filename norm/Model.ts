import { AbstractClient } from "./AbstractClient.ts";
import { Database } from "./Database.ts";
import {
  CountQueryOptions,
  CreateTableOptions,
  DataType,
  DefaultValidator,
  DefaultValues,
  // DataTypes,
  DeleteQueryOptions,
  // FilterOperators,
  Filters,
  Generators,
  InsertQueryOptions,
  ModelDefinition,
  ModelPermissions,
  ModelType,
  ModelValidation,
  QueryOptions,
  QueryPagination,
  QueryResult,
  QuerySorting,
  SelectQueryOptions,
  UpdateQueryOptions,
} from "./types/mod.ts";

import {
  GuardianError,
  GuardianProxy,
  // StructValidatorFunction,
} from "../guardian/mod.ts";
import {
  // Guardian,
  Struct,
  // type
} from "../guardian/mod.ts";

import {
  ModelFilterError,
  // ModelError,
  // ModelNotNull,
  ModelPermission,
  // ModelPrimaryKeyUpdate,
  ModelValidationError,
} from "./Errors.ts";
// import { ModelManager } from "./ModelManager.ts";

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
  S extends ModelDefinition = ModelDefinition,
  T extends ModelType<S> = ModelType<S>,
> {
  // protected _model: ModelDefinition;

  protected _name: string;
  protected _connectionName: string;
  protected _connection!: AbstractClient;
  protected _schema?: string;
  protected _table: string;
  protected _pageSize?: number;
  protected _features: ModelPermissions = {
    select: true,
    insert: true,
    update: true,
    delete: true,
    truncate: true,
    create: true,
    drop: true,
  };
  // Record of column name (alias) to actual column name
  protected _columns: Record<keyof T, string>;
  protected _columnType: Record<
    keyof T,
    { type: DataType; length?: { precision: number; scale: number } | number }
  >;
  // Array of columns marked as Primary Key
  protected _primaryKeys: Array<keyof T> = [];
  // Columns which function as Identity columns (auto incriment). This is to avoid inserting/updating values to them
  protected _identityKeys: Array<keyof T> = [];
  // Columns which are marked as not null
  protected _notNulls: Array<keyof T> = [];
  // Default generators
  protected _insertGenerators: Partial<Record<keyof T, DefaultValues>> = {};
  // Update generators
  protected _updateGenerators: Partial<Record<keyof T, DefaultValues>> = {};

  // Record of Unique key name to array of columns which form the unique key
  protected _uniqueKeys: Record<string, Array<keyof T>> = {};
  protected _relationships: Record<string, Record<keyof T, string>> = {};
  // The validator object
  // deno-lint-ignore no-explicit-any
  protected _validator: GuardianProxy<any>;

  constructor(model: S) {
    // this._model = model;
    this._name = model.name.trim().toLowerCase();
    this._connectionName = model.connection;
    this._schema = model.schema;
    this._table = model.table;
    this._pageSize = model.pageSize;

    // Set features
    if (model.feature) {
      Object.entries(model.feature).forEach(([key, value]) => {
        this._features[key as keyof ModelPermissions] = value;
      });
    }

    const columnAlias: Partial<Record<keyof T, string>> = {};
    const columnDefinition: Partial<
      Record<keyof T, {
        type: DataType;
        length?: { precision: number; scale: number } | number;
      }>
    > = {};

    // deno-lint-ignore no-explicit-any
    const validator: Record<string, GuardianProxy<any>> = {};
    for (const [column, definition] of Object.entries(model.columns)) {
      const hasValidation = (definition.validator !== undefined);
      if (hasValidation) {
        validator[column] = definition.validator;
      } else {
        validator[column] = DefaultValidator[definition.dataType];
      }

      // validator[column].optional();

      // Define validations
      // const validator: GuardianProxy<any> = hasValidation ? definition.validator : Guardian;
      columnAlias[column as keyof T] = definition.name || column;
      columnDefinition[column as keyof T] = {
        type: definition.dataType,
        length: definition.length,
      };
      if (definition.isPrimary) {
        this._primaryKeys.push(column as keyof T);
      }

      if (
        ["AUTO_INCREMENT", "SERIAL", "BIGSERIAL"].includes(definition.dataType)
      ) {
        this._identityKeys.push(column as keyof T);
        // TODO - Technically identity columns are also PK, ensure they are present in PK. NEED to do impact analysis
      }

      if (definition.uniqueKey !== undefined) {
        definition.uniqueKey.forEach((key) => {
          if (this._uniqueKeys[key] === undefined) {
            this._uniqueKeys[key] = [];
          }
          this._uniqueKeys[key].push(column as keyof T);
        });
      }

      if (definition.insertDefault !== undefined) {
        this._insertGenerators[column as keyof T] = definition.insertDefault;
      }
      if (definition.updateDefault !== undefined) {
        this._updateGenerators[column as keyof T] = definition.updateDefault;
      }

      /**
       * If it is defined as nullable, or no definition present and if not present of identity (Auto Incriment)
       * column, or present as autogenrator then it is not null.
       */
      if (
        (definition.isNullable === undefined ||
          definition.isNullable === false) &&
        (!this._identityKeys.includes(column as keyof T) &&
          !Object.keys(this._insertGenerators).includes(column))
      ) {
        this._notNulls.push(column as keyof T);
      }

      // Relationships
      // Relationships are present primarily to handle indexes. norm will not
      // create foreign keys to avoid table alter/creation hierarchy. Indexes will be maintained for performance.
      // In the future, this could be used to select using joins or create views
      if (definition.relatesTo) {
        Object.entries(definition.relatesTo).forEach(
          ([modelName, modelColumn]) => {
            if (this._relationships[modelName] === undefined) {
              this._relationships[modelName] = {} as Record<keyof T, string>;
            }
            this._relationships[modelName][column as keyof T] = modelColumn;
          },
        );
      }
    }
    this._columns = columnAlias as Record<keyof T, string>;
    this._columnType = columnDefinition as Record<
      keyof T,
      { type: DataType; length?: { precision: number; scale: number } | number }
    >;
    this._validator = Struct(
      validator,
      `Validation failed for model ${model.name}`,
      "PARTIAL",
    );
    // ModelManager.register(this);
  }

  // The model name
  get name(): string {
    return this._name;
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

  // deno-lint-ignore no-explicit-any
  get validator(): GuardianProxy<any> {
    return this._validator;
  }

  get primaryKeys(): Array<keyof T> {
    return this._primaryKeys;
  }

  public hasColumn(name: keyof T | string): boolean {
    return this._columns[name as keyof T] !== undefined;
  }

  public capability(name: keyof ModelPermissions): boolean {
    return this._features[name];
  }

  public getRealName(column: keyof T): string {
    return this._columns[column];
  }

  public getColumnType(
    name: keyof T,
  ): {
    type: DataType;
    length?: { precision: number; scale: number } | number;
  } {
    return this._columnType[name];
  }

  public isColumnNullable(name: keyof T): boolean {
    return (!this._notNulls.includes(name as keyof T) &&
      !this._identityKeys.includes(name as keyof T));
  }

  public getRelationships(): Record<string, Record<keyof T, string>> {
    return this._relationships;
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
    if (this.capability("select") === false) {
      throw new ModelPermission(
        "select",
        this.name,
        this._connection.name,
      );
    }

    await this._init();
    if (!paging && (this._pageSize || 0) > 0) {
      paging = {
        limit: this._pageSize || 0,
        page: 1,
      };
    }
    const options: SelectQueryOptions<T> = {
      schema: this.schema,
      table: this.table,
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
    if (this.capability("select") === false) {
      throw new ModelPermission(
        "select",
        this.name,
        this._connection.name,
      );
    }
    await this._init();
    const options: CountQueryOptions<T> = {
      schema: this.schema,
      table: this.table,
      columns: this._columns,
      filters: filters,
    };
    return await this._connection.count<T>(options);
  }

  public async insert(data: Partial<T>): Promise<QueryResult<T>>;

  public async insert(data: Array<Partial<T>>): Promise<QueryResult<T>>;

  /**
   * insert
   * Insert record(s) into the table. If the schema definition has insert set to
   * disabled, then insert will be blocked
   *
   * @param data Array<Partial<T>>> The data to be inserted
   * @returns QueryResult<T>
   */
  public async insert(
    data: Partial<T> | Array<Partial<T>>,
  ): Promise<QueryResult<T>> {
    // Check permission
    if (this.capability("insert") === false) {
      throw new ModelPermission(
        "insert",
        this.name,
        this._connection.name,
      );
    }
    await this._init();

    const rows: Array<Partial<T>> =
      (Array.isArray(data) ? data : [data]) as Array<Partial<T>>;

    const errors: { [key: number]: ModelValidation<T> } = {},
      uniqueKeys: { [key: string]: Array<string> } = {};
    let insertColumns: Array<keyof T> = this._notNulls;
    Object.entries(this._uniqueKeys).forEach(([key]) => {
      uniqueKeys[key] = [];
    });

    for (const [index, row] of rows.entries()) {
      const [err, op] = await this.validateData(row, true);

      if (err && Object.keys(err).length > 0) {
        errors[index] = err;
      }

      if (op) {
        // Check Unique keys
        Object.entries(this._uniqueKeys).forEach(([key, columns]) => {
          const ukValue: Array<string> = [];
          columns.forEach((column) => {
            ukValue.push(String(op[column]));
          });

          // Check if it already exists in the list
          if (uniqueKeys[key].includes(ukValue.join("|"))) {
            if (!errors[index]) {
              errors[index] = {};
            }
            // Add it to the list
            columns.forEach((column) => {
              if (errors[index][column] === undefined) {
                errors[index][column] = [];
              }
              errors[index][column]?.push(`${key} must be unique.`);
            });
          }
          uniqueKeys[key].push(ukValue.join("|"));
        });
      }

      // Add to insert list only if there is no error
      if (op && (!errors || Object.keys(errors).length === 0)) {
        rows[index] = op;
        const keys = Object.keys(rows[index]) as Array<keyof T>;
        insertColumns = Array.from(
          new Set<keyof T>([...insertColumns, ...keys]).values(),
        );
      }
    }
    // Check if there is error

    if (errors && Object.keys(errors).length > 0) {
      // console.log(errors);
      throw new ModelValidationError(errors, this.name, this._connection.name);
    }

    return await this._connection.insert<T>({
      schema: this.schema,
      table: this.table,
      columns: this._columns,
      insertColumns: insertColumns,
      data: rows,
    } as InsertQueryOptions<T>);
  }

  /**
   * update
   *
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
    filters?: Filters<T>,
  ): Promise<QueryResult<T>> {
    if (this.capability("update") === false) {
      throw new ModelPermission(
        "update",
        this.name,
        this._connection.name,
      );
    }
    await this._init();

    const options: UpdateQueryOptions<T> = {
      table: this.table,
      schema: this.schema,
      columns: this._columns,
      data: {},
    };

    // Validate row
    const [err, op] = await this.validateData(data, false),
      errors: ModelValidation<T> = err || {};

    // We remove the PK and Identity columns after validation
    if (!filters || Object.keys(filters).length == 0) {
      // Filters are present, we check data and move on
      const pkFilter: { [key: string]: unknown } = {};
      this._primaryKeys.forEach((pk) => {
        // All PK must be present
        pkFilter[pk as string] = data[pk];
      });

      if (Object.keys(pkFilter).length === this._primaryKeys.length) {
        filters = pkFilter as Filters<T>;
        // Delete PK in data
        this._primaryKeys.forEach((pk) => {
          delete data[pk];
        });
      }
    }

    // Get the count which will be updated
    const cntop = await this.count(filters);

    // If count of updated row is > 1 and Unique Key is present, then throw error
    if (op) {
      if (cntop.totalRows > 1) {
        // Loop through unique keys and check
        Object.entries(this._uniqueKeys).forEach(([_key, columns]) => {
          columns.forEach((column) => {
            if (op[column] !== undefined) {
              if (!errors[column]) {
                errors[column] = [];
              }
              errors[column]?.push(
                `Trying to perform bulk update with unique key column ${column as string}`,
              );
            }
          });
        });

        this._primaryKeys.forEach((pk) => {
          if (op[pk] !== undefined) {
            if (!errors[pk]) {
              errors[pk] = [];
            }
            errors[pk]?.push(
              `Trying to perform bulk update with primary key column ${pk as string}`,
            );
          }
        });

        this._identityKeys.forEach((ik) => {
          if (op[ik] !== undefined) {
            if (!errors[ik]) {
              errors[ik] = [];
            }
            errors[ik]?.push(
              `Trying to perform bulk update with identity column ${ik as string}`,
            );
          }
        });
      }

      // Check if PK exists
      this._primaryKeys.forEach((pk) => {
        // if(!errors[pk]) {
        //   errors[pk] = [];
        // }
        // errors[pk]?.push(`Cannot update primary key column ${pk as string}`);
        delete op[pk];
      });
      // Delete identity columns
      this._identityKeys.forEach((ik) => {
        delete op[ik];
      });
    }

    if (Object.keys(errors).length > 0) {
      throw new ModelValidationError(errors, this.name, this._connection.name);
    }

    options.data = op as Partial<T>;
    options.filters = filters;

    return await this._connection.update<T>(options);
  }

  /**
   * delete
   *
   * Deletes records in the table.
   *
   * @param filter Filters<T> Filter condition basis which to delete
   * @returns QueryResult<T>
   */
  public async delete(filter?: Filters<T>): Promise<QueryResult<T>> {
    if (this.capability("delete") === false) {
      throw new ModelPermission(
        "delete",
        this.name,
        this._connection.name,
      );
    }
    await this._init();

    const options: DeleteQueryOptions<T> = {
      schema: this.schema,
      table: this.table,
      columns: this._columns,
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
    if (this.capability("truncate") === false) {
      throw new ModelPermission(
        "truncate",
        this.name,
        this._connection.name,
      );
    }
    await this._init();
    const options: QueryOptions<T> = {
      schema: this.schema,
      table: this.table,
      columns: this._columns,
    };

    await this._connection.truncate(options);
  }

  /**
   * createTable
   * Creates the table according to the SchemaDefinition.
   *
   * @param dropCreate boolean Whether to drop and create the table or not (Default false)
   * @param backup boolean Whether to back up the table or not (Default false)
   * @param seedFilePath string The path to the seed file (Optional)
   * @returns Promise<void>
   */
  public async createTable(
    dropCreate?: boolean,
    backup?: string,
    seedFilePath?: string,
  ): Promise<void> {
    if (this.capability("create") === false) {
      throw new ModelPermission(
        "create",
        this.name,
        this._connection.name,
      );
    }
    await this._init();

    // create the table structure
    const options: CreateTableOptions = {
      schema: this.schema,
      table: this.table,
      dropCreate: (dropCreate === true),
      backup: backup,
      columns: {},
    };
    for (const [alias, name] of Object.entries(this._columns)) {
      options.columns[name as string] = {
        type: this._columnType[alias as keyof T].type,
        length: this._columnType[alias as keyof T].length || undefined,
        isNullable: this.isColumnNullable(alias as keyof T),
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

    await this._connection.createTable(options);
    if (seedFilePath) {
      await this.insert(JSON.parse(await Deno.readTextFile(seedFilePath)));
    }
  }

  public async dropTable(ifExists = true, cascade = false): Promise<void> {
    if (this.capability("drop") === false) {
      throw new ModelPermission(
        "drop",
        this.name,
        this._connection.name,
      );
    }
    await this._init();

    await this._connection.dropTable(
      this.table,
      this.schema,
      ifExists,
      cascade,
    );
  }

  public validateFilters(filters: Filters<T>): Filters<T> | undefined {
    if (filters === undefined || Object.keys(filters).length === 0) {
      return;
    }
    const allowedKeys: string[] = [
        "$and",
        "$or",
        "$eq",
        "$neq",
        "$in",
        "$nin",
        "$lt",
        "$lte",
        "$gt",
        "$gte",
        "$between",
        "$from",
        "$to",
        "$null",
        "$like",
        "$nlike",
        "$ilike",
        "$nilike",
      ],
      columnList: Record<string, string> = {},
      processedFilter: Record<string, unknown> = {};
    Object.keys(this._columns).forEach((key) => {
      columnList[key.toLowerCase()] = key;
    });

    for (const [key, value] of Object.entries(filters)) {
      const keyLower = key.toLowerCase();
      let properKey: string;
      if (allowedKeys.includes(keyLower)) {
        properKey = keyLower;
      } else if (Object.keys(columnList).includes(keyLower)) {
        properKey = columnList[keyLower];
      } else {
        throw new ModelFilterError(
          `Unknown filter operator: ${key}`,
          this._name,
          this._connection.name,
        );
      }
      // Check value
      if (Array.isArray(value)) {
        processedFilter[properKey] = value;
      } else if (typeof value === "object") {
        processedFilter[properKey] = this.validateFilters(value as Filters<T>);
      } else {
        processedFilter[properKey] = value;
      }
    }

    return processedFilter as Filters<T>;
  }

  public async validateData(
    data: Partial<T>,
    forInsert = true,
  ): Promise<[ModelValidation<T> | null, Partial<T>?]> {
    await this._init();

    const errors: ModelValidation<T> = {},
      [generated, dbGenerated] = await this._generate(
        forInsert === true ? this._insertGenerators : this._updateGenerators,
      );

    // Add normally generated data
    data = { ...generated, ...data };
    // First check if nullable columns are set to null
    this._notNulls.forEach((key) => {
      // If insert, the value cannot be null
      if (forInsert && (data[key] === undefined || data[key] === null)) {
        if (errors[key] === undefined) {
          errors[key] = [];
        }
        errors[key as keyof T]?.push(
          `${key as string} is required and cannot be null`,
        );
      } else if (!forInsert && data[key] === null) {
        // If update, the value can be null
        if (errors[key] === undefined) {
          errors[key] = [];
        }
        errors[key as keyof T]?.push(
          `${key as string} is required and cannot be null`,
        );
      }
    });

    const [err, op] = this._validator.validate(data);

    if (err && err instanceof GuardianError) {
      // loop through each and add to the errors
      err.children.forEach((child) => {
        if (errors[child.path as keyof T] === undefined) {
          errors[child.path as keyof T] = [];
        }
        errors[child.path as keyof T]?.push(child.message);
        // TODO: Handle children
      });
    }

    let finalData!: Partial<T>;
    // Add the DB Generated info
    if (op && Object.keys(op).length > 0) {
      finalData = { ...dbGenerated, ...op };
    }

    const pkFilter: { [key: string]: unknown } = {};
    if (forInsert === false) {
      this._primaryKeys.forEach((key) => {
        if (data[key] !== undefined) {
          pkFilter[key as string] = {
            $neq: data[key as keyof T],
          };
        }
      });
    }

    // If it is for insert, check if PK is also unique
    if (forInsert === true) {
      const pkCheck: { [key: string]: unknown } = {};
      this._primaryKeys.forEach((key) => {
        pkCheck[key as string] = { $eq: data[key as keyof T] };
      });
      const cnt = await this.count(pkCheck as Filters<T>);
      if (cnt.totalRows > 0) {
        this._primaryKeys.forEach((key) => {
          if (errors[key] === undefined) {
            errors[key] = [];
          }
          errors[key as keyof T]?.push(
            `Primary key value "${key as string}" is already in use`,
          );
        });
      }
    }

    for (const key of Object.keys(this._uniqueKeys)) {
      const columns = this._uniqueKeys[key];
      const values = columns.map((column) => {
        return data[column as keyof T];
      });
      const ukFilter: { [key: string]: unknown } = {};
      columns.forEach((column, index) => {
        ukFilter[column as string] = values[index];
      });
      const cnt = await this.count({ ...pkFilter, ...ukFilter } as Filters<T>);
      if (cnt.totalRows > 0) {
        columns.forEach((column, index) => {
          if (errors[column as keyof T] === undefined) {
            errors[column as keyof T] = [];
          }
          errors[column as keyof T]?.push(
            `${column as string} must be unique. Value ${
              values[index]
            } already exists`,
          );
        });
      }
    }

    // Delete all Identity columns for both insert and update as we do not want to touch them
    // this._identityKeys.forEach((key) => {
    //   delete finalData[key];
    // });

    return [(Object.keys(errors).length > 0) ? errors : null, finalData];
  }

  /**
   * _init
   *
   * Initialize the model
   */
  protected async _init() {
    if (!this._connection) {
      this._connection = await Database.get(this._connectionName);
    }
  }

  protected async _generate(
    generators: Partial<Record<keyof T, DefaultValues>>,
  ) {
    const generated: Partial<Record<keyof T, unknown>> = {},
      dbGenerated: Partial<Record<keyof T, unknown>> = {};
    await Object.entries(generators).forEach(async ([key, value]) => {
      if (value instanceof Function) {
        generated[key as keyof T] = await value();
      } else if (value instanceof Date) {
        generated[key as keyof T] = value;
      } else if (typeof value === "number") {
        generated[key as keyof T] = value;
      } else if (typeof value === "bigint") {
        generated[key as keyof T] = value;
      } else if (typeof value === "boolean") {
        generated[key as keyof T] = value;
      } else {
        const gen = this._connection.getGenerator(value as keyof Generators);
        if (gen) {
          if (gen instanceof Function) {
            generated[key as keyof T] = gen();
          } else if (typeof gen === "string" && gen.match(/^\$\{.*\}$/)) {
            dbGenerated[key as keyof T] = gen;
          }
        } else {
          generated[key as keyof T] = value;
        }
      }
    });
    return [generated, dbGenerated];
  }
}
