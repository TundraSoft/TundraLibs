import {
  type BindParameters,
  Database,
  DatabaseOpenOptions,
  SqliteError,
} from '$sqlite';
import * as path from '$path';
import * as fs from '$fs';
import { EventOptionKeys } from '@tundralibs/utils';
import { AbstractEngine } from '../AbstractEngine.ts';
import { DAMEngineConfigError } from '../errors/mod.ts';
import {
  SQLiteEngineConnectError,
  SQLiteEngineQueryError,
} from './errors/mod.ts';
import type { EngineEvents } from '../types/mod.ts';
import type { SQLiteEngineOptions } from './types/mod.ts';
import type { Query } from '../../query/types/mod.ts';
import { QueryParameters } from '../../query/mod.ts';

export class SQLiteEngine extends AbstractEngine<SQLiteEngineOptions> {
  public readonly Engine = 'SQLITE';

  protected _client: Database | undefined;

  constructor(
    name: string,
    options: EventOptionKeys<SQLiteEngineOptions, EngineEvents>,
  ) {
    super(name, options, {
      engine: 'SQLITE',
    });
    this._setOption('maxConcurrent', 1);
    this._maxConcurrent = 1;
    if (!['FILE', 'MEMORY'].includes(this.getOption('type') as string)) {
      throw new DAMEngineConfigError(
        'Type must be either "FILE" or "MEMORY".',
        {
          name: this.name,
          engine: this.Engine,
          configKey: 'type',
          configValue: this.getOption('type'),
        },
      );
    }
    if (this.getOption('type') === 'FILE') {
      if (this.getOption('storagePath') === undefined) {
        throw new DAMEngineConfigError(
          'Storage path is required for FILE type.',
          {
            name: this.name,
            engine: this.Engine,
            configKey: 'storagePath',
            configValue: this.getOption('storagePath'),
          },
        );
      }
    }
    if (this.getOption('storagePath') !== undefined) {
      this._processOption('storagePath', this.getOption('storagePath'));
    }
  }

  /**
   * Creates a new schema/database and attaches it to the current connection.
   * This method only works in FILE mode.
   *
   * @param schemaName The name of the schema to create
   * @throws {SQLiteEngineSchemaError} If the schema already exists or can't be created
   */
  public createSchema(schemaName: string): void {
    if (this.getOption('type') !== 'FILE') {
      throw new SQLiteEngineQueryError({
        name: this.name,
        query: {
          sql: `CREATE SCHEMA ${schemaName}`,
        },
      }, new Error('Schema creation is only supported in FILE mode'));
    }

    if (!this._client) {
      throw new SQLiteEngineQueryError({
        name: this.name,
        query: {
          sql: `CREATE SCHEMA ${schemaName}`,
        },
      }, new Error('No database connection'));
    }

    if (!/^[a-zA-Z0-9_]+$/.test(schemaName)) {
      throw new SQLiteEngineQueryError(
        {
          name: this.name,
          query: {
            sql: `CREATE SCHEMA ${schemaName}`,
          },
        },
        new Error(
          'Schema name can only contain alphanumeric characters and underscores',
        ),
      );
    }

    const baseStore = path.join(
      this.getOption('storagePath') || '',
      this.name,
    );
    const dbFile = path.join(baseStore, `${schemaName}.db`);

    try {
      // Check if the schema already exists
      if (fs.existsSync(dbFile)) {
        throw new SQLiteEngineQueryError({
          name: this.name,
          query: {
            sql: `CREATE SCHEMA ${schemaName}`,
          },
        }, new Error(`Schema '${schemaName}' already exists`));
      }

      // Create the database file
      const tempDb = new Database(dbFile, { create: true });
      tempDb.close();

      // Attach the database to the current connection
      this._client.exec(`ATTACH DATABASE '${dbFile}' AS ${schemaName}`);

      return;
    } catch (e) {
      // If it's already our error type, just rethrow it
      if (e instanceof SQLiteEngineQueryError) {
        throw e;
      }

      // Otherwise wrap the error
      throw new SQLiteEngineQueryError({
        name: this.name,
        query: {
          sql: `CREATE SCHEMA ${schemaName}`,
        },
      }, e as Error);
    }
  }

