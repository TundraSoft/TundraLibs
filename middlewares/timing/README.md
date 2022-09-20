# Timing

A simple middleware which calculates the time taken to respond to a request.

The header name/key would be X-RESPONSE-TIME

## Usage

```ts
import { timing } from './mod.ts';
import { Application } from 'https://deno.land/x/oak@v11.1.0/mod.ts'

const app = new Application();
app.use(timing);
...
```
