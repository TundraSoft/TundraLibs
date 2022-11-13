import type {
  CreateTableOptions,
  Dialect,
  ModelDefinition,
  ModelType,
} from "./types/mod.ts";
import { Model } from "./Model.ts";
import { DialectHelper } from "./DialectHelper.ts";

type GenerateDDLOptions = {
  dialect: Dialect;
  connection?: string;
  schema?: string;
  tables?: string[];
  seedData?: Record<string, unknown>;
};

export class ModelManager {
  protected static _modelConfig: {
    [name: string]: ModelDefinition;
  } = {};

  protected static _modelIndex: Map<string, string> = new Map();

  protected static _seedData: Map<string, Array<Record<string, unknown>>> =
    new Map();

  protected static _modelInstance: Map<string, Model> = new Map();

  // This (once snapshots are ready) be used only to "build" the models. i.e generate
  // the DDLs.
  // public static loadModels(path: string) {

  // }

  public static register(
    config: ModelDefinition,
    seedData?: Array<Record<string, unknown>>,
  ): void {
    const indexName = config.name.trim().toLowerCase(),
      name = config.name.trim();
    // Check if the name already exists
    if (ModelManager._modelIndex.has(indexName)) {
      // Compare values
      if (
        ModelManager
          ._modelConfig[ModelManager._modelIndex.get(indexName) as string] !==
          config
      ) {
        throw new Error(
          `A model with name ${name} already exists with different configuration`,
        );
      }
    } else {
      ModelManager.validateModel(config, true);
      ModelManager._modelIndex.set(indexName, name);
      if (seedData) {
        ModelManager._seedData.set(name, seedData);
      }
      ModelManager._modelConfig[name] = config;
    }
  }

  public static get<
    T extends ModelType<S>,
    S extends ModelDefinition = ModelDefinition,
  >(name: string): Model<S, T> {
    name = name.trim().toLowerCase();
    if (ModelManager._modelIndex.has(name)) {
      const modelName = ModelManager._modelIndex.get(name) as string;
      if (!ModelManager._modelInstance.has(modelName)) {
        const model = new Model(ModelManager._modelConfig[modelName]);
        ModelManager._modelInstance.set(modelName, model);
      }
      return ModelManager._modelInstance.get(modelName) as Model<S, T>;
    } else {
      throw new Error(`Could not find model definition with name ${name}`);
    }
  }

  /**
   * Idea of SnapShot is to save all model information (minus seed data) into a single file
   * which can act as the "import" in actual application. This should reduce the number of
   * imports and also ensure that a "freeze" or "lock" happens on model (prevent updates)
   */

  // Loads the snapshot from a file
  // public static loadSnapshot(name: string, location: string): void {
  // }

  // // Takes snapshot of the models and saves it to a file
  // public static snapshot(name: string, location: string): void {
  // }