  /**
   * Drops a schema/database and deletes the associated file.
   * This method only works in FILE mode.
   *
   * @param schemaName The name of the schema to drop
   * @throws {SQLiteEngineSchemaError} If the schema doesn't exist or can't be dropped
   */
  public dropSchema(schemaName: string): void {
    if (this.getOption('type') !== 'FILE') {
      throw new SQLiteEngineQueryError({
        name: this.name,
        query: {
          sql: `DROP SCHEMA ${schemaName}`,
        },
      }, new Error('Schema deletion is only supported in FILE mode'));
    }

    if (!this._client) {
      throw new SQLiteEngineQueryError({
        name: this.name,
        query: {
          sql: `DROP SCHEMA ${schemaName}`,
        },
      }, new Error('No database connection'));
    }

    if (schemaName === 'main') {
      throw new SQLiteEngineQueryError({
        name: this.name,
        query: {
          sql: `DROP SCHEMA ${schemaName}`,
        },
      }, new Error('Cannot drop the main database'));
    }

    const baseStore = path.join(
      this.getOption('storagePath') || '',
      this.name,
    );
    const dbFile = path.join(baseStore, `${schemaName}.db`);

    try {
      // Check if the schema exists
      if (!fs.existsSync(dbFile)) {
        throw new SQLiteEngineQueryError({
          name: this.name,
          query: {
            sql: `DROP SCHEMA ${schemaName}`,
          },
        }, new Error(`Schema '${schemaName}' does not exist`));
      }

      // Detach the database
      this._client.exec(`DETACH DATABASE ${schemaName}`);

      // Delete the file
      Deno.removeSync(dbFile);

      return;
    } catch (e) {
      // If it's already our error type, just rethrow it
      if (e instanceof SQLiteEngineQueryError) {
        throw e;
      }

      // Otherwise wrap the error
      throw new SQLiteEngineQueryError({
        name: this.name,
        query: {
          sql: `DROP SCHEMA ${schemaName}`,
        },
      }, e as Error);
    }
  }

  //#region Protected Methods
  protected override _standardizeQuery(query: Query): Query {
    const standardQuery = super._standardizeQuery(query);

    return {
      sql: standardQuery.sql.replace(
        /:(\w+):/g,
        (_, word) => `:${word}`,
      ),
      params: query.params,
    };
  }

  //#region Abstract Methods
  protected _init(): void {
    try {
      const baseStore = path.join(
        this.getOption('storagePath') || '',
        this.name,
      );
      const mainDb = path.join(
        baseStore,
        'main.db',
      );
      const type = this.getOption('type') === 'MEMORY' ? ':memory:' : mainDb;
      const options: DatabaseOpenOptions = {
        create: true,
      };
      this._client = new Database(type, options);
      // Scan for all .db files and add them to the database
      if (this.getOption('type') === 'FILE') {
        for (const file of fs.walkSync(baseStore)) {
          if (
            file.isFile && file.name.endsWith('.db') && file.name !== 'main.db'
          ) {
            const schemaName = file.name.replace('.db', '');
            this._client.exec(
              `ATTACH DATABASE '${file.path}' AS ${schemaName}`,
            );
          }
        }
      }
    } catch (e) {
      throw new SQLiteEngineConnectError(
        {
          name: this.name,
          type: this.getOption('type'),
          storagePath: this.getOption('storagePath'),
        },
        e as Error,
      );
    }
  }

  protected _finalize(): void {
    if (this._client) {
      this._client.close();
      this._client = undefined;
    }
  }

