# Middlewares

Collection of useful middlewares for OAK framework.

## Middlewares

- [X] [Timing](./timing/README.md)
- [X] [Throttle](./throttle/README.md)
- [X] [RequestId](./requestId/README.md)
- [X] [ErrorHandler](./errorHandler/README.md)
- [X] [Endpoint Security](./endpointSecurity/README.md)

## Usage

```ts
import { timing } from './mod.ts';
import { Application } from 'https://deno.land/x/oak@v11.1.0/mod.ts'

const app = new Application();
app.use(timing);

...
```