  public static generateDDL(options: GenerateDDLOptions): string {
    const modelList = ModelManager._sortModels();
    if (options.connection) {
      modelList.forEach((model) => {
        if (model.connection !== options.connection) {
          modelList.delete(model);
        }
      });
    }
    if (options.schema) {
      modelList.forEach((model) => {
        if (model.schema !== options.schema) {
          modelList.delete(model);
        }
      });
    }
    if (options.tables && Array.isArray(options.tables)) {
      modelList.forEach((model) => {
        if (options.tables?.indexOf(model.table) === -1) {
          modelList.delete(model);
        }
      });
    }

    // if (options.models && Array.isArray(options.models)) {
    //   modelList.forEach((model) => {
    //     if (options.models?.indexOf(model.name) === -1) {
    //       modelList.delete(model);
    //     }
    //   });
    // }

    // Remove view models till we support them
    modelList.forEach((model) => {
      if (model.isView && model.isView === true) {
        modelList.delete(model);
      }
    });

    if (modelList.size === 0) {
      return "";
    }

    // Build the DDL
    const schemas: string[] = [],
      dropTable: string[] = [],
      tables: string[] = [],
      finalDDL: string[] = [],
      insertData: string[] = [],
      dialect = new DialectHelper(options.dialect);

    modelList.forEach((model) => {
      const columnAlias: Record<string, string> = {};

      if (model.schema) {
        if (schemas.includes(model.schema) === false) {
          schemas.push(model.schema);
        }
      }

      // Lets create the table
      const createTableOptions: CreateTableOptions = {
        schema: model.schema,
        table: model.table,
        columns: {},
      };

      Object.entries(model.columns).forEach(([name, column]) => {
        const colName = column.name || name as string;
        columnAlias[name] = colName;
        createTableOptions.columns[colName] = {
          type: column.type,
          length: column.length,
          isNullable: column.isNullable,
        };
      });

      if (model.foreignKeys) {
        const foreignKeysDefinition: {
          [name: string]: {
            schema?: string;
            table: string;
            columns: Record<string, string>;
          };
        } = {};
        Object.entries(model.foreignKeys).forEach(([name, fk]) => {
          const fkModel = ModelManager
            ._modelConfig[fk.model] as ModelDefinition;
          const colSet: Record<string, string> = {};
          Object.entries(fk.columns).forEach(([colName, fkColName]) => {
            colSet[columnAlias[colName]] = fkModel.columns[fkColName].name ||
              fkColName;
          });
          foreignKeysDefinition[name] = {
            schema: fkModel.schema,
            table: fkModel.table,
            columns: colSet,
          };
        });
        createTableOptions.foreignKeys = foreignKeysDefinition;
      }

      if (model.primaryKeys) {
        const pkCols: string[] = [];
        model.primaryKeys.forEach((pk) => {
          pkCols.push(columnAlias[pk]);
        });
        createTableOptions.primaryKeys = pkCols;
      }

      if (model.uniqueKeys) {
        Object.entries(model.uniqueKeys).forEach(([name, uk]) => {
          const ukCols: string[] = [];
          uk.forEach((col) => {
            ukCols.push(columnAlias[col]);
          });
          createTableOptions.uniqueKeys = createTableOptions.uniqueKeys || {};
          createTableOptions.uniqueKeys[name] = ukCols;
        });
      }

      dropTable.push(dialect.dropTable(model.table, model.schema));
      tables.push(dialect.createTable(createTableOptions));
      // Add insert data
      if (ModelManager._seedData.has(model.name)) {
        const data = ModelManager._seedData.get(model.name) as Record<
          string,
          unknown
        >[];
        insertData.push(dialect.insert<Record<string, unknown>>({
          schema: model.schema,
          table: model.table,
          columns: columnAlias,
          insertColumns: Object.keys(data[0]),
          data: data,
        }));
      }
    });

    // Generate Create Schemas
    // Add drop schemas first
    for (const schema of schemas) {
      finalDDL.push(dialect.dropSchema(schema, true));
    }
    // Add Drop tables
    for (const table of dropTable) {
      finalDDL.push(table);
    }
    // Add Create Schema
    for (const schema of schemas) {
      finalDDL.push(dialect.createSchema(schema));
    }
    // Add Create tables
    finalDDL.push(...tables);
    // Add Inserts
    finalDDL.push(...insertData);

    return finalDDL.join("\n\n");
  }

  public static generateMigration() {}

  public static validateModels() {
    Object.entries(ModelManager._modelConfig).forEach(([_name, config]) => {
      ModelManager.validateModel(config, false);
    });
  }

