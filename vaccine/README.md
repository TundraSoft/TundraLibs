# Vaccine

Vaccine is a lightweight and flexible Dependency Injection (DI) library. Its main goal is to make "injecting" dependencies as seamless as possible with type safety and powerful features.

## Features

- **Multiple Injection Modes**:
  - **Singleton** - The service is instantiated once and shared across all injections
  - **Scoped** - The service is instantiated once per scope (useful for request-scoped services)
  - **Transient** - A new service instance is created for each injection
- **Flexible Injection Types**:
  - **Constructor injection** - Services defined with `@Vial` decorator
  - **Factory injection** - Values created by factory functions using `@DoseFactory`
  - **Value injection** - Direct value injection using `@DoseValue`
- **Type Safety** - Full TypeScript support with generics
- **Error Handling** - Detailed error messages and circular dependency detection
- **Zero Dependencies** - Lightweight with no external runtime dependencies

## Getting Started

### Installation

```bash
# For Deno
import { Dose, DoseFactory, DoseValue, Inoculate, Vaccine, Vial } from "@tundralibs/vaccine";

# For npm (if available)
npm install @tundralibs/vaccine
```

## Basic Usage

### Defining Services

Services (vials) are defined using the `@Vial` decorator:

```typescript
import { Vial } from '@tundralibs/vaccine';

@Vial('SINGLETON')
class LoggerService {
  log(message: string): void {
    console.log(`[LOG] ${message}`);
  }
}

@Vial('TRANSIENT')
class Counter {
  private count = 0;

  increment(): number {
    return ++this.count;
  }

  get value(): number {
    return this.count;
  }
}

@Vial('SCOPED')
class RequestContext {
  readonly id: string = crypto.randomUUID();
  readonly timestamp: Date = new Date();
}
```

### Injecting Dependencies

Use the `@Dose` decorator to mark properties for injection and the `@Inoculate` decorator to inject dependencies:

```typescript
import { Dose, Inoculate } from '@tundralibs/vaccine';

@Inoculate()
class UserService {
  @Dose()
  private logger!: LoggerService;

  @Dose()
  private counter!: Counter;

  createUser(name: string): void {
    this.logger.log(`Creating user: ${name} (${this.counter.increment()})`);
  }
}

// Usage
const userService = new UserService();
userService.createUser('John'); // [LOG] Creating user: John (1)
```

## Advanced Usage

### Factory Injection

Use the `@DoseFactory` decorator to inject values created by factory functions:

```typescript
import { DoseFactory, Inoculate } from '@tundralibs/vaccine';

function createConfig() {
  return {
    apiUrl: 'https://api.example.com',
    timeout: 5000,
    apiKey: crypto.randomUUID(),
  };
}

@Inoculate()
class ApiClient {
  @DoseFactory(createConfig)
  private config!: ReturnType<typeof createConfig>;

  makeRequest(endpoint: string): void {
    console.log(`Making request to ${this.config.apiUrl}/${endpoint}`);
    console.log(`Using API key: ${this.config.apiKey}`);
  }
}

// Each instance gets a newly-created config
const client1 = new ApiClient();
const client2 = new ApiClient();
client1.makeRequest('users'); // Different API key than client2
```

### Value Injection

Use the `@DoseValue` decorator to inject constant values:

```typescript
import { DoseValue, Inoculate } from '@tundralibs/vaccine';

const APP_VERSION = '1.0.0';
const SETTINGS = { darkMode: true, language: 'en' };

@Inoculate()
class AppService {
  @DoseValue(APP_VERSION)
  private version!: string;

  @DoseValue(SETTINGS)
  private settings!: typeof SETTINGS;

  getInfo(): string {
    return `App v${this.version} (${this.settings.language})`;
  }
}

// Usage
const app = new AppService();
console.log(app.getInfo()); // App v1.0.0 (en)
```

### Scoped Services

Scoped services are useful for request-scoped dependencies:

```typescript
import { Dose, Inoculate } from '@tundralibs/vaccine';

@Inoculate('request-123')
class RequestHandler {
  @Dose()
  private context!: RequestContext;

  handleRequest(): void {
    console.log(`Handling request ${this.context.id}`);
  }
}

@Inoculate('request-123')
class ResponseFormatter {
  @Dose()
  private context!: RequestContext;

  format(data: any): any {
    return {
      ...data,
      requestId: this.context.id,
      timestamp: this.context.timestamp,
    };
  }
}

// Both services share the same RequestContext instance
const handler = new RequestHandler();
const formatter = new ResponseFormatter();
```

### Manual Registration and Resolution

You can manually register and resolve dependencies:

```typescript
import { Vaccine } from '@tundralibs/vaccine';

// Register a service
class DatabaseService {
  connect(): void {
    console.log('Connected to database');
  }
}
Vaccine.addPrescription(DatabaseService, 'SINGLETON');

// Register a factory
Vaccine.addFactory('config', () => ({
  dbUrl: 'postgres://localhost:5432',
  maxConnections: 10,
}));

// Manual injection
class Repository {
  @Dose()
  private db!: DatabaseService;

  @Dose()
  private config!: any;

  constructor() {
    Vaccine.inoculate(this);
  }

  findAll(): void {
    this.db.connect();
    console.log(`Using connection: ${this.config.dbUrl}`);
  }
}

const repo = new Repository();
repo.findAll();
```

### Mixed Injection Types

You can use multiple injection types in a single class:

```typescript
import { Dose, DoseFactory, DoseValue, Inoculate } from '@tundralibs/vaccine';

@Inoculate()
class AdvancedService {
  @Dose()
  private logger!: LoggerService; // Service injection

  @DoseValue('production')
  private environment!: string; // Value injection

  @DoseFactory(() => ({ timestamp: Date.now() }))
  private context!: { timestamp: number }; // Factory injection

  execute(): void {
    this.logger.log(
      `Running in ${this.environment} at ${this.context.timestamp}`,
    );
  }
}
```

## Error Handling

Vaccine provides detailed error messages to help debug common issues:

- **Circular Dependencies**: Detected and reported with the dependency path
- **Missing Services**: Clear error when trying to inject an unregistered service
- **Configuration Errors**: Validation of decorator options
- **Type Safety**: TypeScript integration to catch type issues at compile time

Example of circular dependency error:

```
Error: Circular dependency detected: ServiceA → ServiceB → ServiceA
This usually happens when two or more services depend on each other.
```

## API Reference

### Decorators

#### `@Vial(type: 'SINGLETON' | 'SCOPED' | 'TRANSIENT'): ClassDecorator`

Marks a class as a vial (service) with the specified lifecycle.

#### `@Dose(options?: { isFactory?: boolean, isValue?: boolean }): PropertyDecorator`

Marks a property as injectable. Options are generally not needed as specialized decorators are preferred.

#### `@DoseFactory<T>(factory: () => T): PropertyDecorator`

Injects the result of a factory function.

#### `@DoseValue<T>(value: T): PropertyDecorator`

Injects a constant value.

#### `@Inoculate(scope?: string): ClassDecorator`

Automatically injects dependencies into a class on instantiation.

### Vaccine API

#### `Vaccine.addPrescription(constructor: Vial, type?: VialModes): void`

Registers a service with the DI container.

#### `Vaccine.addFactory<T>(name: string, factory: () => T, type?: VialModes): void`

Registers a factory function with the DI container.

#### `Vaccine.getPrescription<T>(typeOrName: Vial<T> | string, scope?: string): T`

Resolves a service from the DI container.

#### `Vaccine.inoculate(instance: any, scope?: string): void`

Manually injects dependencies into an instance.

## License

This project is licensed under the MIT License.
