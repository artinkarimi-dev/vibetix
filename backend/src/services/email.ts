import { constants } from "node:fs";
import { mkdir, open, lstat } from "node:fs/promises";
import { resolve } from "node:path";
export interface EmailMessage {
  idempotencyKey: string;
  orderId: string;
  to: string;
  subject: string;
}
export interface EmailTransport {
  deliver(message: EmailMessage): Promise<"LOCAL_CAPTURED" | "DEMO_RECORDED">;
}
export class LocalEmailTransport implements EmailTransport {
  constructor(private directory = resolve("artifacts/local-emails")) {}
  async deliver(message: EmailMessage) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        message.orderId,
      )
    )
      throw new Error("Invalid local email identifier.");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const directory = await lstat(this.directory);
    if (!directory.isDirectory() || directory.isSymbolicLink())
      throw new Error("Unsafe local email directory.");
    const file = await open(
      resolve(this.directory, `${message.orderId}.json`),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_TRUNC |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.chmod(0o600);
      await file.writeFile(
        JSON.stringify({
          ...message,
          notice: "Local capture only; no email sent.",
        }),
      );
    } finally {
      await file.close();
    }
    return "LOCAL_CAPTURED" as const;
  }
}

/** Explicit public-demo sink. No contact data is written or transmitted. */
export class DemoEmailTransport implements EmailTransport {
  deliver(_message: EmailMessage): Promise<"DEMO_RECORDED"> {
    return Promise.resolve("DEMO_RECORDED");
  }
}
