import { AbstractClient } from './AbstractClient.ts';
import { DatabaseManager } from './DatabaseManager.ts';
// import { Generator } from "./types/mod.ts";
import {
  DataType,
  // DataTypes,
  DeleteQuery,
  Generator,
  GeneratorFunction,
  GeneratorOutput,
  // Generators,
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
} from './types/mod.ts';

import { DefaultValidator } from './types/mod.ts';

// import { ErrorCodes, ModelError } from "./errors/mod.ts";

import { decrypt, encrypt, hash } from './utils/mod.ts';

import { GuardianError, GuardianProxy, Struct } from '../guardian/mod.ts';

import {
  ModelColumnNotDefined,
  ModelConfigError,
  ModelFilterError,
  ModelFilterSecureColumn,
  ModelPermissionError,
  ModelValidationError,
} from './errors/mod.ts';

export class Model<
  S extends ModelDefinition = ModelDefinition,
  T extends ModelType<S> = ModelType<S>,
> {
  // protected _definition: S;
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
    model: string;
    relationship: Record<string, string>;
    columns?: Record<string, DataType>;
  }> = {};
  protected _encryptionKey?: string;
  protected _encryptedColumns: Array<keyof T> = [];
  protected _hashColumns: Array<keyof T> = [];
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
  protected _pageSize?: number;

  constructor(definition: S) {
    definition = Model.validateModel(definition) as S;
    // this._definition = definition;
    this._connectionName = definition.connection;
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
    // for (const [name, columnDefinition] of Object.entries(definition.columns)) {
    Object.keys(definition.columns).forEach((name) => {
      const columnDefinition = definition.columns[name];
      // Add to column map
      this._aliasMap[name as keyof T] =
        (columnDefinition.name || name) as string;
      // Now we go through the data type
      if (
        ['SERIAL', 'SMALLSERIAL', 'BIGSERIAL', 'AUTO_INCRIEMENT'].includes(
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
      if (
        columnDefinition.disableUpdate === true ||
        this._identityColumns.includes(name as keyof T)
      ) {
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
        if (columnDefinition.defaults.insert !== undefined) {
          this._insertDefaults[name as keyof T] =
            columnDefinition.defaults.insert;
        }
        if (columnDefinition.defaults.update !== undefined) {
          this._updateDefaults[name as keyof T] =
            columnDefinition.defaults.update;
        }
      }
      // Encryption
      if (columnDefinition.security) {
        // if(definition.encryptionKey === undefined || definition.encryptionKey === "") {
        //   throw new Error(`Encryption key is not defined for model ${this._name}`);
        // }
        // this._encryptionKey = definition.encryptionKey;
        // this._encryptedColumns.push(name as keyof T);
        if (columnDefinition.security === 'ENCRYPT') {
          this._encryptedColumns.push(name as keyof T);
        }
        if (columnDefinition.security === 'HASH') {
          this._hashColumns.push(name as keyof T);
        }
      }
      // Validator
      const hasValidation = (columnDefinition.validation !== undefined);
      if (hasValidation) {
        validator[name] = columnDefinition.validation;
      } else {
        validator[name] = DefaultValidator[columnDefinition.type];
        // Add length spec if possible
        // if (
        //   columnDefinition.length && typeof columnDefinition.length === 'number'
        // ) {
        //   validator[name].max(columnDefinition.length);
        // }

        // Finally add optional
        if (!this._notNulls.includes(name as keyof T)) {
          validator[name] = validator[name].optional();
        }
      }
    });

    this._validator = Struct(
      validator,
      `Validation failed for model ${this.name}`,
      'PARTIAL',
    );

    // Paging
    if (definition.pageSize !== undefined && definition.pageSize > 0) {
      this._pageSize = definition.pageSize;
    }

    // Encryption key
    if (definition.encryptionKey) {
      this._encryptionKey = definition.encryptionKey;
    }

    // Primary key
    if (definition.primaryKeys) {
      definition.primaryKeys.forEach((key) => {
        this._primaryKeys.push(key as keyof T);
        // Make PK non Updatable
        if (!this._disableUpdate.includes(key as keyof T)) {
          this._disableUpdate.push(key as keyof T);
        }
      });
    }

    if (definition.uniqueKeys) {
      for (const [key, value] of Object.entries(definition.uniqueKeys)) {
        this._uniqueKeys[key] = Array.from(value) as Array<keyof T>;
      }
    }
    // Foreign keys
    if (definition.foreignKeys) {
      for (const [key, value] of Object.entries(definition.foreignKeys)) {
        this._foreignKeys[key] = {
          model: value.model,
          relationship: value.relationship,
          // columns:
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

  /**
   * getConnection
   *
   * Gets the DB connection being used
   *
   * @returns Promise<AbstractClient> The connection being used
   */
  async getConnection(): Promise<AbstractClient> {
    await this._init();
    return this._connection;
  }

  /**
   * hasColumn
   *
   * Checks if the column is present in the model
   *
   * @param name string The name of the column
   * @returns boolean True if exists, false if not
   */
  hasColumn(name: string): boolean {
    name = name.trim().toLowerCase();
    const colNames = Object.keys(this._aliasMap).map((key) =>
      key.toLowerCase().trim()
    );
    return colNames.includes(name);
  }

  /**
   * getColumnName
   *
   * Returns the real column name.
   *
   * @param name keyof T The name of the column
   * @returns string The real column name (in case alias is present)
   */
  getColumnName(name: keyof T): string {
    const colName = this._aliasMap[name];
    if (colName === undefined) {
      throw new ModelColumnNotDefined(
        name as string,
        this.name,
        this._connectionName,
      );
      // throw new Error(
      //   `Column ${name as string} is not defined in model ${this.name}`,
      // );
    }
    return colName;
  }

  /**
   * isNullable
   *
   * Checks if the column is nullable
   *
   * @param name keyof T The name of the column
   * @returns boolean True if nullable false if not
   */
  isNullable(name: keyof T): boolean {
    return this._notNulls.includes(name);
  }

  /**
   * isIdentity
   *
   * Checks if a column is of type identity (AUTO_INCREMENT, SERIAL etc)
   *
   * @param name keyof T The name of the column
   * @returns boolean True if its identity false if not
   */
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
      throw new ModelPermissionError('SELECT', this.name, this._connectionName);
    }
    if (!paging && (this._pageSize || 0) > 0) {
      paging = {
        limit: this._pageSize || 0,
        page: 1,
      };
    }
    if (filters) {
      this.validateFilters(filters);
    }
    const options: SelectQuery<T> = {
      type: 'SELECT',
      schema: this.schema,
      table: this.table,
      columns: this._aliasMap,
      filters: filters,
      sorting: sort,
      pagination: paging,
    };
    await this._init();
    const result = await this._connection.select<T>(options);
    // Decrypt if required
    if (
      this._encryptedColumns.length > 0 &&
      (result.data && result.data?.length > 0)
    ) {
      result.data = result.data.map((row) => {
        const newRow = { ...row };
        this._encryptedColumns.forEach(async (col) => {
          newRow[col] = await decrypt(
            this._encryptionKey as string,
            String(newRow[col]),
          ) as unknown as T[keyof T];
        });
        return newRow;
      });
    }
    return result;
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
      throw new ModelPermissionError('SELECT', this.name, this._connectionName);
    }
    if (filters) {
      this.validateFilters(filters);
    }
    const options: SelectQuery<T> = {
      type: 'COUNT',
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
    data: Partial<T> | Array<Partial<T>>,
  ): Promise<QueryResult<T>> {
    if (this._permissions.insert === false) {
      // throw new ModelPermission(
      //   "insert",
      //   this.name,
      //   this._connection.name,
      // );
      throw new ModelPermissionError('INSERT', this.name, this._connectionName);
    }

    const rows: Array<Partial<T>> =
        (Array.isArray(data) ? data : [data]) as Array<Partial<T>>,
      insertedColumns: Array<keyof T> = structuredClone(
        this._notNulls,
      ) as Array<keyof T>,
      errors: { [key: number]: ModelValidation<T> } = {},
      ukHash: { [key: string]: string[] } = {},
      pkQueries: Array<Promise<QueryResult<T>>> = [],
      ukQueries: Array<Promise<QueryResult<T>>> = [],
      ukErrors: Array<Record<keyof T, string>> = [];

    await this._init();
    rows.forEach(async (row, index) => {
      //#region Generators (Default)
      // Generator
      const dbGenerated: Record<keyof T, string> = {} as Record<
        keyof T,
        string
      >;
      // Get Generators, ones which are Functions or normal values, inject them, store DB generated in variable to inject later
      await Object.keys(this._insertDefaults).forEach(async (column) => {
        if (row[column as keyof T] === undefined) {
          const generated = this._insertDefaults[column as keyof T] as
            | GeneratorFunction
            | GeneratorOutput;

          if (generated instanceof Function) {
            row[column as keyof T] = await generated() as unknown as T[keyof T];
          } else if (typeof generated === 'string') {
            if (this._connection.hasGenerator(generated)) {
              const gen = await this._connection.getGenerator(
                generated as keyof typeof Generator,
              );
              if (/^\$\{(.*)\}$/.test(gen as string)) {
                dbGenerated[column as keyof T] = gen as string;
              } else {
                row[column as keyof T] = gen as unknown as T[keyof T];
              }
            } else if (/^\$\{(.*)\}$/.test(generated as string)) {
              dbGenerated[column as keyof T] = generated as string;
            } else {
              row[column as keyof T] = generated as unknown as T[keyof T];
            }
          } else {
            row[column as keyof T] = generated as unknown as T[keyof T];
          }
        }
      });
      //#endregion Generators (Default)

      // Remove Identity key columns
      //#region Remove Identity key columns
      this._identityColumns.forEach((column) => {
        delete row[column];
      });
      //#endregion Identity key columns

      //#region Guardian
      // Guardian Validator
      // console.log(row);
      const [error, validRow] = await this.validateData(row);
      if (error) {
        errors[index] = error;
      } else {
        row = validRow as NonNullable<T>;
      }
      //#endregion Guardian

      //#region Not Nulls
      // Check not nulls
      this._notNulls.forEach((column) => {
        if (
          (row[column] === undefined || row[column] === null) &&
          !this._identityColumns.includes(column) &&
          !Object.keys(dbGenerated).includes(column as string)
        ) {
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
      //#endregion Not Nulls

      //#region Primary Key (non Identity)
      // Check PK uniqueness
      const pkFilter: QueryFilter = {};
      this._primaryKeys.forEach((column) => {
        pkFilter[column as string] = row[column];
      });
      if (Object.keys(pkFilter).length > 0) {
        // Yes we have PK, check if it is unique
        pkQueries.push(this.count(pkFilter as QueryFilter<T>));
      }
      //#endregion Primary Key (non Identity)

      //#region Encrypt Columns
      // Encryption
      this._encryptedColumns.forEach((column) => {
        if (row[column] !== undefined || row[column] !== null) {
          row[column] = encrypt(
            this._encryptionKey as string,
            String(row[column]),
          ) as unknown as T[keyof T];
        }
      });
      this._hashColumns.forEach((column) => {
        if (row[column] !== undefined || row[column] !== null) {
          row[column] = hash(String(row[column])) as unknown as T[keyof T];
        }
      });
      //#endregion Encrypt Columns

      //#region Unique Keys check
      Object.keys(this._uniqueKeys).forEach((key) => {
        if (ukHash[key] === undefined) {
          ukHash[key] = [];
        }
        //#region Check if the key is unique in the array provided
        // Create hash
        const hash = this._uniqueKeys[key].map((column) => {
          return row[column];
        }).join('::');
        if (ukHash[key].includes(hash)) {
          // Its not unique in the batch itself
          if (!errors[index]) {
            errors[index] = {} as ModelValidation<T>;
          }
          this._uniqueKeys[key].forEach((column) => {
            if (errors[index][column] === undefined) {
              errors[index][column] = [];
            }
            errors[index][column]?.push(
              `Column ${column as string} is not unique`,
            );
          });
        } else {
          ukHash[key].push(hash);
        }
        //#endregion Check if the key is unique in the array provided
        //#region Check if it is unique in the table
        const ukFilter: QueryFilter = {},
          ukErrorMessages: Record<keyof T, string> = {} as Record<
            keyof T,
            string
          >;
        this._uniqueKeys[key].forEach((column) => {
          ukFilter[column as string] = row[column];
          ukErrorMessages[column] = `Column ${column as string} is not unique`;
        });
        ukQueries.push(this.count(ukFilter as QueryFilter<T>));
        ukErrors[index] = ukErrorMessages;
        //#endregion Check if it is unique in the table
      });
      //#endregion Unique Keys check

      //#region Generators (DB)
      Object.keys(dbGenerated).forEach((column) => {
        if (row[column as keyof T] === undefined) {
          row[column as keyof T] =
            dbGenerated[column as keyof T] as unknown as T[keyof T];
        }
      });
      //#endregion Generators (DB)

      // Set insert columns
      const insertColumns = (Object.keys(row) as Array<keyof T>).filter(
        (column) => {
          return !insertedColumns.includes(column);
        },
      );
      insertedColumns.push(...insertColumns);

      // Set the row
      rows[index] = row;
    });

    if (pkQueries.length > 0) {
      Promise.all(pkQueries).then((results) => {
        results.forEach((result, index) => {
          if (result.count > 0) {
            if (!errors[index]) {
              errors[index] = {} as ModelValidation<T>;
            }
            this._primaryKeys.forEach((column) => {
              if (errors[index][column] === undefined) {
                errors[index][column] = [];
              }
              errors[index][column]?.push(
                `Column ${column as string} is not unique`,
              );
            });
          }
        });
      });
    }

    // Check all async queries for output
    if (ukQueries.length > 0) {
      Promise.all(ukQueries).then((results) => {
        results.forEach((result, index) => {
          if (result.count > 0) {
            // Its not unique in the table
            if (!errors[index]) {
              errors[index] = {} as ModelValidation<T>;
            }
            Object.keys(ukErrors[index]).forEach((column) => {
              if (errors[index][column as keyof T] === undefined) {
                errors[index][column as keyof T] = [];
              }
              if (
                !errors[index][column as keyof T]?.includes(
                  ukErrors[index][column as keyof T],
                )
              ) {
                errors[index][column as keyof T]?.push(
                  ukErrors[index][column as keyof T],
                );
              }
            });
          }
        });
      });
    }

    // If error is present, throw and end
    if (Object.keys(errors).length > 0) {
      // throw new ModelValidationError(errors, this.name, this._connection.name);
      // throw new Error("Cannot insert due to errors");
      throw new ModelValidationError(errors, this.name, this._connection.name);
    }

    // console.log('Inserting', rows);
    const options: InsertQuery<T> = {
      type: 'INSERT',
      schema: this.schema,
      table: this.table,
      columns: this._aliasMap,
      data: rows,
    };

    await this._init();
    // console.log(this._connection.generateQuery(options));
    return this._connection.insert<T>(options);
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
      throw new ModelPermissionError('UPDATE', this.name, this._connectionName);
    }
    // If Filter is present, then get row count
    let rowCnt = 0;
    if (filters) {
      rowCnt = (await this.count(filters)).count;
    }
    // Delete Identity Columns from update
    this._identityColumns.forEach((column) => {
      delete data[column];
    });
    // Delete PK
    this._primaryKeys.forEach((column) => {
      delete data[column];
    });

    //#region Generators (Default)
    // Generator
    const dbGenerated: Record<keyof T, string> = {} as Record<
      keyof T,
      string
    >;
    // Get Generators, ones which are Functions or normal values, inject them, store DB generated in variable to inject later
    Object.keys(this._updateDefaults).forEach(async (column) => {
      if (data[column as keyof T] === undefined) {
        const generated = this._updateDefaults[column as keyof T] as
          | GeneratorFunction
          | GeneratorOutput;

        if (generated instanceof Function) {
          data[column as keyof T] = await generated() as unknown as T[keyof T];
        } else if (typeof generated === 'string') {
          if (this._connection.hasGenerator(generated)) {
            const gen = await this._connection.getGenerator(
              generated as keyof typeof Generator,
            );
            if (/^\$\{(.*)\}$/.test(gen as string)) {
              dbGenerated[column as keyof T] = gen as string;
            } else {
              data[column as keyof T] = gen as unknown as T[keyof T];
            }
          } else if (/^\$\{(.*)\}$/.test(generated as string)) {
            dbGenerated[column as keyof T] = generated as string;
          } else {
            data[column as keyof T] = generated as unknown as T[keyof T];
          }
        } else {
          data[column as keyof T] = generated as unknown as T[keyof T];
        }
      }
    });
    //#endregion Generators (Default)
    // Guardian Validator
    const [error, op] = await this.validateData(data);
    if (op) {
      data = op;
    }
    const errors: ModelValidation<T> = (error !== undefined)
        ? error
        : {} as ModelValidation<T>,
      ukQueries: Array<Promise<QueryResult<T>>> = [],
      ukErrors: Array<Record<keyof T, string>> = [];

    // Encryption
    //#region Encryption
    this._encryptedColumns.forEach((column) => {
      if (data[column] !== undefined) {
        data[column] = encrypt(
          this._encryptionKey as string,
          String(data[column]),
        ) as unknown as T[keyof T];
      }
    });
    //#endregion Encryption

    //#region Hash
    this._hashColumns.forEach((column) => {
      if (data[column] !== undefined) {
        data[column] = hash(String(data[column])) as unknown as T[keyof T];
      }
    });
    //#endregion Hash

    //#region Unique Keys
    Object.keys(this._uniqueKeys).forEach((key) => {
      // If unique key is part of update and roeCount > 1, throw error
      if (rowCnt > 1) {
        this._uniqueKeys[key].forEach((column) => {
          if (data[column] !== undefined) {
            // throw new ModelValidationError({
            //   [column]: [`Column ${column as string} is not unique`],
            // }, this.name, this._connection.name);
            // throw new Error(`Cannot perform bulk update as column ${column as string} is unique`);
            if (errors[column] === undefined) {
              errors[column] = [];
            }
            errors[column]?.push(
              `Cannot perform bulk update as column ${column as string} is unique`,
            );
          }
        });
      }

      // Check if the new value is actually unique in table
      const ukFilter: QueryFilter = {},
        ukErrorMessages: Record<keyof T, string> = {} as Record<
          keyof T,
          string
        >;
      this._uniqueKeys[key].forEach((column) => {
        ukFilter[column as string] = data[column];
        ukErrorMessages[column] = `Column ${column as string} is not unique`;
      });
      ukQueries.push(this.count(ukFilter as QueryFilter<T>));
      ukErrors.push(ukErrorMessages);
    });

    Promise.all(ukQueries).then((results) => {
      results.forEach((result, index) => {
        if (result.count > 0) {
          // Its not unique in the table
          Object.keys(ukErrors[index]).forEach((column) => {
            if (errors[column as keyof T] === undefined) {
              errors[column as keyof T] = [];
            }
            if (
              !errors[column as keyof T]?.includes(
                ukErrors[index][column as keyof T],
              )
            ) {
              errors[column as keyof T]?.push(
                ukErrors[index][column as keyof T],
              );
            }
          });
        }
      });
    });
    //#endregion Unique Keys

    // If error is present, throw and end
    if (Object.keys(errors).length > 0) {
      // throw new Error("Cannot update due to errors");
      throw new ModelValidationError(errors, this.name, this._connection.name);
    }

    //#region Generators (DB)
    Object.keys(dbGenerated).forEach((column) => {
      if (data[column as keyof T] === undefined) {
        data[column as keyof T] =
          dbGenerated[column as keyof T] as unknown as T[keyof T];
      }
    });
    //#endregion Generators (DB)
    if (filters) {
      this.validateFilters(filters);
    }
    const options: UpdateQuery<T> = {
      type: 'UPDATE',
      schema: this.schema,
      table: this.table,
      columns: this._aliasMap,
      data: data,
      filters: filters,
    };
    await this._init();
    return this._connection.update<T>(options);
  }

  /**
   * delete
   *
   * Deletes records in the table.
   *
   * @param filter Filters<T> Filter condition basis which to delete
   * @returns QueryResult<T>
   */
  public async delete(filters?: QueryFilter<T>): Promise<QueryResult<T>> {
    if (this._permissions.delete === false) {
      // throw new ModelPermission(
      //   "delete",
      //   this.name,
      //   this._connection.name,
      // );
      throw new ModelPermissionError('DELETE', this.name, this._connectionName);
    }
    await this._init();
    if (filters) {
      this.validateFilters(filters);
    }
    const options: DeleteQuery<T> = {
      type: 'DELETE',
      schema: this.schema,
      table: this.table,
      columns: this._aliasMap,
      filters: filters,
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
      throw new ModelPermissionError(
        'TRUNCATE',
        this.name,
        this._connectionName,
      );
    }
    await this._init();
    const options: TruncateTableQuery = {
      type: 'TRUNCATE',
      schema: this.schema,
      table: this.table,
    };

    await this._connection.truncateTable(options);
  }

  /**
   * validateFilters
   *
   * Checks if the filters are valid. It does basic validation such as disable search on hashed
   * column or encrypted column. It also checks if the column is part of the table.
   *
   * @param filters QueryFilter<T> The filter condition to validate
   * @returns
   */
  public validateFilters(filters: QueryFilter<T>): QueryFilter<T> | undefined {
    if (filters === undefined || Object.keys(filters).length === 0) {
      return;
    }
    const allowedKeys: string[] = [
        '$and',
        '$or',
        '$eq',
        '$neq',
        '$in',
        '$nin',
        '$lt',
        '$lte',
        '$gt',
        '$gte',
        '$between',
        '$from',
        '$to',
        '$null',
        '$like',
        '$nlike',
        '$ilike',
        '$nilike',
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
        if (
          this._encryptedColumns.includes(properKey as keyof T) ||
          this._hashColumns.includes(properKey as keyof T)
        ) {
          // TODO(@abhinav) - Support encrypted columns by decrypting the value in filter (once we move to DB encryption)
          throw new ModelFilterSecureColumn(
            properKey as string,
            this.name,
            this._connectionName,
          );
        }
      } else {
        throw new ModelFilterError(key, this._name, this._connectionName);
      }
      // Check value
      if (Array.isArray(value)) {
        processedFilter[properKey] = value;
      } else if (typeof value === 'object') {
        processedFilter[properKey] = this.validateFilters(
          value as QueryFilter<T>,
        );
      } else {
        processedFilter[properKey] = value;
      }
    }

    return processedFilter as QueryFilter<T>;
  }

  /**
   * validateData
   *
   * Performs all validation defined (Guardian) and returns the validated data.
   * NOTE - This does not perform DB checks such as Unique Keys, Foreign Keys etc.
   *
   * @param data Partial<T> The data to validate
   * @returns [ModelValidation<T>, null] | [null, Partial<T>] Returns object of errors (if any) or the data if no errors
   */
  public async validateData(
    data: Partial<T>,
  ): Promise<[ModelValidation<T>, undefined] | [undefined, Partial<T>]> {
    const errors: ModelValidation<T> = {};
    // First check what Guardian says
    const [err, op] = await this._validator.validate(data);
    // If there is error, append it
    if (err && err instanceof GuardianError) {
      // Object.entries(err.).forEach(([key, value]) => {
      err.children.forEach((item) => {
        if (errors[item.path as keyof T] === undefined) {
          errors[item.path as keyof T] = [];
        }
        errors[item.path as keyof T]?.push(item.message);
      });
    }
    if (op) {
      return [undefined, op];
    } else {
      return [errors, undefined];
    }
  }

  //#region Few generators
  // public async generateDDL(): Promise<string> {
  // }

  /**
   * generateInsert
   * This is primarily used for Seed data files. It takes care of most checks except for:
   * 1. Foreign Keys
   * 2. Unique keys on the entire table
   *
   * @param data Array<Partial<T>>> The data to be inserted
   * @returns QueryResult<T>
   */
  public async generateInsert(
    data: Partial<T> | Array<Partial<T>>,
  ): Promise<string> {
    const rows: Array<Partial<T>> =
        (Array.isArray(data) ? data : [data]) as Array<Partial<T>>,
      insertedColumns: Array<keyof T> = structuredClone(
        this._notNulls,
      ) as Array<keyof T>,
      errors: { [key: number]: ModelValidation<T> } = {},
      ukHash: { [key: string]: string[] } = {},
      ukErrors: Array<Record<keyof T, string>> = [];

    await this._init();
    // await rows.forEach(async (row, index) => {
    for (let index = 0; index < rows.length; index++) {
      let row = rows[index];
      //#region Generators (Default)
      // Generator
      const dbGenerated: Record<keyof T, string> = {} as Record<
        keyof T,
        string
      >;
      // Get Generators, ones which are Functions or normal values, inject them, store DB generated in variable to inject later
      await Object.keys(this._insertDefaults).forEach(async (column) => {
        if (row[column as keyof T] === undefined) {
          const generated = this._insertDefaults[column as keyof T] as
            | GeneratorFunction
            | GeneratorOutput;

          if (generated instanceof Function) {
            row[column as keyof T] = await generated() as unknown as T[keyof T];
          } else if (typeof generated === 'string') {
            if (this._connection.hasGenerator(generated)) {
              const gen = await this._connection.getGenerator(
                generated as keyof typeof Generator,
              );
              if (/^\$\{(.*)\}$/.test(gen as string)) {
                dbGenerated[column as keyof T] = gen as string;
              } else {
                row[column as keyof T] = gen as unknown as T[keyof T];
              }
            } else if (/^\$\{(.*)\}$/.test(generated as string)) {
              dbGenerated[column as keyof T] = generated as string;
            } else {
              row[column as keyof T] = generated as unknown as T[keyof T];
            }
          } else {
            row[column as keyof T] = generated as unknown as T[keyof T];
          }
        }
      });
      //#endregion Generators (Default)

      // Remove Identity key columns
      //#region Remove Identity key columns
      this._identityColumns.forEach((column) => {
        delete row[column];
      });
      //#endregion Identity key columns

      //#region Guardian
      // Guardian Validator
      const [error, validRow] = await this.validateData(row);
      if (error) {
        errors[index] = error;
      } else {
        row = validRow as NonNullable<T>;
      }
      //#endregion Guardian

      //#region Not Nulls
      // Check not nulls
      this._notNulls.forEach((column) => {
        if (
          (row[column] === undefined || row[column] === null) &&
          !this._identityColumns.includes(column) &&
          !Object.keys(dbGenerated).includes(column as string)
        ) {
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
      //#endregion Not Nulls

      //#region Encrypt Columns
      // Encryption
      // this._encryptedColumns.forEach((column) => {
      for (const column of this._encryptedColumns) {
        if (row[column] !== undefined || row[column] !== null) {
          row[column] = encrypt(
            this._encryptionKey as string,
            String(row[column]),
          ) as unknown as T[keyof T];
        }
      }
      // this._hashColumns.forEach((column) => {
      for (const column of this._hashColumns) {
        if (row[column] !== undefined || row[column] !== null) {
          row[column] = await hash(
            String(row[column]),
          ) as unknown as T[keyof T];
        }
      }
      // this._encryptedColumns.forEach((column) => {
      //   if (row[column] !== undefined) {
      //     row[column] = await this._encrypt(row[column] as string);
      //   }
      // });
      //#endregion Encrypt Columns

      //#region Unique Keys check
      Object.keys(this._uniqueKeys).forEach((key) => {
        if (ukHash[key] === undefined) {
          ukHash[key] = [];
        }
        //#region Check if the key is unique in the array provided
        // Create hash
        const hash = this._uniqueKeys[key].map((column) => {
          return row[column];
        }).join('::');
        if (ukHash[key].includes(hash)) {
          // Its not unique in the batch itself
          if (!errors[index]) {
            errors[index] = {} as ModelValidation<T>;
          }
          this._uniqueKeys[key].forEach((column) => {
            if (errors[index][column] === undefined) {
              errors[index][column] = [];
            }
            errors[index][column]?.push(
              `Column ${column as string} is not unique`,
            );
          });
        } else {
          ukHash[key].push(hash);
        }
        //#endregion Check if the key is unique in the array provided
      });
      //#endregion Unique Keys check

      //#region Generators (DB)
      Object.keys(dbGenerated).forEach((column) => {
        if (row[column as keyof T] === undefined) {
          row[column as keyof T] =
            dbGenerated[column as keyof T] as unknown as T[keyof T];
        }
      });
      //#endregion Generators (DB)

      // Set insert columns
      const insertColumns = (Object.keys(row) as Array<keyof T>).filter(
        (column) => {
          return !insertedColumns.includes(column);
        },
      );
      insertedColumns.push(...insertColumns);

      // Set the row
      rows[index] = row;
    }

    // If error is present, throw and end
    if (Object.keys(errors).length > 0) {
      // throw new ModelValidationError(errors, this.name, this._connection.name);
      // throw new Error("Cannot insert due to errors");
      throw new ModelValidationError(errors, this.name, this._connection.name);
    }

    await this._init();
    return this._connection.generateQuery({
      type: 'INSERT',
      schema: this.schema,
      table: this.table,
      columns: this._aliasMap,
      data: rows,
    });
  }
  //#endregion
  /**
   * _init
   *
   * Initialize the connection to DB
   */
  protected _init() {
    if (!this._connection) {
      this._connection = DatabaseManager.get(this._connectionName);
    }
  }

  //#region Static methods
  /**
   * validateModel
   *
   * Checks if the model definition is valid. It also performs some changes such as setting
   * PK columns to not updatable etc.
   *
   * @param model ModelDefintion Validates the model configuration provided
   * @returns ModelDefinition The validated (and some alteration if need be) model definition
   */
  public static validateModel(model: ModelDefinition): ModelDefinition {
    if (!model.connection) {
      throw new ModelConfigError(`Connecion param is missing`, model.name);
    }

    if (!DatabaseManager.has(model.connection)) {
      throw new ModelConfigError(
        `Could not find connection details`,
        model.name,
        model.connection,
      );
    }

    if (!model.table) {
      throw new ModelConfigError(
        `Table name not defined`,
        model.name,
        model.connection,
      );
    }

    Object.entries(model.columns).forEach(([colName, col]) => {
      // Check type

      // Disable update if the column is PK or Identity Column
      if (
        (model.primaryKeys &&
          Array.from(model.primaryKeys).includes(colName as string)) ||
        (['SERIAL', 'SMALLSERIAL', 'BIGSERIAL', 'AUTO_INCRIEMENT'].includes(
          col.type.toUpperCase(),
        ))
      ) {
        col.disableUpdate = true;
      }
      if (col.security && col.security === 'ENCRYPT') {
        if (
          model.encryptionKey === undefined || model.encryptionKey.length === 0
        ) {
          console.log('sdafsdfdsf');
          throw new ModelConfigError(
            `Encryption key not defined`,
            model.name,
            model.connection,
          );
          // throw new Error(
          //   `Model ${model.name} has an encrypted column but does not have an encryption key defined`,
          // );
        }
      }
    });

    if (model.encryptionKey) {
      if (model.encryptionKey.length !== 32) {
        throw new ModelConfigError(
          `Encryption key must be 32 bytes`,
          model.name,
          model.connection,
        );
      }
    }
    // Check PK
    if (model.primaryKeys) {
      model.primaryKeys.forEach((pk) => {
        if (model.columns[pk] === undefined) {
          throw new ModelConfigError(
            `Primary key column ${pk} not defined in columns`,
            model.name,
            model.connection,
          );
          // throw new Error(
          //   `Primary key column ${pk} does not exist in model ${model.name}`,
          // );
        }
      });
    }
    // Unique Keys
    if (model.uniqueKeys) {
      Object.entries(model.uniqueKeys).forEach(([ukName, uk]) => {
        uk.forEach((ukCol) => {
          if (model.columns[ukCol] === undefined) {
            throw new ModelConfigError(
              `Unique key ${ukName}  is using a column ${ukCol} which is not defined`,
              model.name,
              model.connection,
            );
            // throw new Error(
            //   `Unique key ${ukName} references a column that does not exist: ${ukCol}`,
            // );
          }
        });
      });
    }

    if (model.foreignKeys) {
      // Check if referenced FK's exist
      Object.entries(model.foreignKeys).forEach(([fkName, fk]) => {
        // Check data types of the columns
        Object.entries(fk.relationship).forEach(([fkCol, _pkCol]) => {
          if (model.columns[fkCol] === undefined) {
            throw new ModelConfigError(
              `Foreign key ${fkName}  is using a column ${fkCol} which is not defined`,
              model.name,
              model.connection,
            );
            // throw new Error(
            //   `Foreign key ${fkName} is using a column which is not defined in ${model.name}`,
            // );
          }
          // Maybe check the length also?
        });
      });
    }

    return model;
  }
  //#endregion Static methods
}