  public static validateModel(config: ModelDefinition, ignoreFKModels = true) {
    // Does it have PK
    const columns: Array<string> = [];
    if (
      config.columns === undefined || Object.keys(config.columns).length === 0
    ) {
      throw new Error(`Model ${config.name} does not have any columns defined`);
    }
    Object.entries(config.columns).forEach(([key, value]) => {
      columns.push(key);
      if (value.type === undefined) {
        throw new Error(
          `Column ${key} in model ${config.name} does not have a type defined`,
        );
      }
      if (
        value.type === "AUTO_INCREMENT" || value.type === "SERIAL" ||
        value.type === "BIGSERIAL" || value.type === "SMALLSERIAL"
      ) {
        if (value.isNullable && value.isNullable === true) {
          throw new Error(
            `Column ${key} in model ${config.name} cannot be nullable`,
          );
        }
      }
    });

    if (config.primaryKeys !== undefined) {
      config.primaryKeys.forEach((key) => {
        if (!columns.includes(key)) {
          throw new Error(
            `Primary key ${key} in model ${config.name} is not a valid column`,
          );
        }
      });
    }

    if (config.uniqueKeys !== undefined) {
      Object.entries(config.uniqueKeys).forEach(([key, value]) => {
        value.forEach((col) => {
          if (!columns.includes(col)) {
            throw new Error(
              `Unique key ${key} in model ${config.name} is not a valid column`,
            );
          }
        });
      });
    }

    // Indexes
    if (config.indexes !== undefined) {
      Object.entries(config.indexes).forEach(([key, value]) => {
        value.forEach((col) => {
          if (!columns.includes(col)) {
            throw new Error(
              `Index ${key} in model ${config.name} is not a valid column`,
            );
          }
        });
      });
    }

    // FK. Problem here is the model may not be defined yet
    if (config.foreignKeys !== undefined) {
      Object.entries(config.foreignKeys).forEach(([name, definition]) => {
        // key is name
        if (
          ModelManager._modelIndex.has(definition.model.toLowerCase()) ===
            false && ignoreFKModels === false
        ) {
          throw new Error(
            `Foreign key ${name} in model ${config.name} references model ${definition.model} which is not defined`,
          );
        }
        const modelName = ModelManager._modelIndex.get(
            definition.model.toLowerCase(),
          ) as string,
          modelDefinition = ModelManager
            ._modelConfig[modelName] as ModelDefinition;

        Object.entries(definition.columns).forEach(
          ([sourceColumn, desitnationColumn]) => {
            if (!columns.includes(sourceColumn)) {
              throw new Error(
                `Index ${sourceColumn} in model ${config.name} is not a valid column`,
              );
            }
            if (ignoreFKModels === false) {
              if (!modelDefinition.columns[desitnationColumn] === undefined) {
                throw new Error(
                  `Index ${desitnationColumn} in model ${definition.model} is not a valid column`,
                );
              }
              // Check data type
              if (
                modelDefinition.columns[desitnationColumn].type !==
                  config.columns[sourceColumn].type
              ) {
                throw new Error(
                  `Foreign key ${name} in model ${config.name} references column ${desitnationColumn} in model ${definition.model} which is not of same type`,
                );
              }
            }
          },
        );
      });
    }
  }

  protected static _sortModels(): Set<ModelDefinition> {
    const modelList: Map<string, ModelDefinition> = new Map(),
      modelIndex: Array<string> = Object.keys(ModelManager._modelConfig);

    // Loop through all of them, sort by dependencies
    while (modelIndex.length > 0) {
      const modelName = modelIndex.shift() as string,
        definition = ModelManager._modelConfig[modelName] as ModelDefinition;

      if (definition.foreignKeys === undefined) {
        modelList.set(modelName, definition);
      } else {
        let allDefined = true;
        Object.entries(definition.foreignKeys).forEach(
          ([_name, fkDefinition]) => {
            const fkModelName = ModelManager._modelIndex.get(
              fkDefinition.model.toLowerCase(),
            ) as string;
            if (modelList.has(fkModelName) === false) {
              allDefined = false;
            }
          },
        );
        if (allDefined === true) {
          modelList.set(modelName, definition);
        } else {
          modelIndex.push(modelName);
        }
      }
      // TODO - add check for infinite loop
    }
    return new Set(modelList.values());
  }
}
