import type { Config } from "../config.js";
import { fail } from "../utils/errors.js";
export interface PaymentDecision {
  provider: "simulation" | "portfolio-demo";
  status: "SUCCEEDED" | "FAILED";
  transactionId: string;
  amount: number;
}

export class SimulationPayments {
  constructor(private config: Config) {}
  authorize(
    orderId: string,
    amount: number,
    outcome: "success" | "failure",
  ): PaymentDecision {
    if (
      this.config.NODE_ENV === "production" ||
      this.config.ALLOW_SIMULATED_PAYMENTS !== "true"
    )
      fail(
        "PAYMENTS_DISABLED",
        "Payment processing has not been configured.",
        503,
      );
    return {
      provider: "simulation",
      status: outcome === "failure" ? "FAILED" : "SUCCEEDED",
      transactionId: `sim_${orderId}`,
      amount,
    };
  }
}
/** Real providers require a separate asynchronous intent/webhook + reconciliation workflow. */
export interface ProductionPaymentProvider {
  createIntent(input: {
    orderId: string;
    amount: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ providerId: string; redirectUrl: string }>;
  verifyWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<{
    providerId: string;
    status: "succeeded" | "failed";
    amount: number;
    currency: string;
  }>;
}

/** Public portfolio authorizer: no network, money, card data or admission rights. */
export class PortfolioDemoPayments {
  constructor(private config: Pick<Config, "APP_MODE">) {}
  authorize(
    orderId: string,
    amount: number,
    outcome: "success" | "failure",
  ): PaymentDecision {
    if (this.config.APP_MODE !== "portfolio")
      fail("PAYMENTS_DISABLED", "Portfolio demo mode is not enabled.", 503);
    return {
      provider: "portfolio-demo",
      status: outcome === "failure" ? "FAILED" : "SUCCEEDED",
      transactionId: `demo_${orderId}`,
      amount,
    };
  }
}
