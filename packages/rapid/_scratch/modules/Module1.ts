import { Module, Route } from '../decorators/mod.ts';

abstract class BaseModule {
  public abstract _init(): void | Promise<void>;
}

@Module({ namespace: 'Auth' })
export class AuthModule extends BaseModule {
  public static readonly Name: string = 'AuthModule';

  constructor() {
    super();
  }

  @Route('/login')
  login() {}

  @Route('/logout')
  logout() {}

  public override _init(): void {
    console.log('Auth System Started.');
  }
}
