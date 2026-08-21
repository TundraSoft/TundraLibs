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
  /** Simulated I/O: the mail is "sent" on a later tick, like a real client. */
  async send(to: string, subject: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1));
    this.sent.push({ to, subject });
  }
}
