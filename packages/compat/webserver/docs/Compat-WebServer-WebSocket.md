# WebSocket Guide

Complete guide to the WebSocket support built into the WebServer
module. For the middleware-aware `WebSocketServer` primitive (Koa-style
middleware, pluggable codecs, broadcast, connection tracking) built on
top of these, see
[Compat-WebSocket](../../websocket/Compat-WebSocket.md).

## Table of Contents

- [Overview](#overview)
- [Runtime Support](#runtime-support)
- [Basic Setup](#basic-setup)
- [Handler Reference](#handler-reference)
- [Authentication](#authentication)
- [Message Handling](#message-handling)
- [Connection Management](#connection-management)
- [Best Practices](#best-practices)

## Overview

The WebServer module provides integrated WebSocket support across all three runtimes. WebSocket connections are upgraded from HTTP requests, allowing you to handle both HTTP and WebSocket on the same port.

## Runtime Support

| Runtime | Support     | Notes                                                     |
| ------- | ----------- | --------------------------------------------------------- |
| Bun     | ✅ Native   | Native implementation                                     |
| Deno    | ✅ Native   | Via `Deno.upgradeWebSocket()`                             |
| Node.js | ✅ via `ws` | The `ws` npm package is loaded lazily on first WS upgrade |

The Node.js implementation lazy-loads `ws` only when an upgrade arrives — Bun and Deno never import it. A few WebSocket events behave differently across runtimes; see the table on `WebSocketHandler` in [`types/WebSocketHandler.ts`](../types/WebSocketHandler.ts) for the complete matrix.

## Basic Setup

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

const server = new WebServer('WSServer', {
  mode: 'TCP',
  port: 8080,
  handler: (req) => new Response('Use WebSocket to connect'),
  websocket: {
    open: (ws, ctx) => {
      console.log('Client connected:', ctx.remoteAddress);
    },
    message: (ws, data) => {
      console.log('Received:', data);
      ws.send(`Echo: ${data}`);
    },
    close: (ws, code, reason) => {
      console.log(`Disconnected: ${code} ${reason}`);
    },
  },
});

server.start();
```

Client connection:

```javascript
const ws = new WebSocket('ws://localhost:8080');
ws.onopen = () => ws.send('Hello!');
ws.onmessage = (e) => console.log(e.data);
```

## Handler Reference

### WebSocketHandler

```typescript
interface WebSocketHandler {
  open?: (ws: ServerWebSocket, ctx: WebSocketUpgradeContext) => void;
  message?: (ws: ServerWebSocket, data: WebSocketData) => void;
  close?: (ws: ServerWebSocket, code: number, reason: string) => void;
  error?: (ws: ServerWebSocket, error: Error) => void;
  ping?: (ws: ServerWebSocket, data: Uint8Array) => void;
  pong?: (ws: ServerWebSocket, data: Uint8Array) => void;
  drain?: (ws: ServerWebSocket) => void;
  idleTimeout?: number;
}
```

### Event Handlers

#### `open(ws, ctx)`

Called when a connection is established.

```typescript
open: ((ws, ctx) => {
  console.log('New connection from', ctx.remoteAddress);
  console.log('Request URL:', ctx.request.url);
  ws.send(JSON.stringify({ type: 'welcome' }));
});
```

#### `message(ws, data)`

Called when a message is received.

```typescript
message: ((ws, data) => {
  if (typeof data === 'string') {
    const msg = JSON.parse(data);
    handleMessage(ws, msg);
  } else {
    // Binary data (Uint8Array or ArrayBuffer)
    handleBinaryMessage(ws, data);
  }
});
```

#### `close(ws, code, reason)`

Called when connection closes.

```typescript
close: ((ws, code, reason) => {
  console.log(`Connection closed: ${code} - ${reason}`);
  cleanupConnection(ws);
});
```

Common close codes:

- `1000` - Normal closure
- `1001` - Going away (page navigation)
- `1006` - Abnormal closure (no close frame)
- `1008` - Policy violation
- `1011` - Unexpected error

#### `error(ws, error)`

Called on WebSocket errors. Native on Deno and Node (`ws`); on Bun, errors thrown by your handlers are caught and synthesized into this callback.

```typescript
error: ((ws, error) => {
  console.error('WebSocket error:', error.message);
  ws.close(1011, 'Internal error');
});
```

#### `ping(ws, data)` / `pong(ws, data)`

Called on ping/pong frames. Available on Bun and Node.js. Deno consumes ping/pong frames internally — its WebSocket doesn't surface them, so handlers are unreachable there (a hard runtime limit, not an oversight).

```typescript
ping: (ws, data) => {
  console.log('Ping received');
},
pong: (ws, data) => {
  console.log('Pong received, connection alive');
}
```

#### `drain(ws)`

Called when the send buffer is drained. Bun fires it natively; Node.js fires it via `ws`'s drain event; Deno is emulated by polling `bufferedAmount` after each `send()`.

```typescript
drain: ((ws) => {
  console.log('Buffer drained, can send more data');
});
```

### ServerWebSocket Interface

```typescript
interface ServerWebSocket<T = unknown> {
  send(data: WebSocketData): void;
  close(code?: number, reason?: string): void;
  ping(data?: WebSocketData): boolean;
  pong(data?: WebSocketData): boolean;
  readonly readyState: number;
  readonly data: T;
  readonly remoteAddress?: string;
}
```

### WebSocketUpgradeContext

```typescript
interface WebSocketUpgradeContext {
  request: Request;
  remoteAddress: string | null;
  remotePort: number | null;
}
```

## Authentication

WebSocket connections must be authenticated during the upgrade handshake, as the connection is established before your code runs. Here are common approaches:

### 1. Query Parameters

Simple but visible in logs/history:

```typescript
// Client
const ws = new WebSocket('ws://localhost:8080?token=abc123');

// Server
websocket: {
  open: ((ws, ctx) => {
    const url = new URL(ctx.request.url);
    const token = url.searchParams.get('token');

    if (!validateToken(token)) {
      ws.close(1008, 'Invalid token');
      return;
    }

    // Store user info
    authenticatedUsers.set(ws, getUserFromToken(token));
  });
}
```

### 2. Headers (Custom Protocol)

Use `Sec-WebSocket-Protocol` header:

```typescript
// Client
const ws = new WebSocket('ws://localhost:8080', ['auth-token-abc123']);

// Server
websocket: {
  open: ((ws, ctx) => {
    const protocols = ctx.request.headers.get('sec-websocket-protocol');
    const token = protocols?.split(',')[0]?.trim();

    if (!token?.startsWith('auth-')) {
      ws.close(1008, 'Missing auth protocol');
      return;
    }

    const actualToken = token.replace('auth-', '');
    if (!validateToken(actualToken)) {
      ws.close(1008, 'Invalid token');
      return;
    }
  });
}
```

### 3. Cookies

For browser clients with existing session:

```typescript
websocket: {
  open: ((ws, ctx) => {
    const cookies = ctx.request.headers.get('cookie');
    const sessionId = parseCookie(cookies, 'session_id');

    if (!validateSession(sessionId)) {
      ws.close(1008, 'Invalid session');
      return;
    }
  });
}
```

### 4. First-Message Authentication

Authenticate in the first message:

```typescript
const pendingAuth = new Set();

websocket: {
  open: (ws, ctx) => {
    pendingAuth.add(ws);
    // Give client 5 seconds to authenticate
    setTimeout(() => {
      if (pendingAuth.has(ws)) {
        ws.close(1008, 'Authentication timeout');
      }
    }, 5000);
  },
  
  message: (ws, data) => {
    if (pendingAuth.has(ws)) {
      const msg = JSON.parse(data as string);
      if (msg.type === 'auth' && validateToken(msg.token)) {
        pendingAuth.delete(ws);
        ws.send(JSON.stringify({ type: 'auth_success' }));
      } else {
        ws.close(1008, 'Authentication failed');
      }
      return;
    }
    
    // Handle normal messages
    handleMessage(ws, data);
  },
  
  close: (ws) => {
    pendingAuth.delete(ws);
  }
}
```

### 5. HTTP Upgrade Endpoint

Pre-authenticate via HTTP, then upgrade:

```typescript
const upgradeTokens = new Map(); // token -> user

handler: async (req, info) => {
  const url = new URL(req.url);
  
  // HTTP auth endpoint
  if (url.pathname === '/ws-auth' && req.method === 'POST') {
    const { credentials } = await req.json();
    const user = authenticate(credentials);
    
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    const token = crypto.randomUUID();
    upgradeTokens.set(token, user);
    setTimeout(() => upgradeTokens.delete(token), 30000);
    
    return Response.json({ wsUrl: `ws://localhost:8080?token=${token}` });
  }
  
  return new Response('OK');
},

websocket: {
  open: (ws, ctx) => {
    const url = new URL(ctx.request.url);
    const token = url.searchParams.get('token');
    const user = upgradeTokens.get(token);
    
    if (!user) {
      ws.close(1008, 'Invalid upgrade token');
      return;
    }
    
    upgradeTokens.delete(token);
    authenticatedUsers.set(ws, user);
  }
}
```

## Message Handling

### JSON Protocol

```typescript
interface Message {
  type: string;
  payload?: unknown;
}

websocket: {
  message: ((ws, data) => {
    if (typeof data !== 'string') {
      ws.close(1003, 'Binary not supported');
      return;
    }

    try {
      const msg: Message = JSON.parse(data);

      switch (msg.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        case 'subscribe':
          handleSubscribe(ws, msg.payload);
          break;
        case 'message':
          handleChatMessage(ws, msg.payload);
          break;
        default:
          ws.send(JSON.stringify({
            type: 'error',
            payload: 'Unknown message type',
          }));
      }
    } catch {
      ws.send(JSON.stringify({
        type: 'error',
        payload: 'Invalid JSON',
      }));
    }
  });
}
```

### Binary Data

```typescript
websocket: {
  message: ((ws, data) => {
    if (data instanceof Uint8Array) {
      // Process binary data
      const processed = processBuffer(data);
      ws.send(processed);
    } else if (data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(data);
      // Handle ArrayBuffer
    }
  });
}
```

## Connection Management

### Tracking Connected Clients

```typescript
const clients = new Set<ServerWebSocket>();

websocket: {
  open: (ws) => {
    clients.add(ws);
    console.log(`Clients: ${clients.size}`);
  },
  close: (ws) => {
    clients.delete(ws);
    console.log(`Clients: ${clients.size}`);
  }
}

// Broadcast to all clients
function broadcast(message: string) {
  for (const client of clients) {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  }
}
```

### Room/Channel System

```typescript
const rooms = new Map<string, Set<ServerWebSocket>>();

function joinRoom(ws: ServerWebSocket, roomId: string) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId)!.add(ws);
}

function leaveRoom(ws: ServerWebSocket, roomId: string) {
  rooms.get(roomId)?.delete(ws);
  if (rooms.get(roomId)?.size === 0) {
    rooms.delete(roomId);
  }
}

function broadcastToRoom(
  roomId: string,
  message: string,
  exclude?: ServerWebSocket,
) {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const client of room) {
    if (client !== exclude && client.readyState === 1) {
      client.send(message);
    }
  }
}
```

### Heartbeat/Keep-Alive

```typescript
const lastPong = new Map<ServerWebSocket, number>();

websocket: {
  open: (ws) => {
    lastPong.set(ws, Date.now());
  },
  pong: (ws) => {
    lastPong.set(ws, Date.now());
  },
  close: (ws) => {
    lastPong.delete(ws);
  }
}

// Check for stale connections every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [ws, time] of lastPong) {
    if (now - time > 60000) {
      ws.close(1001, 'Heartbeat timeout');
    } else {
      ws.ping();
    }
  }
}, 30000);
```

## Best Practices

### 1. Always Validate Input

```typescript
message: ((ws, data) => {
  if (typeof data !== 'string' || data.length > 65536) {
    ws.close(1009, 'Message too large');
    return;
  }
  // Process message
});
```

### 2. Handle Errors Gracefully

```typescript
message: ((ws, data) => {
  try {
    const msg = JSON.parse(data as string);
    processMessage(ws, msg);
  } catch (error) {
    ws.send(JSON.stringify({ error: 'Invalid message format' }));
  }
});
```

### 3. Use Idle Timeout

```typescript
websocket: {
  idleTimeout: 120, // Close after 2 minutes of inactivity
  // ...
}
```

### 4. Clean Up on Close

```typescript
close: ((ws, code, reason) => {
  // Remove from all data structures
  clients.delete(ws);
  authenticatedUsers.delete(ws);
  for (const room of rooms.values()) {
    room.delete(ws);
  }
});
```

### 5. Rate Limiting

```typescript
const messageCount = new Map<ServerWebSocket, number>();

websocket: {
  open: (ws) => {
    messageCount.set(ws, 0);
  },
  message: (ws, data) => {
    const count = messageCount.get(ws) || 0;
    if (count > 100) {
      ws.close(1008, 'Rate limit exceeded');
      return;
    }
    messageCount.set(ws, count + 1);
    // Process message
  },
  close: (ws) => {
    messageCount.delete(ws);
  }
}

// Reset counts every minute
setInterval(() => {
  for (const ws of messageCount.keys()) {
    messageCount.set(ws, 0);
  }
}, 60000);
```

---

[← Back to WebServer](../Compat-WebServer.md)
