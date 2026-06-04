/**
 * Push notification middleware pipeline.
 *
 * Sits between the raw push payload (from FCM / APNs / WebPush) and the
 * final PushMessagePayload consumed by the app. Each middleware can
 * inspect, transform, decrypt, validate, filter, or enrich the payload.
 *
 * Architecture:
 *
 *   Raw FCM payload
 *     → [decryption middleware]     — decrypt E2EE payload (Zulip 11+)
 *     → [validation middleware]     — reject malformed / spoofed payloads
 *     → [deduplication middleware]  — drop already-processed message IDs
 *     → [enrichment middleware]     — resolve sender name / avatar from store
 *     → [filtering middleware]      — honor mute settings, DND mode
 *     → PushMessagePayload (clean, trusted, ready to display)
 *
 * The pipeline is provider-agnostic: works with FCM, APNs relay, WebPush,
 * or any future push transport. The decryption middleware is a placeholder
 * until the backend encryption scheme is decided.
 *
 * Usage:
 *   import { pushPipeline } from "~/shared/lib/push/middleware";
 *
 *   pushPipeline.use(decryptionMiddleware);
 *   pushPipeline.use(validationMiddleware);
 *
 *   const result = await pushPipeline.process(rawPayload);
 *   if (result) showNotification(result);
 */

import { createLogger } from "../logger";
import { buildPushPayloadFromEnvelopeData } from "./push-payload-parse.lib";
import { isValidPushMessagePayload } from "./push-payload-validate.lib";
import type { PushMessagePayload } from "./types";

const log = createLogger("push:middleware");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Raw push data as received from the transport (FCM, WebPush, etc.).
 * This is the unprocessed envelope — may be encrypted, encoded, or partial.
 */
export interface RawPushEnvelope {
  /** Raw key-value data from the push payload. */
  data: Record<string, string>;
  /** Optional notification field (FCM display notification). */
  notification?: { title?: string; body?: string; image?: string };
  /** Push transport that delivered this message. */
  transport: "fcm" | "apns" | "webpush" | "electron" | "mock";
  /** When the push was received (local timestamp). */
  receivedAt: number;
}

/**
 * Context passed through the middleware chain.
 * Middlewares can read/write to this object.
 */
export interface PushMiddlewareContext {
  /** The raw envelope (read-only after creation). */
  readonly envelope: RawPushEnvelope;
  /** The parsed payload (starts null, set by parsing middleware). */
  payload: PushMessagePayload | null;
  /** Set to true by any middleware to abort the pipeline (e.g., filtered out). */
  dropped: boolean;
  /** Reason for dropping (for logging). */
  dropReason?: string;
  /** Metadata attached by middlewares (e.g., decryption info). */
  meta: Record<string, unknown>;
}

/**
 * A single middleware in the push processing pipeline.
 *
 * Receives the context and a `next` function to call the rest of the chain.
 * Can modify `ctx.payload`, set `ctx.dropped = true`, or add to `ctx.meta`.
 */
export type PushMiddleware = (
  ctx: PushMiddlewareContext,
  next: () => Promise<void>,
) => Promise<void>;

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

class PushPipeline {
  private middlewares: PushMiddleware[] = [];

  /**
   * Add a middleware to the end of the pipeline.
   * Middlewares execute in the order they were added.
   */
  use(mw: PushMiddleware): void {
    this.middlewares.push(mw);
  }

  /**
   * Remove a middleware from the pipeline.
   */
  remove(mw: PushMiddleware): void {
    const idx = this.middlewares.indexOf(mw);
    if (idx >= 0) this.middlewares.splice(idx, 1);
  }

  /**
   * Reset the pipeline (remove all middlewares).
   */
  clear(): void {
    this.middlewares = [];
  }

