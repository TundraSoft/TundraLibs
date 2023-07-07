# requestID - Middleware

A simple middleware which sets a unique request ID to every request and adds the
same id to the response also. If the header already contains request id, it will
use that request id instead of fenerating a new id.

The header name/key would be X-REQUEST-ID in both request and response.

## Usage

```ts
import {requestId} from "./requestId.ts";
import { Application } from "https://deno.land/x/oak/mod.ts";

const app = new Application();
app.use(requestId);

...
```
