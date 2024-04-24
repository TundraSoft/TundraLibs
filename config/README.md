# Config

Helper class which helps maintain configurations in your application. It can
load json, yaml and toml configuration files and even substitutes any ENV
variable when the config value is requested.

This is a singleton class.

## Usage

### Invocation

```ts
import { Config } from 'https://raw.githubusercontent.com/TundraSoft/TundraLibs/${TAG}/config/mod.ts';

await Config.load('./path/to/config/files');
// To load specific config files
await Config.load('./path/to/config/files', 'configname'); // This will search for the config file with the provided name

// Set env source (.env file if need be). This is optional.
Config.loadEnv('./');

Config.list(); // List all loaded config files

Config.has('configname'); // Pass the config file name

Config.has('configname', 'someKey', 'subKeyInSomeKey');

Config.get('configname'); // Returns all config items from config file configname

Config.get('configname', 'someKey'); // Returns specific config key from configname
```

### Methods

#### loadEnv

#### load

#### list

#### has

#### get

### Errors

## Notes
