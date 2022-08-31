import { AbstractClient } from "./AbstractClient.ts";
import { Database } from "./Database.ts";
import {
  ColumnDefinition,
  CountQueryOptions,
  CreateTableOptions,
  DataType,
  DefaultValidator,
  DefaultValues,
  DeleteQueryOptions,
  Filters,
  Generators,
  InsertQueryOptions,
  ModelDefinition,
  ModelFeatures,
  ModelType,
  QueryOptions,
  QueryPagination,
  QueryResult,
  QuerySorting,
  SchemaComparisonOptions,
  SchemaDefinition,
  SchemaDelta,
  SelectQueryOptions,
  UpdateQueryOptions,
} from "./types/mod.ts";

import { ErrorList, GuardianProxy, Struct } from "../guardian/mod.ts";

import {
  ModelNotNull,
  ModelPermission,
  ModelPrimaryKeyUpdate,
  ModelValidationError,
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
  protected _features: ModelFeatures = {
    insert: true,
    bulkInsert: true,
    update: true,
    bulkUpdate: true,
    delete: true,
    bulkDelete: true,
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
  // Columns which function as Identity columns (auto increment). This is to avoid inserting/updating values to them
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
    this._name = model.name;
    this._connectionName = model.connection;
    this._schema = model.schema;
    this._table = model.table;
    this._pageSize = model.pageSize;

    // Set features
    Object.entries(this._features).forEach(([key, value]) => {
      this._features[key as keyof ModelFeatures] = value;
    });

    const columnAlias: Partial<Record<keyof T, string>> = {};
    const columnDefinition: Partial<
      Record<keyof T, {
        type: DataType;
        length?: { precision: number; scale: number } | number;
      }>
    > = {};
    // deno-lint-ignore no-explicit-any
    const validator: { [key: string]: GuardianProxy<any> } = {};
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
       * If it is defined as nullable, or no definition present and if not present of identity (Auto Increment)
       * column, or present as auto generator then it is not null.
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
      // Present primarily to handle indexes. norm will not
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
  }

  // The model name
  get name(): string {
    return this._name;
  }

  public capability(name: keyof ModelFeatures): boolean {
    return this._features[name];
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

  public getColumnType(
    name: keyof T,
  ): {
    type: DataType;
    length?: { precision: number; scale: number } | number;
  } {
    return this._columnType[name];
  }

  public isColumnPrimary(name: keyof T): boolean {
    return this._primaryKeys.includes(name);
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
    await this._init();
    if (!paging && (this._pageSize || 0) > 0) {
      paging = {
        size: this._pageSize || 0,
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
    await this._init();
    const options: CountQueryOptions<T> = {
      schema: this.schema,
      table: this.table,
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
    if (this.capability("insert") === false) {
      throw new ModelPermission(
        "insert",
        this.name,
        this._connection.name,
      );
    }
    await this._init();
    if (this.capability("bulkInsert") === false && data.length > 1) {
      throw new ModelPermission(
        "bulk-insert",
        this.name,
        this._connection.name,
      );
    }
    return await this._connection.insert<T>(this._buildInsert(data));
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
    if (this.capability("update") === false) {
      throw new ModelPermission(
        "update",
        this.name,
        this._connection.name,
      );
    }
    // let errors: ErrorList;
    const [generated, dbGenerated] = this._generate(this._updateGenerators);
    // Validate row
    try {
      data = { ...generated, ...data };
      data = this._validator(data);
      data = { ...dbGenerated, ...data };
    } catch (e) {
      // Set error
      throw new ModelValidationError(e, this.name, this._connection.name);
    }
    // Check if not null columns if present is not set to null
    this._notNulls.forEach((key) => {
      if (data[key] && data[key] === null) {
        throw new ModelNotNull(
          String(key),
          this.name,
          this._connection.name,
        );
      }
    });

    if (filter === undefined) {
      // Check if filter can be built (PK columns)
      const pkFilter: { [key: string]: unknown } = {};
      this._primaryKeys.forEach((pk) => {
        if (data[pk] !== undefined) {
          pkFilter[String(pk)] = {
            $eq: data[pk as keyof T],
          };
          // Delete from filter
          delete data[pk];
        }
      });
      filter = pkFilter as Filters<T>;
    }

    // Disallow PK from being updated
    this._primaryKeys.forEach((pk) => {
      if (data[pk as keyof T] !== undefined) {
        throw new ModelPrimaryKeyUpdate(
          String(pk),
          this.name,
          this._connection.name,
        );
      }
    });

    // Are we updating one or multiple rows?
    const rowCount = await this.count(filter);
    if (rowCount.totalRows > 1) {
      // Check bulk update
      if (this.capability("bulkUpdate") === false) {
        throw new ModelPermission(
          "bulk-update",
          this.name,
          this._connection.name,
        );
      }
    }

    // console.log('sdf')
    const options: UpdateQueryOptions<T> = {
      schema: this.schema,
      table: this.table,
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
    if (this.capability("delete") === false) {
      throw new ModelPermission(
        "delete",
        this.name,
        this._connection.name,
      );
    }
    // Get row count
    const rowCount = await this.count(filter);
    if (rowCount.totalRows > 1) {
      if (this.capability("bulkDelete") === false) {
        throw new ModelPermission(
          "bulk-delete",
          this.name,
          this._connection.name,
        );
      }
    }
    const options: DeleteQueryOptions<T> = {
      schema: this.schema,
      table: this.table,
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
    if (this.capability("bulkDelete") === false) {
      throw new ModelPermission(
        "truncate",
        this.name,
        this._connection.name,
      );
    }
    const options: QueryOptions<T> = {
      schema: this.schema,
      table: this.table,
      columns: this._columns,
    };
    await this._init();
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
    await this._init();
    await this._connection.createTable(options);
    if (seedFilePath) {
      await this._connection.insert<T>(
        this._buildInsert(JSON.parse(await Deno.readTextFile(seedFilePath))),
      );
    }
  }

  /**
   * dropTable
   *
   * @param ifExists boolean Whether to drop the table if it exists or not (Default true)
   * @param cascade boolean Whether to cascade the drop or not (Default false)
   * Drop the DB Table
   */
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

  /**
   * isConsistent
   *
   * Is the schema consistent with the DB schema?
   */
  public async isConsistent(
    options: SchemaComparisonOptions,
  ): Promise<boolean> {
    await this._init();
    const sDelta = await this._getSchemaDelta(options);
    let result = true;
    result &&= sDelta.schemaMatch;
    result &&= sDelta.tableMatch;
    result &&= Object.keys(sDelta.addedColumns).length === 0;
    result &&= Object.keys(sDelta.modifiedColumns).length === 0;
    result &&= Object.keys(sDelta.deletedColumns).length === 0;
    return result;
  }

  /**
   * _buildInsert
   *
   * Helper function to build the insert query given the data
   */
  protected _buildInsert(
    data: Array<Partial<T>>,
  ): InsertQueryOptions<T> {
    const errors: { [key: number]: ErrorList } = {};
    let insertColumns: Array<keyof T> = this._notNulls;
    const [generated, dbGenerated] = this._generate(this._insertGenerators);
    data.forEach((element, index) => {
      try {
        // Set the generated values. We dont add DB generated values here...
        element = { ...generated, ...element };
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
              this.table,
              this._connection.name,
            );
          }
        });
        data[index] = { ...dbGenerated, ...data[index] };
        // Add the rest of the keys as insert columns
        const keys = Object.keys(data[index]) as Array<keyof T>;
        insertColumns = Array.from(
          new Set<keyof T>([...insertColumns, ...keys]).values(),
        );
      } catch (e) {
        // Set error
        // TODO: Handle not null errors and validation errors gracefully
        console.log(data[index]);
        errors[index] = e;
        console.log(e.toJSON());
      }
    });
    // Check if there is error
    if (Object.keys(errors).length > 0) {
      // console.log(errors);
      throw new ModelValidationError(errors, this.name, this._connection.name);
    }

    return {
      schema: this.schema,
      table: this.table,
      columns: this._columns,
      insertColumns: insertColumns,
      data: data,
    };
  }

  /**
   * _getDBSchema
   *
   * Helper function to get the current schema as in the DB
   */
  protected async _getDBSchema(): Promise<SchemaDefinition> {
    await this._init();
    return await this._connection.getTableDefinition(this.table, this.schema);
  }

  /**
   * _getModelSchema
   *
   * Helper function to get the current schema as in the DB
   */
  protected _getModelSchema(): SchemaDefinition {
    const uniqueKeyMap = {} as { [key: string]: Set<string> };
    for (const [key, value] of Object.entries(this._uniqueKeys)) {
      for (const column of value) {
        if (uniqueKeyMap[column as string] === undefined) {
          uniqueKeyMap[column as string] = new Set<string>();
        }
        uniqueKeyMap[column as string].add(key);
      }
    }
    const columnDefs = {} as { [key: string]: ColumnDefinition };
    for (const [alias, name] of Object.entries(this._columns)) {
      console.log(alias, name);
      columnDefs[name as string] = {
        name: alias,
        dataType: this._columnType[alias as keyof T].type,
        length: this._columnType[alias as keyof T].length || undefined,
        isNullable: this.isColumnNullable(alias as keyof T),
        isPrimary: this.isColumnPrimary(alias as keyof T),
        uniqueKey: (uniqueKeyMap[name as string] &&
            uniqueKeyMap[name as string].size > 0)
          ? uniqueKeyMap[name as string]
          : undefined,
      } as ColumnDefinition;
    }
    return {
      schema: this.schema,
      table: this.table,
      columns: columnDefs,
    };
  }

  /**
   * _getSchemaDelta
   *
   * Get the differences between the Modelschema and the DB schema
   */
  protected async _getSchemaDelta(
    options: SchemaComparisonOptions,
  ): Promise<SchemaDelta> {
    const modelSchema = this._getModelSchema();
    const dbSchema = await this._getDBSchema();
    const mSet = Object.keys(modelSchema.columns);
    const dSet = Object.keys(dbSchema.columns);
    const mOnly = mSet.filter((key) => !dSet.includes(key));
    const dOnly = dSet.filter((key) => !mSet.includes(key));
    const both = mSet.filter((key) => dSet.includes(key));
    const addedCols = {} as { [key: string]: ColumnDefinition };
    const modifiedCols = {} as { [key: string]: ColumnDefinition };
    const deletedCols = {} as { [key: string]: ColumnDefinition };
    for (const key of mOnly) {
      deletedCols[key] = modelSchema.columns[key];
    }
    for (const key of dOnly) {
      addedCols[key] = dbSchema.columns[key];
    }
    for (const key of both) {
      const matchingTypes = options.ignoreType ||
        modelSchema.columns[key].dataType === dbSchema.columns[key].dataType;
      const matchingLengths = options.ignoreLength ||
        (!modelSchema.columns[key].length && !dbSchema.columns[key].length) ||
        (modelSchema.columns[key].length === dbSchema.columns[key].length);
      const primaryMatch = options.ignorePrimary ||
        (!modelSchema.columns[key].isPrimary &&
          !!dbSchema.columns[key].isPrimary) ||
        (modelSchema.columns[key].isPrimary ===
          dbSchema.columns[key].isPrimary);
      const uniqueMatch = options.ignoreUnique ||
        (!modelSchema.columns[key].uniqueKey &&
          !!dbSchema.columns[key].uniqueKey) ||
        (modelSchema.columns[key].uniqueKey ===
          dbSchema.columns[key].uniqueKey);
      const nullableMatch = options.ignoreNullable ||
        modelSchema.columns[key].isNullable ===
          dbSchema.columns[key].isNullable;
      if (
        !matchingTypes || !matchingLengths || !nullableMatch || !primaryMatch ||
        !uniqueMatch
      ) {
        modifiedCols[key] = dbSchema.columns[key];
      }
    }
    return {
      schemaMatch: options.ignoreSchema || (!modelSchema && !dbSchema) ||
        modelSchema && dbSchema && modelSchema.schema === dbSchema.schema,
      tableMatch: options.ignoreTable || modelSchema.table === dbSchema.table,
      deletedColumns: deletedCols,
      addedColumns: addedCols,
      modifiedColumns: modifiedCols,
    } as SchemaDelta;
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

  protected _generate(
    generators: Partial<Record<keyof T, DefaultValues>>,
  ) {
    const generated: Partial<Record<keyof T, unknown>> = {},
      dbGenerated: Partial<Record<keyof T, unknown>> = {};
    Object.entries(generators).forEach(([key, value]) => {
      if (value instanceof Function) {
        generated[key as keyof T] = value();
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
