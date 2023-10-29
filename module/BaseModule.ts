import { compareSpecs } from 'https://deno.land/std@0.193.0/http/_negotiation/common.ts';

type APPState = {
  name: string;
  session?: {
    token: string;
  };
};

type Provides = {
  [name: string]: () => void;
};

const ep: { [name: string]: BaseModule } = {};
function EndpointManager(
  path: string,
  method: string,
  contentType: string,
  args: string[],
) {
  return function (
    target: BaseModule,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    console.log(
      `${target.walkIdent()} - ${propertyKey} - ${descriptor} - ${args}`,
    );
    console.log(`${path} - ${method} - ${contentType}`);
    if (ep[path]) {
      console.log('Yes');
    }
    ep[path] = target;
  };
}

class ModuleManager {
  private modules: BaseModule[] = [];
  private provides: Provides = {};
  protected static instance: ModuleManager;
  private constructor() {}
  public static getInstance(): ModuleManager {
    if (!ModuleManager.instance) {
      ModuleManager.instance = new ModuleManager();
    }
    return ModuleManager.instance;
  }
}

export abstract class BaseModule<P extends Provides = Provides> {
  protected provides: P = {} as P;
  declare protected _name: string;

  constructor() {
    this.do();
  }

  do() {
    console.log(this._name);
  }
  walkIdent() {
    return this._name;
  }
}

class CustomerModule extends BaseModule {
  protected _name = 'CustomerModule';
}

class UserModule extends BaseModule<{ registration: () => void }> {
  protected _name = 'UserModule';
  protected provides = {
    registration: () => {},
  };
  constructor() {
    super();
  }

  @EndpointManager('/register', 'POST', 'application/json', ['a', 'b']) // '/register', 'POST', 'application/json
  register(state: APPState, userName: string, password: string) {
    this.provides.registration();
  }
}

const a = new UserModule();
const ab = new UserModule();
const b = new CustomerModule();
a.do();
console.log(ep);
