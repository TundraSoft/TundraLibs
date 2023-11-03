# Config

Every application will have configuration files present. This library helps
in loading those configurations. It supports json, YAML and TOML formats and
also has the ability to replace environment variables when the config value
is requested.

## Usage

The config class is a singleton, this means all loaded configuration data
no matter how many times you initialize the class. This also means, that if
you load config from 2 different directories and they contain files with
same name, the old one will be replaced.

```ts
import { Config } from '';

const config = new Config();
config.load(basePath = './configs'); // Load all YAML, TOML and JSON files from this path
```
