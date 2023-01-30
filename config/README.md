# Config

Helper library to handle config files in your application. Supports ENV argument
substitution in the config file. Also supports production and development
configuration files (defaults to production). Supports TOML, YAML and JSON file
formats

## Usage

```toml
# configs/database.production.toml
server = "192.168.1.1"
ports = [ 8000, 8001, 8002 ]
connection_max = 5000
enabled = true
username = test_user
password = $DATABASE_PASSWORD
```

```ts
import { Config } from './mod.ts';
await Config.load('database');
const user = Config.get('database', 'username'); // returns test_user
const pass = Config.get('database', 'password'); // if env variable for $DATABASE_PASSWORD is found will substitute and return that value else returns $DATABASE_PASSWORD
const db = Config.get('database'); // returns all items from database config file
```

### Methods

#### load

```ts
load(name: string, path = "./configs"): Promise<boolean>
```

`name: string` - The file name which has to be loaded

`path: string = "./configs"` - Directory where the config files reside

Load a specific config file

#### once

```ts
get<T extends Record<string, unknown> | string | number | boolean>
get(name: string, ...items: string[]): unknown
```

`name: string` - The config file from which to get data

`items: string[]` - Sub items (optional) to return.

Returns the config data from the "file" specified (name). If the values have
environment variables ($ENV_NAME), it will replace them before returning.

## TODO

- [x] Support TOML, YAML, JSON formats
- [x] Substitute ENV variables in config when fetching value
- [x] Support different environments (development & production)
- [ ] Handle missing ENV variables by returning null