  /**
   * Process a raw push envelope through all middlewares.
   * Returns the final PushMessagePayload, or null if dropped.
   */
  async process(envelope: RawPushEnvelope): Promise<PushMessagePayload | null> {
    const ctx: PushMiddlewareContext = {
      envelope,
      payload: null,
      dropped: false,
      meta: {},
    };

    const chain = [...this.middlewares];
    let index = 0;

    const next = async (): Promise<void> => {
      if (ctx.dropped || index >= chain.length) return;
      const mw = chain[index++]!;
      try {
        await mw(ctx, next);
      } catch (err) {
        log.error("Push middleware error", {
          index: index - 1,
          error: String(err),
        });
      }
    };

    await next();

    if (ctx.dropped) {
      log.info("Push message dropped", { reason: ctx.dropReason });
      return null;
    }

    return ctx.payload;
  }
}

export const pushPipeline = new PushPipeline();

// ---------------------------------------------------------------------------
// Built-in middlewares
// ---------------------------------------------------------------------------

/**
 * Decryption middleware — placeholder for E2EE push payloads.
 *
 * Zulip 11+ can send encrypted push notifications. The encryption scheme
 * and key exchange mechanism are TBD. This middleware slot is where
 * decryption will happen.
 *
 * Current behavior: passes through unchanged (assumes plaintext).
 * When backend is ready: decrypt `ctx.envelope.data.encrypted_payload`
 * using the device's push encryption key.
 */
export const decryptionMiddleware: PushMiddleware = async (ctx, next) => {
  const data = ctx.envelope.data;

  if (data.encrypted_payload) {
    const scheme = data.encryption_scheme ?? "unknown";
    log.info("Encrypted push received", { scheme });

    ctx.meta.encrypted = true;
    ctx.meta.encryptionScheme = scheme;

    // When backend is ready, implement decryption here:
    // const decrypted = await decrypt(data.encrypted_payload, scheme);
    // ctx.envelope = { ...ctx.envelope, data: decrypted };

    // For now: if we can't decrypt, drop the message
    if (!data.event && !data.type) {
      ctx.dropped = true;
      ctx.dropReason = `Cannot decrypt push (scheme: ${scheme}) — decryption not yet implemented`;
      return;
    }
  }

  await next();
};

/**
 * Parsing middleware — converts raw data fields into PushMessagePayload.
 * This is the default parser for Zulip-format push payloads.
 */
export const parsingMiddleware: PushMiddleware = async (ctx, next) => {
  if (ctx.payload) {
    await next();
    return;
  }

  ctx.payload = buildPushPayloadFromEnvelopeData(
    ctx.envelope.data,
    ctx.envelope.notification?.body,
  );

  await next();
};

/**
 * Validation middleware — rejects malformed or suspicious payloads.
 */
export const validationMiddleware: PushMiddleware = async (ctx, next) => {
  if (!ctx.payload) {
    ctx.dropped = true;
    ctx.dropReason = "No payload after parsing";
    return;
  }

  if (!isValidPushMessagePayload(ctx.payload)) {
    ctx.dropped = true;
    ctx.dropReason = "Invalid push payload";
    return;
  }

  await next();
};

/**
 * Deduplication middleware — drops push messages that were already processed.
 * Keeps a sliding window of recent message IDs.
 */
const DEDUP_WINDOW = 200;
const recentIds = new Set<number>();
const recentIdQueue: number[] = [];

export const deduplicationMiddleware: PushMiddleware = async (ctx, next) => {
  if (ctx.payload?.event === "message" && ctx.payload.message) {
    const id = ctx.payload.message.id;
    if (recentIds.has(id)) {
      ctx.dropped = true;
      ctx.dropReason = `Duplicate message ID: ${id}`;
      return;
    }

    recentIds.add(id);
    recentIdQueue.push(id);

    if (recentIdQueue.length > DEDUP_WINDOW) {
      const old = recentIdQueue.shift()!;
      recentIds.delete(old);
    }
  }

  await next();
};

// ---------------------------------------------------------------------------
// Default pipeline setup
// ---------------------------------------------------------------------------

/**
 * Install the default middleware stack.
 * Call once during push initialization.
 */
export function installDefaultMiddlewares(): void {
  pushPipeline.clear();
  pushPipeline.use(decryptionMiddleware);
  pushPipeline.use(parsingMiddleware);
  pushPipeline.use(validationMiddleware);
  pushPipeline.use(deduplicationMiddleware);
}
