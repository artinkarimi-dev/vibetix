import type { Database } from "../database/client.js";
import type { Order } from "../../../packages/shared/src/index.js";
import type { EmailTransport } from "./email.js";
export interface JobRunner {
  runOnce(): Promise<number>;
}
export class OutboxRunner implements JobRunner {
  constructor(
    private db: Database,
    private transport: EmailTransport,
    private observe: (
      event: "job_processed" | "job_retry" | "job_failed",
    ) => void = () => {},
  ) {}
  async runOnce() {
    let outcome: "job_processed" | "job_retry" | "job_failed" | undefined;
    const count = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; orderId: string }[]
      >`SELECT id,"orderId" FROM "OutboxJob" WHERE status='PENDING' AND "availableAt"<=(clock_timestamp() AT TIME ZONE 'UTC') ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
      const job = rows[0];
      if (!job) return 0;
      const order = await tx.order.findUniqueOrThrow({
        where: { id: job.orderId },
      });
      const snapshot = order.snapshot as unknown as Order;
      try {
        const status = await this.transport.deliver({
          idempotencyKey: job.id,
          orderId: order.id,
          to: snapshot.attendee.email,
          subject: "Your VIBETIX booking (simulated payment)",
        });
        await tx.outboxJob.update({
          where: { id: job.id },
          data: { status, attempts: { increment: 1 }, lastError: null },
        });
        outcome = "job_processed";
      } catch {
        const current = await tx.outboxJob.findUniqueOrThrow({
          where: { id: job.id },
        });
        await tx.outboxJob.update({
          where: { id: job.id },
          data: {
            status: current.attempts >= 9 ? "FAILED" : "PENDING",
            attempts: { increment: 1 },
            lastError: "TRANSPORT_FAILURE",
            availableAt: new Date(
              Date.now() + Math.min(3600000, 1000 * 2 ** current.attempts),
            ),
          },
        });
        outcome = current.attempts >= 9 ? "job_failed" : "job_retry";
      }
      return 1;
    });
    if (outcome) this.observe(outcome);
    return count;
  }
}
