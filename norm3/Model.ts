import { AbstractClient } from "./AbstractClient.ts";
import { DatabaseManager } from "./DatabaseManager.ts";
import { Generator } from "./types/mod.ts";
import type {
  DeleteQuery,
  GeneratorFunction,
  GeneratorOutput,
  Generators,
  InsertQuery,
  ModelDefinition,
  ModelType,
  ModelValidation,
  Pagination,
  QueryFilter,
  QueryResult,
  SelectQuery,
  Sorting,
  TruncateTableQuery,
  UpdateQuery,
} from "./types/mod.ts";
import { DefaultValidator } from "./types/mod.ts";

import { GuardianError, GuardianProxy, Struct } from "../guardian/mod.ts";

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
  protected _insertDefaults: Record<
    keyof T,
    GeneratorFunction | GeneratorOutput
  > = {} as Record<keyof T, GeneratorOutput>;
  protected _updateDefaults: Record<
    keyof T,
    GeneratorFunction | GeneratorOutput
  > = {} as Record<keyof T, GeneratorOutput>;
  protected _notNullOnce: Array<keyof T> = [];
  protected _disableUpdate: Array<keyof T> = [];
  protected _primaryKeys: Array<keyof T> = [];
  protected _uniqueKeys: Record<string, Array<keyof T>> = {};
  protected _foreignKeys: Record<string, {
    model?: string;
    schema?: string;
    table?: string;
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
  };

  constructor(definition: S) {
    this._definition = definition;
    this._connectionName = definition.connection;
    // Check if it exists
    if (DatabaseManager.has(this._connectionName) === false) {
      throw new Error(`Connection ${this._connectionName} does not exist`);
    }
    // Process and validate the model definition
    this._name = definition.name.trim();
    if (definition.schema) {
      this._schema = definition.schema.trim();
    }
    this._table = definition.table.trim();
    if (definition.permissions) {
      Object.entries(definition.permissions).forEach(([key, value]) => {
        this._permissions[key as keyof typeof this._permissions] = value;
      });
    }
    if (definition.isView) {
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
      this._aliasMap[name as keyof T] =
        (columnDefinition.name || name) as string;
      // Now we go through the data type
      if (
        ["SERIAL", "SMALLSERIAL", "BIGSERIAL", "AUTO_INCRIEMENT"].includes(
          columnDefinition.type.toUpperCase(),
        )
      ) {
        this._identityColumns.push(name as keyof T);
      }
      // Not Nullable check
      if (
        columnDefinition.isNullable === undefined ||
        columnDefinition.isNullable === false
      ) {
        // Ignore if datatype is an identity column or PK (PK will be handled seperately)
        if (!this._identityColumns.includes(name as keyof T)) {
          this._notNulls.push(name as keyof T);
        }
      }
      // Columns where updates are disabled
      if (columnDefinition.disableUpdate === true) {
        this._disableUpdate.push(name as keyof T);
      }
      // Not null once data is available
      if (
        columnDefinition.notNullOnce === true &&
        !this._disableUpdate.includes(name as keyof T)
      ) {
        this._notNullOnce.push(name as keyof T);
      }
      // Default
      if (columnDefinition.defaults) {
        if (columnDefinition.defaults.insert) {
          this._insertDefaults[name as keyof T] =
            columnDefinition.defaults.insert;
        }
        if (columnDefinition.defaults.update) {
          this._updateDefaults[name as keyof T] =
            columnDefinition.defaults.update;
        }
      }
      // Validator
      const hasValidation = (columnDefinition.validation !== undefined);
      if (hasValidation) {
        validator[name] = columnDefinition.validation;
      } else {
        validator[name] = DefaultValidator[columnDefinition.type];

        // Add length spec if possible
        if (
          columnDefinition.length && typeof columnDefinition.length === "number"
        ) {
          validator[name].max(columnDefinition.length);
        }

        // Finally add optional
        if (columnDefinition.isNullable) {
          validator[name].optional();
        }
      }
    }
    this._validator = Struct(
      validator,
      `Validation failed for model ${this.name}`,
      "PARTIAL",
    );
    // Primary key
    if (definition.primaryKey) {
      definition.primaryKey.forEach((key) => {
        if (this._aliasMap[key as keyof T] === undefined) {
          throw new Error(
            `Primary key ${key} is not defined in model ${this.name}`,
          );
        }
        this._primaryKeys.push(key as keyof T);
      });
    }
    if (definition.uniqueKeys) {
      for (const [key, value] of Object.entries(definition.uniqueKeys)) {
        value.forEach((column) => {
          if (this._aliasMap[column as keyof T] === undefined) {
            throw new Error(
              `Unique key ${key} is not defined in model ${this.name}`,
            );
          }
        });
        this._uniqueKeys[key] = Array.from(value) as Array<keyof T>;
      }
    }
    // Foreign keys
    if (definition.foreignKeys) {
      for (const [key, value] of Object.entries(definition.foreignKeys)) {
        if (value.model === undefined && value.table === undefined) {
          throw new Error(
            `Either Model name or table name must be defined for foreign key ${key} in model ${this.name}`,
          );
        }
        if (value.table === undefined) {
          // Model name is present, try to look for it
          // TODO: Implement this
        }
        // Loop through column and ensure it is present here
        for (
          const [column, _foreignColumn] of Object.entries(value.columnMap)
        ) {
          if (this._aliasMap[column as keyof T] === undefined) {
            throw new Error(
              `Foreign key ${key} is not defined in model ${this.name}`,
            );
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
    const colNames = Object.keys(this._aliasMap).map((key) =>
      key.toLowerCase().trim()
    );
    return colNames.includes(name);
  }

  getColumnName(name: keyof T): string {
    const colName = this._aliasMap[name];
    if (colName === undefined) {
      throw new Error(
        `Column ${name as string} is not defined in model ${this.name}`,
      );
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
   * insert
   * Insert record(s) into the table. If the schema definition has insert set to
   * disabled, then insert will be blocked
   *
   * @param data Array<Partial<T>>> The data to be inserted
   * @returns QueryResult<T>
   */
  public async insert(
    data: NonNullable<T> | Array<NonNullable<T>>,
  ): Promise<QueryResult<T>> {
    // Check permission
    if (this._permissions.insert === false) {
      // throw new ModelPermission(
      //   "insert",
      //   this.name,
      //   this._connection.name,
      // );
      throw new Error("Permission denied");
    }
    await this._init();

    const rows: Array<NonNullable<T>> = (Array.isArray(data) ? data : [data]);
    // Validate data (as per Guardian)
    const errors: { [key: number]: ModelValidation<T> } = {},
      insertColumns: Array<keyof T> = this._notNulls,
      uk: { [key: string]: Array<string> } = {},
      ukQuery: Array<Promise<QueryResult<T>>> = [],
      ukErrors: { [row: number]: ModelValidation<T> } = {};

    rows.forEach(async (row, index) => {
      // Inject Defaults
      const dbGenerated: Record<keyof T, string> = {} as Record<
        keyof T,
        string
      >;

      Object.entries(this._insertDefaults).forEach(async ([key, value]) => {
        if (row[key as keyof T] === undefined) {
          // If this is DB generated,
          if (this._connection.hasGenerator(value as string)) {
            // Yes!
            const genVal = await this._connection.getGenerator(
              value as keyof typeof Generator,
            );
            if (/^\$\{(.*)\}$/.test(genVal as string) === false) {
              // Its not a DB generated value
              row[key as keyof T] = genVal as T[keyof T];
            } else {
              // Its a DB generated value
              dbGenerated[key as keyof T] = genVal as string;
            }
          } else {
            const genVal = (value instanceof Function) ? await value() : value;
            if (/^\$\{(.*)\}$/.test(genVal as string) === false) {
              row[key as keyof T] = genVal as T[keyof T];
            } else {
              dbGenerated[key as keyof T] = genVal as string;
            }
          }
        }
      });

      const [error, validRow] = await this.validateData(row);
      if (error) {
        errors[index] = error;
      } else {
        row = validRow as NonNullable<T>;
      }

      // Check PK
      this._primaryKeys.forEach((column) => {
        // If it is identity, then delete from row
        if (this._identityColumns.includes(column)) {
          delete row[column as keyof T];
        }
      });

      // Check not null
      this._notNulls.forEach((column) => {
        if (row[column as keyof T] === undefined) {
          // TODO Check if it is DB generated, if so ignore
          if (!errors[index]) {
            errors[index] = {} as ModelValidation<T>;
          }
          if (errors[index][column] === undefined) {
            errors[index][column] = [];
          }
          errors[index][column]?.push(
            `Column ${column as string} cannot be null`,
          );
        }
      });

      // Check Unique Keys
      // TODO - Handle scenarios - Unique key is generated (DB)
      Object.entries(this._uniqueKeys).forEach(([key, value]) => {
        const ukValue = value.map((col) => row[col as keyof T]).join("::"),
          ukFilter: { [name: string]: unknown }[] = value.map((col) => {
            const retVal: { [key: string]: unknown } = {};
            retVal[col as string] = row[col as keyof T];
            return retVal;
          });
        if (uk[key] === undefined) {
          uk[key] = [];
        }
        if (uk[key].includes(ukValue)) {
          // UK Violation
        }
        uk[key].push(ukValue);

        ukQuery.push(this.count(ukFilter as QueryFilter<T>));
        ukErrors[index] = {};
      });

      // Encrypt
      // TODO - Implement this

      // Inject DB generators
      Object.entries(dbGenerated).forEach(([key, value]) => {
        if (row[key as keyof T] === undefined) {
          row[key as keyof T] = value as T[keyof T];
        }
      });

      // Set columns inserted
      const colInsert = Object.keys(row).filter((col) =>
        !insertColumns.includes(col as keyof T)
      );
      if (colInsert.length > 0) {
        insertColumns.push(...colInsert as Array<keyof T>);
      }

      // Set the row
      if (Object.keys(errors).length > 0) {
        rows[index] = row;
      } else {
        delete rows[index];
      }
    });

    Promise.all(ukQuery).then((results) => {
      results.forEach((result, index) => {
        if (result.count > 0) {
          const ukError: { [row: number]: ModelValidation<T> } = {};
          ukError[index] = {};
          ukErrors.push(ukError);
        }
      });
    });

    /**
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
      type: 'INSERT',
      schema: this.schema,
      table: this.table,
      columns: this._aliasMap,
      insertColumns: insertColumns,
      data: rows,
    });
    */
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
  public async update(data: Partial<T>, filters?: QueryFilter<T>) {
    if (this._permissions.update === false) {
      // throw new ModelPermission(
      //   "update",
      //   this.name,
      //   this._connection.name,
      // );
      throw new Error("Permission denied");
    }
    await this._init();

    const options: UpdateQuery<T> = {
      type: "UPDATE",
      table: this.table,
      schema: this.schema,
      columns: this._aliasMap,
      data: {},
    };

    // Remove disable update columns
    this._disableUpdate.forEach((column) => {
      delete data[column];
    });

    // Handle notNullOnce columns
    this._notNullOnce.forEach((column) => {
      // Is it there?
      if (data[column] !== undefined && data[column] === null) {
        delete data[column];
      }
    });

    // Validate row
    const [err, op] = await this.validateData(data),
      errors: ModelValidation<T> = err || {};

    // Check UK is actually Unique

    // Remove PK and Identity from update

    // We remove the PK and Identity columns after validation
    if (!filters || Object.keys(filters).length == 0) {
      // Filters are present, we check data and move on
      const pkFilter: { [key: string]: unknown } = {};
      this._primaryKeys.forEach((pk) => {
        // All PK must be present
        pkFilter[pk as string] = data[pk];
      });

      if (Object.keys(pkFilter).length === this._primaryKeys.length) {
        filters = pkFilter as QueryFilter<T>;
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
      if (cntop.count > 1) {
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

        this._identityColumns.forEach((ik) => {
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
      this._identityColumns.forEach((ik) => {
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

  public async bulkUpdate() {}

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

  public validateFilters(filters: QueryFilter<T>): QueryFilter<T> | undefined {
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
    Object.keys(this._aliasMap).forEach((key) => {
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
        // throw new ModelFilterError(
        //   `Unknown filter operator: ${key}`,
        //   this._name,
        //   this._connection.name,
        // );
        throw new Error(`Unknown filter operator: ${key}`);
      }
      // Check value
      if (Array.isArray(value)) {
        processedFilter[properKey] = value;
      } else if (typeof value === "object") {
        processedFilter[properKey] = this.validateFilters(
          value as QueryFilter<T>,
        );
      } else {
        processedFilter[properKey] = value;
      }
    }

    return processedFilter as QueryFilter<T>;
  }

  public async validateData(
    data: Partial<T>,
  ): Promise<[ModelValidation<T>, null] | [null, Partial<T>]> {
    const errors: ModelValidation<T> = {};
    // First check what Guardian says
    const [err, op] = await this._validator.validate(data);
    // If there is error, append it
    if (err && err instanceof GuardianError) {
      Object.entries(err).forEach(([key, value]) => {
        if (errors[key as keyof T] === undefined) {
          errors[key as keyof T] = [];
        }
        errors[key as keyof T]?.push(value.message);
      });
    }

    return [errors, op];

    /**
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
      const cnt = await this.count(pkCheck as QueryFilter<T>);
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
      const columns = Array.from(this._uniqueKeys[key].values());
      const values = columns.map((column) => {
        return data[column as keyof T];
      });
      const ukFilter: { [key: string]: unknown } = {};
      columns.forEach((column, index) => {
        ukFilter[column as string] = values[index];
      });
      const cnt = await this.count({ ...pkFilter, ...ukFilter } as QueryFilter<T>);
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
    */
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
