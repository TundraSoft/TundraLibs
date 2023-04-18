import { fs, hex, path } from '../dependencies.ts';
import type {
  CreateTableQuery,
  Dialects,
  InsertQuery,
  ModelDefinition,
  Models,
  TypedModels,
  // SchemaDefinition,5
  // SchemaType,
} from './types/mod.ts';
import { Model } from './Model.ts';
import { ModelConfigError, ModelValidationError } from './errors/mod.ts';

type ProcessOutput = {
  imports: Map<string, Set<string>>;
  exports: Map<string, string>;
};

export class ModelManager<
  MD extends Models = Models,
  MT extends TypedModels<MD> = TypedModels<MD>,
> {
  private _models: Record<string, Model> = {};
  private _schema: Models = {};

  constructor(schema: MD) {
    // We do not validate now, we only validate later on
    this._schema = schema;
    //this._init();
  }

  public init() {
    this._schema = ModelManager.validateSchema(this._schema);
  }

  public get<T extends keyof MT>(name: T): Model<ModelDefinition, MT[T]> {
    // Load only when called
    if (this._schema[name as keyof Models] === undefined) {
      throw new Error(`Cannot find definition for ${name as string}`);
    }
    if (this._models[name as keyof Models] === undefined) {
      this._models[name as keyof Models] = new Model(
        this._schema[name as keyof Models],
      );
    }
    return this._models[name as keyof Models] as Model<
      ModelDefinition,
      MT[T]
    >;
  }

  public getSchemaNames(): string[] {
    return Object.keys(this._schema);
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
  public static validateSchema(schema: Models): Models {
    // It is possible that the input is actually an import, so we tread lightly
    // const schema = JSON.parse(JSON.stringify((schemas))) as SchemaDefinition;
    const models = Object.keys(schema);
    // Object.entries(schema).forEach(([modelName, model]) => {
    for (const modelName of models) {
      const model = schema[modelName];
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
    }
    return schema;
  }

  public static async compose(location: string, suffix = '.model.ts') {
    // Check if directory exists
    const output = await ModelManager._processSource(
        path.join(location, 'definition'),
        suffix,
      ),
      destination = path.join(location, 'ModelDefinition.ts');
    const imports = [...output.imports].map(([file, imp]) => {
        imp.delete('');
        return `import { ${[...imp].join(', ')} } from '${file}';`;
      }).join('\n'),
      exports = [...output.exports].map(([name, definition]) => {
        return `'${name}': ${definition}, `;
      }).join('\n'),
      keys = [...output.exports].map(([name, definition]) => {
        return `'${name}'`;
      }).join(' | ');
    const final =
        `${imports} \n\nexport default { \n${exports} \n} as const; \n\nexport type ModelNames = ${keys};`,
      hash = new TextDecoder().decode(
        hex.encode(
          new Uint8Array(
            await crypto.subtle.digest(
              'SHA-512',
              new TextEncoder().encode(final),
            ),
          ),
        ),
      );
    Deno.writeTextFileSync(destination, `${final}\n\n// SHA-512:${hash}\n`, {
      create: true,
      append: false,
    });
  }

  protected static async _processSource(
    location: string,
    suffix = '.model.ts',
  ): Promise<ProcessOutput> {
    suffix = suffix.trim().toLowerCase();
    const realPath = await Deno.realPath('./'),
      importRegex = /\bimport\b.*?['"].*?['"];/g,
      importDetailRegex =
        /import\s*{\s*([^}]+)\s*}\s*from\s*(['"])(.*?)\2\s*[;]*/g,
      exportRegex = /export\s+default\s+\{([\s\S]*)\}/ms;

    const importMaps: Map<string, Set<string>> = new Map(),
      exportMaps: Map<string, string> = new Map();
    for (const entry of fs.walkSync(location)) {
      if (!entry.isFile && !entry.name.toLowerCase().endsWith(suffix)) {
        continue;
      }
      const contents = Deno.readTextFileSync(entry.path);
      //#region Extract imports
      for (
        const [, imports, _, moduleStr] of contents.matchAll(importDetailRegex)
      ) {
        if (!moduleStr) {
          continue;
        }
        const moduleUrl = moduleStr.trim();
        const moduleImports = imports.split(',').map((i) => i.trim());
        if (!importMaps.has(moduleUrl)) {
          importMaps.set(moduleUrl, new Set(moduleImports));
        } else {
          const existing = importMaps.get(moduleUrl)!;
          moduleImports.forEach((i) => existing.add(i));
        }
      }
      //#endregion Extract imports
      //#region Extract exports
      const exportBlock = contents.match(exportRegex)?.[1];
      if (exportBlock) {
        const tm = await import(
          `file://${path.join(realPath, entry.path)}`
        );
        exportMaps.set(tm.default.name as string, `{${exportBlock}}`); //.replaceAll(/\n/g, '').replaceAll(/\t/g, ''));
      }
      // Fetch the name for this
      //#endregion Extract exports
    }
    return {
      imports: importMaps,
      exports: exportMaps,
    };
  }
}
