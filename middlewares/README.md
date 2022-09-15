# Middlewares

Collection of useful middlewares for OAK framework.

## Middlewares

- [x] [Timing](./timing/README.md)
- [x] [Throttle](./throttle/README.md)
- [x] [RequestId](./requestId/README.md)
- [x] [ErrorHandler](./errorHandler/README.md)
- [x] [Endpoint Security](./endpointSecurity/README.md)

## Usage

```ts
import { timing } from './mod.ts';
import { Application } from 'https://deno.land/x/oak@v11.1.0/mod.ts'

const app = new Application();
app.use(timing);

...
```
