# sysinfo

Few helper functions to get standard system informations. Although most of the
API's can be used directly, these helpers take care of standardizing the output
and supressing errors and handle permission request.

## Usage

```ts
import { Sysinfo } from './mod.ts';

console.log(Sysinfo.getVendor());
//
```

## Methods

### getVendor

```ts
Sysinfo.getVendor();
```

`returns - string` - Get the operating system vendor. Example apple, microsoft
etc

### getArch

```ts
Sysinfo.getArch();
```

`returns - string` - Gets the underlying architecture example x86_64 etc

### getOs

```ts
Sysinfo.getOs();
```

`returns - string` - Returns the operating system name ("windows" | "darwin" |
"linux")

### getMemory

```ts
Sysinfo.getMemory();
```

### getLoad

```ts
Sysinfo.getLoad();
```

### getHostname

```ts
Sysinfo.getHostname();
```

`returns - Promise<string | undefined>` - The hostname if found else undefined

This method requires run (`--allow-run`) and env (`--allow-env`) to be enabled

### getIP

```ts
Sysinfo.getIP();
```

`returns - Promise<string | undefined>` - The ip address if found else undefined

This method requires run (`--allow-run`) and env (`--allow-env`) to be enabled

### getEnv

```ts
async Sysinfo.getEnv(name: string)
```

`name: string` The Environment variable name to get

`returns - Promise<string | undefined>` - The value of the environment variable
or undefined if not found

This method requires env permission (`--allow-env`) to be enabled

### getEnv

```ts
async Sysinfo.hasEnv(name: string)
```

`name: string` The Environment variable name to get

`returns - Promise<boolean>` - True if exists, else false

This method requires env permission (`--allow-env`) to be enabled
