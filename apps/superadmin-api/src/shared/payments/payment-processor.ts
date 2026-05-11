import { Injectable, Logger } from "@nestjs/common";

/**
 * Single seam between the platform and the underlying payment
 * processor (Stripe). The mock implementation in this file mirrors
 * the shape of Stripe's PaymentIntent + Refund APIs so a real
 * Stripe swap is a one-class replacement, not a controller rewrite.
 *
 * Real Stripe wiring follow-up:
 *   - replace `MockPaymentProcessor` with `StripePaymentProcessor`
 *     that calls `stripe.paymentIntents.create / confirm` and
 *     `stripe.refunds.create`
 *   - keep this interface unchanged
 *   - register the provider switch in finance.module.ts based on
 *     `process.env.STRIPE_SECRET_KEY` presence
 */
export interface ChargeIntent {
  amountCents: number;
  currency: string;
  description?: string;
  metadata?: Record<string, string>;
  /**
   * Optional opaque card token (e.g. Stripe payment_method id).
   * Mock impl ignores it. Real impl uses it as `payment_method`.
   */
  cardToken?: string;
  /**
   * For test environments: force a mock outcome.
   *   "succeeded" (default), "failed", "requires_action"
   */
  mockOutcome?: "succeeded" | "failed" | "requires_action";
}

export interface ChargeResult {
  intentId: string;
  status: "succeeded" | "failed" | "requires_action";
  amountCents: number;
  currency: string;
  failureCode?: string;
  failureMessage?: string;
}

export interface RefundIntent {
  /** Processor charge id (intentId from a prior succeeded charge). */
  chargeId: string;
  amountCents: number;
  reason?: string;
  metadata?: Record<string, string>;
  mockOutcome?: "succeeded" | "failed";
}

export interface RefundResult {
  refundId: string;
  status: "succeeded" | "failed";
  amountCents: number;
  failureMessage?: string;
}

export abstract class PaymentProcessor {
  abstract charge(intent: ChargeIntent): Promise<ChargeResult>;
  abstract refund(intent: RefundIntent): Promise<RefundResult>;
}

/**
 * Mock processor — succeeds by default, fails only when explicitly
 * requested via `mockOutcome: "failed"`. Used everywhere until
 * Stripe credentials are wired.
 */
@Injectable()
export class MockPaymentProcessor extends PaymentProcessor {
  private readonly log = new Logger(MockPaymentProcessor.name);

  async charge(intent: ChargeIntent): Promise<ChargeResult> {
    const status = intent.mockOutcome ?? "succeeded";
    const id = `mock_pi_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    this.log.debug(
      `mock charge ${intent.amountCents} ${intent.currency} → ${status}`
    );
    if (status === "failed") {
      return {
        intentId: id,
        status: "failed",
        amountCents: intent.amountCents,
        currency: intent.currency,
        failureCode: "card_declined",
        failureMessage:
          "Your card was declined. (mock) Update card and retry."
      };
    }
    if (status === "requires_action") {
      return {
        intentId: id,
        status: "requires_action",
        amountCents: intent.amountCents,
        currency: intent.currency
      };
    }
    return {
      intentId: id,
      status: "succeeded",
      amountCents: intent.amountCents,
      currency: intent.currency
    };
  }

  async refund(intent: RefundIntent): Promise<RefundResult> {
    const status = intent.mockOutcome ?? "succeeded";
    const id = `mock_re_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    this.log.debug(
      `mock refund ${intent.amountCents} on ${intent.chargeId} → ${status}`
    );
    if (status === "failed") {
      return {
        refundId: id,
        status: "failed",
        amountCents: intent.amountCents,
        failureMessage: "Refund declined by issuer (mock)."
      };
    }
    return {
      refundId: id,
      status: "succeeded",
      amountCents: intent.amountCents
    };
  }
}

/** DI token — keeps controllers depending on the abstract class. */
export const PAYMENT_PROCESSOR = PaymentProcessor;
