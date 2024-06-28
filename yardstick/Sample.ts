// import { Application, send } from 'https://deno.land/x/oak@v10.6.0/mod.ts';
// import { Counter, Gauge, Histogram, Registry } from './metricMate.ts';

// const app = new Application();
// const registry = new Registry();

// // Define metrics
// const httpRequestDuration = new Histogram(
//   'http_request_duration_seconds',
//   'Duration of HTTP requests in seconds',
//   [0.1, 0.5, 1, 5, 10],
//   ['method', 'route', 'code'],
// );
// const httpRequestCount = new Counter(
//   'http_request_count',
//   'Count of HTTP requests',
//   ['method', 'route', 'code'],
// );
// const concurrentRequests = new Gauge(
//   'http_concurrent_requests',
//   'Number of concurrent HTTP requests',
// );

// registry.register(httpRequestDuration);
// registry.register(httpRequestCount);
// registry.register(concurrentRequests);

// // Prometheus middleware for monitoring
// app.use(async (context, next) => {
//   const start = Date.now();
//   concurrentRequests.inc();

//   try {
//     await next();
//   } finally {
//     const duration = (Date.now() - start) / 1000;
//     const { method, url, response } = context;
//     const route = url.pathname;

//     httpRequestDuration.observe({
//       method,
//       route,
//       code: response.status.toString(),
//     }, duration);
//     httpRequestCount.inc({ method, route, code: response.status.toString() });
//     concurrentRequests.dec();
//   }
// });

// // Middleware to serve static files with caching
// app.use(async (context, next) => {
//   const path = context.request.url.pathname;
//   if (path.startsWith('/images/')) {
//     const headers = new Headers();
//     headers.set('Cache-Control', 'public, max-age=86400'); // 1 day caching

//     try {
//       await send(context, path, {
//         root: './images',
//       });
//       context.response.headers = headers;
//     } catch {
//       context.response.status = 404;
//       context.response.body = 'Image not found';
//     }
//   } else {
//     await next();
//   }
// });

// // Metrics endpoint
// app.use(async (context) => {
//   if (context.request.url.pathname === '/metrics') {
//     context.response.body = registry.collect();
//   }
// });

// const port = 8000;
// console.log(`Server running on http://localhost:${port}`);
// await app.listen({ port });
