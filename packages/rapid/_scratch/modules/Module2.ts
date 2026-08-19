import { Module, Route } from '../decorators/mod.ts';

abstract class BaseModule {
  public abstract _init(): void | Promise<void>;
}

@Module({ namespace: "Billing" })
export class PaymentModule extends BaseModule {
  public static readonly Name: string = "PaymentModule";

  constructor() { super(); }

  @Route("/checkout")
  checkout() {}

  public override _init(): void {
    console.log("Payment Gateway Running.");
  }
}