  protected _ping(): boolean {
    if (!this._client) return false;

    try {
      // Use direct client connection instead of query method to avoid recursion
      this._client.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  protected async _version(): Promise<string> {
    try {
      const res = await this.query<{ version: string }>({
        sql: 'SELECT sqlite_version() as "version"',
      });
      return res.data[0]!.version || 'N/A';
    } catch {
      return 'N/A';
    }
  }

  protected _query<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: Query,
  ): { count: number; data: T[] } {
    // Ensure we have a client
    if (!this._client) {
      throw new SQLiteEngineQueryError({
        name: this.name,
        query: query,
      }, new Error('No database connection'));
    }

    const sql = query.sql;
    const params = (query.params instanceof QueryParameters)
      ? query.params.asRecord()
      : query.params;

    // Check for schema creation statements
    const createSchemaMatch = sql.match(
      /CREATE\s+(SCHEMA|DATABASE)\s+([a-zA-Z0-9_]+)/i,
    );
    if (createSchemaMatch && this.getOption('type') === 'FILE') {
      const schemaName = createSchemaMatch[2];
      try {
        // Create the schema file and attach it
        this.createSchema(schemaName!);
        // Return successful result without executing the CREATE SCHEMA statement
        return {
          count: 1,
          data: [] as T[],
        };
      } catch (e) {
        throw new SQLiteEngineQueryError({
          name: this.name,
          query,
        }, e as Error);
      }
    }

    // Check for schema drop statements
    const dropSchemaMatch = sql.match(
      /DROP\s+(SCHEMA|DATABASE)\s+([a-zA-Z0-9_]+)/i,
    );
    if (dropSchemaMatch && this.getOption('type') === 'FILE') {
      const schemaName = dropSchemaMatch[2];
      try {
        // Drop the schema and delete the file
        this.dropSchema(schemaName!);
        // Return successful result without executing the DROP SCHEMA statement
        return {
          count: 1,
          data: [] as T[],
        };
      } catch (e) {
        throw new SQLiteEngineQueryError({
          name: this.name,
          query,
        }, e as Error);
      }
    }

    try {
      // Determine if this is a SELECT query or a modification query
      const isSelect = /^\s*SELECT\s/i.test(sql);
      const stmt = this._client.prepare(sql);
      if (isSelect) {
        // For SELECT queries, use queryEntries to get formatted results
        const rows = stmt.all<T>(params as BindParameters);
        return {
          count: rows.length,
          data: rows,
        };
      } else {
        // For INSERT/UPDATE/DELETE statements, use exec and return affected row count
        stmt.run(
          params as BindParameters,
        );

        // Get the changes count and last insert ID
        const changes = this._client.changes;
        // const lastInsertId = result.lastInsertId;

        return {
          count: changes,
          data: [],
        };
      }
    } catch (e) {
      throw new SQLiteEngineQueryError(
        {
          name: this.name,
          query,
        },
        e as SqliteError,
      );
    }
  }
  //#endregion Abstract Methods
  protected override _processOption<K extends keyof SQLiteEngineOptions>(
    key: K,
    value: SQLiteEngineOptions[K],
  ): SQLiteEngineOptions[K] {
    switch (key) {
      case 'type':
        if (value && !['FILE', 'MEMORY'].includes(value as string)) {
          throw new DAMEngineConfigError(
            'Type must be either "FILE" or "MEMORY".',
            {
              name: this.name || 'N/A',
              engine: this.Engine || 'N/A',
              configKey: key,
              configValue: value,
            },
          );
        }
        break;
      case 'storagePath':
        // Skip validation for in-memory databases
        // We do the check post class initialization
        if (
          value && typeof value === 'string' && value.trim().length > 0 &&
          this.name !== undefined
        ) {
          try {
            const storagePath = path.join(value, this.name);
            fs.ensureDirSync(storagePath);
            const tmpFile = path.join(storagePath, `${Date.now()}.tmp`);
            try {
              Deno.writeFileSync(
                tmpFile,
                new TextEncoder().encode('test'),
              );
            } finally {
              Deno.removeSync(tmpFile);
            }
          } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
              throw new DAMEngineConfigError(
                'Storage path not found.',
                {
                  name: this.name || 'N/A',
                  engine: this.Engine || 'N/A',
                  configKey: key,
                  configValue: value,
                },
              );
            } else if (
              error instanceof Deno.errors.PermissionDenied ||
              error instanceof Deno.errors.NotCapable
            ) {
              throw new DAMEngineConfigError(
                'Permission denied to access storage path. Need read/write access.',
                {
                  name: this.name || 'N/A',
                  engine: this.Engine || 'N/A',
                  configKey: key,
                  configValue: value,
                },
              );
            } else {
              throw new DAMEngineConfigError(
                'Error accessing storage path.',
                {
                  name: this.name || 'N/A',
                  engine: this.Engine || 'N/A',
                  configKey: key,
                  configValue: value,
                },
                error as Error,
              );
            }
          }
        }
        break;
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }
  //#endregion Protected Methods
}
