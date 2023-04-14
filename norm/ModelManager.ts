import { fs, hex, path } from '../dependencies.ts';
import type {
  CreateTableQuery,
  Dialects,
  InsertQuery,
  ModelDefinition,
  // SchemaDefinition,
  // SchemaType,
} from './types/mod.ts';

type ProcessOutput = {
  imports: Map<string, Set<string>>;
  exports: Map<string, string>;
};

export class ModelManager {
  protected static _models: Record<string, ModelDefinition> = {};

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
