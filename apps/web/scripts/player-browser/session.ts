import { createHash } from "node:crypto";
import {
  parseRequest,
  ProtocolError,
  sanitize,
  type Frame,
  type Input,
  type Reply,
} from "./protocol";

export type Audit = (event: Record<string, unknown>) => Promise<void>;
export type Driver = {
  capture(): Promise<Frame>;
  perform(input: Input): Promise<void>;
  close(): Promise<void>;
};
/** No gameplay loop. Every mutation requires an operator's receipt for the latest image. */
export class PlayerSession {
  private frame?: Frame;
  private busy = false;
  private closed = false;
  private interrupted = false;
  private lastContact: number;
  private gapRecorded = false;
  private readonly consumed = new Map<string, string>();
  constructor(
    private readonly driver: Driver,
    private readonly audit: Audit,
    private readonly now: () => number = Date.now,
  ) {
    this.lastContact = now();
  }
  private reply(
    code: string,
    input: Reply["input"] = "not-sent",
    frame?: Frame,
    message?: string,
  ): Reply {
    return {
      code,
      input,
      interrupted: this.interrupted,
      ...(frame ? { frame } : {}),
      ...(message ? { message } : {}),
    };
  }
  async noteIdle(): Promise<void> {
    const gapMs = this.now() - this.lastContact;
    if (!this.closed && !this.gapRecorded && gapMs > 30_000) {
      this.interrupted = true;
      this.gapRecorded = true;
      await this.audit({
        event: "OPERATOR_GAP",
        at: this.now(),
        gapMs,
        coverage: "unobserved; not a completed playtest",
      });
    }
  }
  async shutdown(): Promise<void> {
    if (this.closed) return;
    this.frame = undefined;
    await this.driver.close();
    this.closed = true;
    await this.audit({ event: "BROWSER_CLOSED", at: this.now(), roomLeaveVerified: false });
  }
  private async capture(): Promise<Frame> {
    this.frame = undefined; // A failed screenshot must not leave an old image usable for input.
    const frame = await this.driver.capture();
    const bytes = Buffer.from(frame.image.data, "base64");
    if (!bytes.length || createHash("sha256").update(bytes).digest("hex") !== frame.sha256) {
      throw new ProtocolError("IMAGE_INTEGRITY_FAILED", "Image bytes and hash differ");
    }
    this.frame = frame;
    await this.audit({
      event: "FRAME_CAPTURED",
      at: this.now(),
      frameId: frame.id,
      sha256: frame.sha256,
      bytes: bytes.length,
    });
    return frame;
  }
  async handle(raw: unknown): Promise<Reply> {
    let request;
    try {
      request = parseRequest(raw);
    } catch (error) {
      return this.reply("INVALID_REQUEST", "not-sent", undefined, sanitize(String(error)));
    }
    if (this.busy)
      return this.reply(
        "SESSION_BUSY",
        "not-sent",
        undefined,
        "No action was queued; observe before another input",
      );
    if (this.closed) return this.reply("SESSION_CLOSED");
    this.busy = true;
    let outcome: Reply["input"] = "not-sent";
    try {
      await this.noteIdle();
      if (request.kind === "status") return this.reply("SESSION_OPEN");
      this.lastContact = this.now();
      this.gapRecorded = false;
      if (request.kind === "close") {
        await this.shutdown();
        return this.reply("SESSION_CLOSED");
      }
      if (request.kind === "observe")
        return this.reply("OBSERVE_IMAGE", "not-sent", await this.capture());
      if (request.kind !== "act") return this.reply("INVALID_REQUEST");
      const digest = createHash("sha256").update(JSON.stringify(request)).digest("hex");
      if (this.consumed.has(request.requestId)) {
        return this.reply(
          this.consumed.get(request.requestId) === digest
            ? "INPUT_ALREADY_ATTEMPTED"
            : "REQUEST_ID_CONFLICT",
          "not-sent",
          undefined,
          "Never automatically replay an input; observe the live screen",
        );
      }
      if (
        !this.frame ||
        request.seen.frameId !== this.frame.id ||
        request.seen.sha256 !== this.frame.sha256
      ) {
        return this.reply(
          "IMAGE_RECEIPT_REQUIRED",
          "not-sent",
          undefined,
          "Receive and view the latest image, not just its filename or text",
        );
      }
      // Elapsed time and displayed game timers never reject operator input.
      // The latest-image receipt and duplicate request protection still apply.
      // The receipt is an operator declaration, not a claim that software can prove visual perception.
      await this.audit({
        event: "OPERATOR_OBSERVED",
        at: this.now(),
        frameId: this.frame.id,
        frameAgeMs: Math.max(0, this.now() - this.frame.capturedAt),
        observation: sanitize(request.seen.observation),
      });
      await this.audit({
        event: "INPUT_STARTED",
        at: this.now(),
        requestId: request.requestId,
        kind: request.input.kind,
      });
      this.consumed.set(request.requestId, digest);
      this.frame = undefined;
      outcome = "uncertain";
      let inputError: unknown;
      try {
        await this.driver.perform(request.input);
        outcome = "sent";
      } catch (error) {
        inputError = error;
        this.interrupted = true;
      }
      await this.audit({
        event: "INPUT_FINISHED",
        at: this.now(),
        requestId: request.requestId,
        outcome,
        ...(inputError
          ? { errorName: inputError instanceof Error ? inputError.name : "UnknownError" }
          : {}),
      });
      const frame = await this.capture(); // Also capture after a failed/uncertain action; do not auto-retry it.
      return this.reply(
        inputError ? "INPUT_UNCERTAIN" : "OBSERVE_IMAGE",
        outcome,
        frame,
        inputError
          ? "Input may have arrived. Inspect the returned image; do not replay blindly."
          : undefined,
      );
    } catch (error) {
      this.frame = undefined;
      this.interrupted = true;
      const code = error instanceof ProtocolError ? error.code : "CAPTURE_OR_TRANSPORT_FAILED";
      await this.audit({
        event: code,
        at: this.now(),
        outcome,
        error: sanitize(String(error)).slice(0, 1000),
      }).catch(() => {});
      return this.reply(
        code,
        outcome,
        undefined,
        "No usable image receipt. Observe again; input is not automatically retried.",
      );
    } finally {
      this.busy = false;
    }
  }
}
