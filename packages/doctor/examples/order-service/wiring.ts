/**
 * Boot-time wiring, in one place: stock the ready-made values under
 * their labels, prescribe the one class that needs constructor
 * arguments, make sure every `@Vial` class has been loaded (it registers
 * at class definition), then `checkup()` so a missing registration fails
 * HERE and not inside the first request.
 * @module
 */
import { Doctor } from '../../mod.ts';
import { PaymentGateway } from './PaymentGateway.ts';
import {
  CLOCK,
  type Clock,
  CONFIG,
  REVIEWER,
  type ServiceConfig,
} from './tokens.ts';
// Side-effect imports: a @Vial class exists for Doctor once its module ran.
import './Logger.ts';
import './Connection.ts';
import './OrderRepository.ts';
import './AuditTrail.ts';
import './OrderService.ts';

export type WireOptions = {
  reviews?: boolean;
  /** A fake clock for tests — stocked under the same label. */
  clock?: Clock;
  /** A fake gateway for tests — stocked under the CLASS token. */
  gateway?: PaymentGateway;
};

export function wire(config: ServiceConfig, options: WireOptions = {}): number {
  Doctor.stock(CONFIG, config);
  Doctor.stock(CLOCK, options.clock ?? { now: () => new Date() });
  // Fakes go in HERE, before checkup(): a singleton captures what it
  // injects when it is built — swapping an entry afterwards changes
  // nothing for instances that already exist.
  if (options.gateway !== undefined) {
    Doctor.stock(PaymentGateway, options.gateway);
  } else {
    Doctor.prescribe(PaymentGateway, {
      mode: 'SINGLETON',
      factory: () => new PaymentGateway(config.paymentApiKey),
    });
  }
  if (options.reviews) {
    Doctor.stock(REVIEWER, {
      flag: (orderId, amount) =>
        console.log(`  ! review ${orderId} (${amount})`),
    });
  }
  // Builds every SINGLETON now — the counterweight to lazy getters.
  return Doctor.checkup();
}
