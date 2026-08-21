// Probe: can @Dose/@Inoculate be reimplemented as TC39 standard decorators
// with an explicit token (no reflect-metadata / design:type)? And once
// TC39-native, is @Inoculate even still needed, or can a field decorator
// inject itself via its returned initializer?
import { inject, Vial } from '@tundralibs/doctor';

// --- TC39 field decorator version of @Dose, explicit token ---
function DoseTC39<This, V>(token: string, scope?: string) {
  return function (
    _initialValue: V | undefined,
    context: ClassFieldDecoratorContext<This, V>,
  ) {
    if (context.kind !== 'field') {
      throw new Error('@Dose can only decorate class fields');
    }
    // Returned initializer runs at field-init time (effectively
    // constructor-start), no separate @Inoculate wrapper needed.
    return function (this: This): V {
      return inject(token as never, scope) as V;
    };
  };
}

@Vial('SINGLETON')
class Logger {
  log(msg: string) {
    console.log(`[Logger] ${msg}`);
  }
}

declare module '@tundralibs/doctor' {
  interface VialRegistry {
    Logger: Logger;
  }
}

class Handler {
  @DoseTC39<Handler, Logger>('Logger')
  logger!: Logger;

  run() {
    this.logger.log('via plain field');
  }
}

const h = new Handler();
console.log('logger is Logger instance:', h.logger instanceof Logger);
h.run();
console.log('OK — TC39 field-decorator injection works with NO @Inoculate.');

// --- does the scope argument actually vary per instance? ---
@Vial({ mode: 'SCOPED', factory: () => new Db(`conn-${Math.random()}`) })
class Db {
  constructor(public connString: string) {}
}
declare module '@tundralibs/doctor' {
  interface VialRegistry {
    Db: Db;
  }
}

class RequestHandler {
  // The scope string here is written ONCE, when the class is defined —
  // not re-evaluated per `new RequestHandler()` call.
  @DoseTC39<RequestHandler, Db>('Db', 'fixed-scope-name')
  db!: Db;
}

const r1 = new RequestHandler();
const r2 = new RequestHandler();
console.log(
  'two DIFFERENT instances share the SAME scoped Db (decoration-time scope is a constant):',
  r1.db === r2.db,
);
