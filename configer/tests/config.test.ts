import { Config } from '../mod.ts';
import { path } from '../../dependencies.ts';
import { assertEquals } from '../../dev.dependencies.ts';

const basePath = path.join(
  path.dirname(path.fromFileUrl(new URL('', import.meta.url))),
  'configs',
);

Deno.test({
  name: 'Test json file format',
  async fn() {
    await Config.load('json_ext', basePath);
    assertEquals(Config.get('json_ext', 'owner', 'name'), 'Tom Preston-Werner');
  },
});

Deno.test({
  name: 'Test yaml (yml) file format',
  async fn() {
    await Config.load('yml_ext', basePath);
    assertEquals(Config.get('yml_ext', 'owner', 'name'), 'Tom Preston-Werner');
  },
});

Deno.test({
  name: 'Test yaml (yaml) file format',
  async fn() {
    await Config.load('yaml_ext', basePath);
    assertEquals(Config.get('yaml_ext', 'owner', 'name'), 'Tom Preston-Werner');
  },
});

Deno.test({
  name: 'Test toml_ext file format',
  async fn() {
    await Config.load('toml_ext', basePath);
    assertEquals(Config.get('toml_ext', 'owner', 'name'), 'Tom Preston-Werner');
  },
});

// Deno.test({
//   name: "Test env variable",
//   async fn() {
//     await Config.load("json_ext", basePath);
//     assertEquals(Config.get("json_ext", "userName", "TTT"), "TTT");
//   },
// });

// Deno.test({
//   name: "Test typed output",
//   async fn() {
//     /*const basePath = path.join(
//       path.dirname(path.fromFileUrl(new URL("", import.meta.url))),
//       "configs",
//     );*/
//     await Config.load("toml_ext");
//     type obj = {
//       name: string,
//       dob: boolean
//     }
//     const op = Config.get<obj>("toml_ext", "owner");

//     assertEquals(Config.get<{name: string, dob: Date}>("toml_ext", "owner"), {name: "Tom Preston-Werner", dob: '1979-05-27T15:32:00.000Z'});
//   },
// });
