import type { TableDefinition, ViewDefinition } from '../types/mod.ts';
import { fs, path } from '../../dependencies.ts';

/**
 * Consolidates all model definition into a single DataModel.ts file
 *
 * @param src The source directory of the models
 * @param modPath The consolidated path where the DataModel.ts will be written
 */
export const consolidate = async (src: string, modPath: string) => {
  const readPerm = await Deno.permissions.request({ name: 'read', path: src });
  const writePerm = await Deno.permissions.request({
    name: 'write',
    path: modPath,
  });
  const DataModel: Record<string, TableDefinition | ViewDefinition> = {};

  if (readPerm.state !== 'granted') throw new Error('Permission denied');
  if (writePerm.state !== 'granted') throw new Error('Permission denied');

  for await (const entry of fs.walk(src)) {
    if (entry.isFile && entry.name.endsWith('.model.ts')) {
      const realPath = await Deno.realPathSync(entry.path);
      const models = await import(`file://${realPath}`);
      Object.entries(models).forEach(([name, model]) => {
        DataModel[name] = model as TableDefinition | ViewDefinition;
      });
    }
  }

  // Add imports???
  // Detect where SchemaDefinition is located
  Deno.writeFile(
    path.join(modPath, 'DataModel.ts'),
    new TextEncoder().encode(
      `export const DataModel = ${
        JSON.stringify(DataModel, null, 2)
      } as const;`,
    ),
    { create: true, append: false },
  );
  // Add Schema???
};

consolidate('norm/tests/testdata/', 'norm/tests/testdata/');
