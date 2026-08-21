/**
 * A class that needs constructor ARGUMENTS, so Doctor cannot `new` it
 * bare: `wiring.ts` prescribes it with a factory. Tests swap it for a
 * fake with `Doctor.revoke(PaymentGateway)` + `Doctor.stock(PaymentGateway, fake)`.
 * @module
 */
export class PaymentGateway {
  readonly charges: { orderId: string; amount: number }[] = [];
  constructor(private readonly apiKey: string) {}
  charge(orderId: string, amount: number): { ok: boolean; ref: string } {
    if (this.apiKey === '') return { ok: false, ref: '' };
    this.charges.push({ orderId, amount });
    return { ok: true, ref: `ch_${this.charges.length}` };
  }
}
