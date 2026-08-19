// Probe: does doctor's @Vial + inject() (the needle-di / constructor-default
// pattern) coexist with rAPId's TC39-only @Module/@GET on the same class,
// in the same compilation, and actually resolve at runtime?
import { Doctor, inject, Vial } from '@tundralibs/doctor';
import { GET } from '../decorators/http.ts';
import { Module } from '../decorators/module.ts';

@Vial('SINGLETON')
class Logger {
  log(msg: string) {
    console.log(`[Logger] ${msg}`);
  }
}

@Vial({ mode: 'SCOPED', factory: () => new Db(`conn-${Math.random()}`) })
class Db {
  constructor(public connString: string) {}
}

declare module '@tundralibs/doctor' {
  interface VialRegistry {
    Logger: Logger;
    Db: Db;
  }
}

@Module({ prefix: '/users' })
class UsersModule {
  constructor(
    private readonly logger = inject('Logger'),
    private readonly db = inject('Db', 'per-request-scope-A'),
  ) {}

  @GET('/')
  list() {
    this.logger.log(`listing users via ${this.db.connString}`);
    return { status: 200 } as never;
  }
}

// --- runtime proof ---
const instance = new UsersModule();
console.log('logger is Logger instance:', instance['logger'] instanceof Logger);
console.log('db connString:', instance['db'].connString);

const instance2 = new UsersModule();
console.log(
  'logger SINGLETON identity preserved:',
  instance['logger'] === instance2['logger'],
);
console.log(
  'db SCOPED identity preserved within same scope:',
  instance['db'] === instance2['db'],
);

const otherScope = new (class {
  constructor(private db = inject('Db', 'per-request-scope-B')) {}
  get() {
    return this.db;
  }
})();
console.log(
  'db SCOPED isolated across scopes:',
  otherScope.get() !== instance['db'],
);

console.log('Doctor.knows(Logger):', Doctor.knows(Logger));
console.log('OK — probe completed without throwing.');
