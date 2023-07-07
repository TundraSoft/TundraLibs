import { path } from '../../dependencies.ts';

export const DockerSecrets = () => {
  const _secrets = new Map<string, string>();
  const basePath = '/run/secrets';

  try {
    const files = Deno.readDirSync(basePath);
    for (const file of files) {
      if (file.isFile) {
        const name = file.name;
        const value = Deno.readTextFileSync(path.posix.join(basePath, name));
        _secrets.set(name.trim().toLowerCase(), value);
      }
    }
  } catch (e) {
    if (e.name !== 'NotFound') {
      throw e;
    }
  }

  return (name: string) => {
    return _secrets.get(name.trim().toLowerCase());
  };
};


console.log(DockerSecrets()('ads'));
// export class DockerSecrets implements AbstractProvider {
//   protected _initialized = false;
//   protected _path = '/run/secrets'
//   protected _secrets: Map<string, string> = new Map();

//   constructor() {
//     this.init();
//     this._secrets.set('sdf', 'sdf');
//     Object.prototype.toString = () => {
//       return 'sdf'
//     }
//   }

//   init(): void {
//     try {
//       for (const file of Deno.readDirSync(this._path)) {
//         if (file.isFile) {
//           const name = file.name, 
//             value = Deno.readTextFileSync(path.posix.join(this._path, file.name));
//           this._secrets.set(name.trim().toLowerCase(), value);
//         }
//       }
//     } catch (e) {
//       if(e.name !== 'NotFound') {
//         console.log('Some other error')
//       }
//     }
//     this._initialized = true;
//   }

//   get(name: string): string | undefined {
//     if(!this._initialized) {
//       this.init();
//     }
//     name = name.trim().toLowerCase();
//     return this._secrets.get(name) as string;
//   }

//   public toString(): string {
//       return 'sdf'
//   }
// }

// const d = new DockerSecrets();
// d.init();

// console.log(d);
