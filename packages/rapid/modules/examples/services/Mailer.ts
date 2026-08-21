/**
 * Outbound mail — `@Vial` service that RECORDS instead of sending, so the
 * example (and its tests) can assert on what would have gone out. A real
 * app swaps this for an SMTP/API client; tests swap it for a fake with
 * `Doctor.stock(Mailer, fake)`.
 * @module
 */
import { Vial } from '@tundralibs/doctor';

export type Mail = { to: string; subject: string };

@Vial('SINGLETON')
export class Mailer {
  readonly sent: Mail[] = [];
  send(to: string, subject: string): void {
    this.sent.push({ to, subject });
  }
}
