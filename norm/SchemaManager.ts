import { path } from '../dependencies.ts';
import type {
  CreateTableQuery,
  Dialects,
  InsertQuery,
  ModelDefinition,
  SchemaDefinition,
  SchemaType,
} from './types/mod.ts';

import { Model } from './Model.ts';
// import { DatabaseManager } from "./DatabaseManager.ts";
import { QueryTranslator } from './QueryTranslator.ts';

import { ModelConfigError } from './errors/mod.ts';

export class SchemaManager<
  SD extends SchemaDefinition = SchemaDefinition,
  ST extends SchemaType<SD> = SchemaType<SD>,
> {
  private _models: Record<string, Model> = {};
  private _schema: SchemaDefinition = {};

  constructor(schema: SD) {
    // We do not validate now, we only validate later on
    this._schema = schema;
    //this._init();
  }

  public init() {
    this._schema = SchemaManager.validateSchema(this._schema);
  }

  public get<T extends keyof ST>(name: T): Model<ModelDefinition, ST[T]> {
    // Load only when called
    if (this._models[name as keyof SchemaDefinition] === undefined) {
      this._models[name as keyof SchemaDefinition] = new Model(
        this._schema[name as keyof SchemaDefinition],
      );
    }
    return this._models[name as keyof SchemaDefinition] as Model<
      ModelDefinition,
      ST[T]
    >;
  }

  /**
   * validateSchema
   *
   * Validates the schema definition provided. Checks FK relation mapping, database configuration,
   * PK configuration etc. Internally calls Model.validateModel
   *
   * @param schema SchemaDefinition The schema to validate
   * @returns SchemaDefinition - The validated schema
   */
  public static validateSchema(schema: SchemaDefinition): SchemaDefinition {
    // It is possible that the input is actually an import, so we tread lightly
    // const schema = JSON.parse(JSON.stringify((schemas))) as SchemaDefinition;
    Object.entries(schema).forEach(([modelName, model]) => {
      if (modelName !== model.name) {
        throw new Error(
          `Model name ${modelName} does not match with name in model definition(${model.name})`,
        );
      }
      // Validate the model
      Model.validateModel(model);
      // Check FK
      if (model.foreignKeys) {
        // Check if referenced FK's exist
        Object.entries(model.foreignKeys).forEach(([fkName, fk]) => {
          if (!schema[fk.model]) {
            // throw new Error(
            //   `Foreign key ${fkName} references a model that does not exist: ${fk.model}`,
            // );
            throw new ModelConfigError(
              `Foreign key ${fkName} references a model that does not exist: ${fk.model}`,
              model.name,
              model.connection,
            );
          }
          // Check data types of the columns
          Object.entries(fk.relationship).forEach(([fkCol, pkCol]) => {
            if (model.columns[fkCol] === undefined) {
              // throw new Error(
              //   `Foreign key ${fkName} is using a column which is not defined in ${modelName}`,
              // );
              throw new ModelConfigError(
                `Foreign key ${fkName} is using a column which is not defined in ${modelName}`,
                model.name,
                model.connection,
              );
            }
            if (schema[fk.model].columns[pkCol] === undefined) {
              // throw new Error(
              //   `Foreign key ${fkName} references a column that does not exist: ${fk.model}.${pkCol}`,
              // );
              throw new ModelConfigError(
                `Foreign key ${fkName} references a column that does not exist: ${fk.model}.${pkCol}`,
                model.name,
                model.connection,
              );
            }
            if (
              schema[fk.model].columns[pkCol].type !== model.columns[fkCol].type
            ) {
              // throw new Error(
              //   `Foreign key ${fkName} references a column with a different data type: ${modelName}.${fkCol} -> ${fk.model}.${pkCol}`,
              // );
              throw new ModelConfigError(
                `Foreign key ${fkName} references a column with a different data type: ${modelName}.${fkCol} -> ${fk.model}.${pkCol}`,
                model.name,
                model.connection,
              );
            }
            // Maybe check the length also?
          });
        });
        // Inject columns for joining
      }
    });
    return schema;
  }

  /**
   * generateImports
   *
   * Gernerates a mod.ts file which includes all the model definition in the folder
   * This ensures proper typeexport for SchemaManager and also makes it easy to add
   * or remove models. Do note, all model files must have extension .model.ts
   *
   * @param location string Path where the model files are stored.
   */
  public static async generateImports(location: string) {
    const currDir = await Deno.realPath('./');
    Deno.chdir(await Deno.realPath(location));
    // Generate the export statements
    const exports = (await SchemaManager._getModelExports('./'));
    // Write to mod.ts in the path
    await Deno.writeFile(
      'mod.ts',
      new TextEncoder().encode(exports.join('\n')),
      {
        create: true,
        append: false,
      },
    );
    Deno.chdir(currDir);
    // const modFile = await Deno.open("mod.ts", { create: true, write: true });
  }

  public static async generateDDL(
    modelPath: string,
    seedPath: string,
    dialect: Dialects,
    outPath: string,
  ) {
    const mod = Deno.realPathSync(path.join(modelPath, 'mod.ts')),
      realSeedPath = Deno.realPathSync(seedPath),
      schema = await import(`file://${mod}`),
      models: SchemaDefinition = schema,
      modelNames = Object.keys(models),
      hierarchy: ModelDefinition[] = [];
    // We assume the FK scenario is validated!
    while (modelNames.length > 0) {
      const name = modelNames.shift() as string,
        model = models[name as keyof typeof models];
      if (model.foreignKeys === undefined) {
        hierarchy.push(model);
      } else {
        // Check if all tables present in foreign keys are already in the hierarchy
        const allPresent = Object.values(model.foreignKeys).every((fk) =>
          !modelNames.includes(fk.model)
        );
        if (allPresent) {
          hierarchy.push(model);
        } else {
          modelNames.push(name);
        }
      }
    }
    // Ok we have them in order, now we can generate
    const finalSQL: string[] = [],
      schemas: string[] = [],
      tableStructure: CreateTableQuery[] = [],
      insertSQL: InsertQuery[] = [];

    hierarchy.forEach((model) => {
      if (model.schema && !schemas.includes(model.schema)) {
        schemas.push(model.schema);
      }
      // Clean up the model
      const cleanModel: CreateTableQuery = {
          type: 'CREATE_TABLE',
          table: model.table,
          schema: model.schema,
          columns: {},
        },
        insert: InsertQuery = {
          type: 'INSERT',
          table: model.table,
          schema: model.schema,
          columns: {},
          data: [],
        };

      // Replace PK column names
      if (model.primaryKeys) {
        cleanModel.primaryKey = Array.from(model.primaryKeys).map((pk) =>
          model.columns[pk].name || pk
        );
      }

      // Replace UK column names
      if (model.uniqueKeys) {
        cleanModel.uniqueKeys = {};
        Object.entries(model.uniqueKeys).forEach(([name, columns]) => {
          cleanModel.uniqueKeys![name] = Array.from(columns).map((column) =>
            model.columns[column].name || column
          );
        });
      }

      // Replace FK column names
      if (model.foreignKeys) {
        cleanModel.foreignKeys = {};
        Object.entries(model.foreignKeys).forEach(([name, fk]) => {
          cleanModel.foreignKeys![name] = {
            table: models[fk.model].table,
            schema: models[fk.model].schema,
            columnMap: Object.fromEntries(
              Object.entries(fk.relationship).map(([column, relatedColumn]) => {
                return [
                  model.columns[column].name || column,
                  models[fk.model].columns[relatedColumn].name || relatedColumn,
                ];
              }),
            ),
          };
        });
      }

      // Generate Column details
      Object.entries(model.columns).forEach(([name, column]) => {
        cleanModel.columns[column.name || name] = {
          type: (column.security) ? 'VARCHAR' : column.type,
          length: (column.security) ? undefined : column.length,
          isNullable: column.isNullable,
        };
        insert.columns[name] = column.name || name;
      });

      tableStructure.push(cleanModel);
      // Check if seed file is available
      try {
        const file = model.name + '.seed.json',
          seedData = JSON.parse(
            Deno.readTextFileSync(path.join(realSeedPath, file)),
          );
        insert.data = seedData;
        insertSQL.push(insert);
      } catch (_e) {
        // Nothing to do
      }
    });

    const translator = new QueryTranslator(dialect);

    schemas.map((schema) =>
      finalSQL.push(translator.translate({
        type: 'CREATE_SCHEMA',
        schema,
      }))
    );

    finalSQL.push(''); // Add a new line
    tableStructure.map((table) => finalSQL.push(translator.translate(table) + '\n'));
    finalSQL.push('');
    // console.log(db.generateQuery(tableStructure[0]));
    Deno.writeFileSync(
      path.join(outPath, `DDL.${dialect}.sql`),
      new TextEncoder().encode(finalSQL.join('\n')),
      { create: true, append: false },
    );
    const inserts = insertSQL.map((insert) => translator.translate(insert) + '\n\n');
    // Insert statements
    Deno.writeFileSync(
      path.join(outPath, `DML.${dialect}.sql`),
      new TextEncoder().encode(inserts.join('\n')),
      { create: true, append: false },
    );
  }

  /**
   * _getModelExports
   *
   * Internal function which actually loops through directory and gets the models for
   * exporting.
   *
   * @param location string The path from where to check for files
   * @returns string[] - The export statements
   */
  protected static async _getModelExports(location: string) {
    const realPath = await Deno.realPath(location),
      modelExports: string[] = [];
    for await (const modelFile of Deno.readDir(realPath)) {
      if (modelFile.isDirectory) {
        const imp = await SchemaManager._getModelExports(
          `${location}/${modelFile.name}`,
        );
        if (imp.length > 0) {
          modelExports.push(`//#region Begin ${modelFile.name}`);
          modelExports.push(...imp);
          modelExports.push(`//#endregion End ${modelFile.name}`);
        }
      } else {
        if (modelFile.name.toLowerCase().endsWith('.model.ts')) {
          // Its a model definition
          // console.log(`file://${path.join(realPath, modelFile.name)}`);
          const tm = await import(
            `file://${path.join(realPath, modelFile.name)}`
          );
          modelExports.push(
            `export { default as ${tm.default.name} } from './${
              path.posix.join(`${location}`, `${modelFile.name}`)
            }';`,
          );
        }
      }
    }
    return modelExports;
  }
}
