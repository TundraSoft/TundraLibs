// Ensure the global metadata symbol is present
// Symbol.metadata ??= Symbol("Symbol.metadata");

export type ModuleOptions = {
  name?: string;
  namespace?: string;
};

// 1. Define the internal schema for what a registered module looks like
export interface RegisteredModule {
  constructor: abstract new (...args: never[]) => unknown;
  name: string;
  namespace: string;
  routes: string[];
}

// 2. Define the shared decorator metadata object schema
interface CustomMetadata {
  namespace?: string;
  routes?: string[];
}

// 3. THE CENTRAL VARIABLE: A strictly-typed registry Map
export const ModuleRegistry = new Map<string, RegisteredModule>();

export type ModuleConstructor = (abstract new (...args: never[]) => unknown) & {
  readonly Name: string;
};

// --- CLASS DECORATOR ---
export function Module(options: ModuleOptions) {
  return <Class extends ModuleConstructor>(
    target: Class,
    context: ClassDecoratorContext<Class>,
  ): void => {
    // Defer registration so method decorators have finished collecting routes
    context.addInitializer(function (this: Class, bunTarget?: Class) {
      const classConstructor = this ?? bunTarget ?? target;

      // Access the metadata object shared with method decorators
      const meta = context.metadata as CustomMetadata;

      const resolvedNamespace = options.namespace ?? meta.namespace ??
        'Default';
      const resolvedRoutes = meta.routes ?? [];

      // Save everything into our single registry variable!
      ModuleRegistry.set(classConstructor.Name, {
        constructor: classConstructor,
        name: classConstructor.Name,
        namespace: resolvedNamespace,
        routes: resolvedRoutes,
      });

      console.log(
        `[Registry] Successfully registered module: ${classConstructor.Name}`,
      );
    });
  };
}

// --- METHOD DECORATOR ---
export function Route(path: string) {
  return <This, Args extends unknown[], Return>(
    target: (...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (...args: Args) => Return>,
  ) => {
    // context.metadata ??= {};
    const meta = context.metadata as CustomMetadata;
    meta.routes ??= [];

    // Collect the method routes early
    meta.routes.push(path);

    return target;
  };
}
