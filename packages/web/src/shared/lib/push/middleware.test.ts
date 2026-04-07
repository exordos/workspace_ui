/**
 * Tests for the push notification middleware pipeline.
 *
 * Verifies that raw push envelopes are correctly decrypted, parsed,
 * validated, deduplicated, and filtered before reaching the app.
 * A broken pipeline could show garbled notifications, leak encrypted
 * content, or process the same message twice.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pushPipeline,
  installDefaultMiddlewares,
  decryptionMiddleware,
  parsingMiddleware,
  validationMiddleware,
  deduplicationMiddleware,
  type RawPushEnvelope,
  type PushMiddleware,
} from "./middleware";

function createEnvelope(data: Record<string, string> = {}): RawPushEnvelope {
  return {
    data: {
      event: "message",
      message_id: "42",
      sender_id: "1",
      sender_full_name: "Alice",
      content: "Hi",
      ...data,
    },
    transport: "mock",
    receivedAt: Date.now(),
  };
}

describe("PushPipeline", () => {
  afterEach(() => {
    pushPipeline.clear();
  });

  // The pipeline with no middlewares should return null (no parsing = no payload)
  it("returns null when no middlewares are installed", async () => {
    const result = await pushPipeline.process(createEnvelope());
    expect(result).toBeNull();
  });

  // Middlewares execute in order — first added, first called
  it("executes middlewares in order", async () => {
    const order: number[] = [];
    pushPipeline.use(async (_ctx, next) => {
      order.push(1);
      await next();
    });
    pushPipeline.use(async (_ctx, next) => {
      order.push(2);
      await next();
    });
    pushPipeline.use(async (_ctx, next) => {
      order.push(3);
      await next();
    });

    await pushPipeline.process(createEnvelope());
    expect(order).toEqual([1, 2, 3]);
  });

  // A middleware can abort the chain by setting dropped = true
  it("stops pipeline when middleware sets dropped", async () => {
    const spy = vi.fn();
    pushPipeline.use(async (ctx, _next) => {
      ctx.dropped = true;
      ctx.dropReason = "test";
      await Promise.resolve();
    });
    pushPipeline.use(async (_ctx, next) => {
      spy();
      await next();
    });

    const result = await pushPipeline.process(createEnvelope());
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  // Middleware errors should not crash the pipeline
  it("catches middleware errors gracefully", async () => {
    pushPipeline.use(() => {
      throw new Error("boom");
    });
    pushPipeline.use(parsingMiddleware);

    const result = await pushPipeline.process(createEnvelope());
    expect(result).toBeDefined();
  });

  // remove() should take a middleware out of the pipeline
  it("allows removing middlewares", async () => {
    const spy = vi.fn();
    const mw: PushMiddleware = async (_ctx, next) => {
      spy();
      await next();
    };
    pushPipeline.use(mw);
    pushPipeline.remove(mw);

    await pushPipeline.process(createEnvelope());
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("parsingMiddleware", () => {
  afterEach(() => pushPipeline.clear());

  // Standard Zulip "message" event should parse all fields correctly
  it("parses message event", async () => {
    pushPipeline.use(parsingMiddleware);
    const result = await pushPipeline.process(
      createEnvelope({
        event: "message",
        message_id: "123",
        sender_id: "42",
        sender_full_name: "Bob",
        content: "Hello world",
        message_type: "stream",
        stream_name: "general",
        topic: "greetings",
      }),
    );

    expect(result?.event).toBe("message");
    expect(result?.message?.id).toBe(123);
    expect(result?.message?.sender_full_name).toBe("Bob");
    expect(result?.message?.stream_name).toBe("general");
  });

  // "remove" events carry message IDs to dismiss notifications
  it("parses remove event", async () => {
    pushPipeline.use(parsingMiddleware);
    const result = await pushPipeline.process(
      createEnvelope({
        event: "remove",
        message_ids: "[1, 2, 3]",
      }),
    );

    expect(result?.event).toBe("remove");
    expect(result?.message_ids).toEqual([1, 2, 3]);
  });

  // "test" events verify push is working — no message data needed
  it("parses test event", async () => {
    pushPipeline.use(parsingMiddleware);
    const result = await pushPipeline.process(
      createEnvelope({
        event: "test",
        realm_uri: "https://zulip.example.com",
      }),
    );

    expect(result?.event).toBe("test");
    expect(result?.realm_uri).toBe("https://zulip.example.com");
  });

  // Falls back to "message" when no event field is present
  it("defaults to message event", async () => {
    pushPipeline.use(parsingMiddleware);
    const result = await pushPipeline.process(
      createEnvelope({
        message_id: "99",
        sender_id: "1",
        content: "hi",
      }),
    );

    expect(result?.event).toBe("message");
  });
});

describe("validationMiddleware", () => {
  afterEach(() => pushPipeline.clear());

  // Messages without an id should be dropped — can't track or display them
  it("drops messages without id", async () => {
    pushPipeline.use(parsingMiddleware);
    pushPipeline.use(validationMiddleware);

    const result = await pushPipeline.process(
      createEnvelope({
        event: "message",
        message_id: "0",
        sender_id: "1",
      }),
    );

    expect(result).toBeNull();
  });

  // Valid messages should pass through
  it("passes valid messages", async () => {
    pushPipeline.use(parsingMiddleware);
    pushPipeline.use(validationMiddleware);

    const result = await pushPipeline.process(createEnvelope());
    expect(result).not.toBeNull();
  });
});

describe("deduplicationMiddleware", () => {
  afterEach(() => pushPipeline.clear());

  // Same message ID delivered twice should only produce one payload
  it("drops duplicate message IDs", async () => {
    pushPipeline.use(parsingMiddleware);
    pushPipeline.use(deduplicationMiddleware);

    const env = createEnvelope({ message_id: "555" });
    const first = await pushPipeline.process(env);
    const second = await pushPipeline.process(env);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  // Different IDs should both pass through
  it("allows different message IDs", async () => {
    pushPipeline.use(parsingMiddleware);
    pushPipeline.use(deduplicationMiddleware);

    const first = await pushPipeline.process(createEnvelope({ message_id: "100" }));
    const second = await pushPipeline.process(createEnvelope({ message_id: "101" }));

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
  });
});

describe("decryptionMiddleware", () => {
  afterEach(() => pushPipeline.clear());

  // Plaintext payloads (no encrypted_payload field) should pass through unchanged
  it("passes through plaintext payloads", async () => {
    pushPipeline.use(decryptionMiddleware);
    pushPipeline.use(parsingMiddleware);

    const result = await pushPipeline.process(createEnvelope());
    expect(result).not.toBeNull();
    expect(result?.event).toBe("message");
  });

  // Encrypted payloads without a known event field should be dropped until
  // decryption is implemented — prevents showing garbled content
  it("drops encrypted payloads that cannot be decrypted", async () => {
    pushPipeline.use(decryptionMiddleware);
    pushPipeline.use(parsingMiddleware);

    const result = await pushPipeline.process({
      data: { encrypted_payload: "base64data==", encryption_scheme: "aes-256-gcm" },
      transport: "fcm",
      receivedAt: Date.now(),
    });

    expect(result).toBeNull();
  });

  // Encrypted payload that also has an event field (hybrid mode) should pass through
  it("passes encrypted payload with fallback event field", async () => {
    pushPipeline.use(decryptionMiddleware);
    pushPipeline.use(parsingMiddleware);

    const result = await pushPipeline.process(
      createEnvelope({
        encrypted_payload: "base64data==",
        encryption_scheme: "aes-256-gcm",
        event: "message",
        message_id: "42",
        sender_id: "1",
        content: "plaintext fallback",
      }),
    );

    expect(result).not.toBeNull();
  });
});

describe("installDefaultMiddlewares", () => {
  afterEach(() => pushPipeline.clear());

  // Full pipeline should decrypt → parse → validate → dedup in one pass
  it("installs 4 default middlewares in correct order", async () => {
    installDefaultMiddlewares();

    const result = await pushPipeline.process(
      createEnvelope({
        message_id: "999",
        sender_id: "5",
        sender_full_name: "Test",
        content: "Hello",
      }),
    );

    expect(result?.event).toBe("message");
    expect(result?.message?.id).toBe(999);
  });

  // Calling twice should reset, not double-stack
  it("is idempotent — calling twice does not double middlewares", async () => {
    installDefaultMiddlewares();
    installDefaultMiddlewares();

    const result = await pushPipeline.process(createEnvelope());
    expect(result).not.toBeNull();
  });
});

describe("custom middleware", () => {
  afterEach(() => pushPipeline.clear());

  // External code can add custom middleware (e.g., mute filter)
  it("allows inserting a custom filtering middleware", async () => {
    installDefaultMiddlewares();

    const muteFilter: PushMiddleware = async (ctx, next) => {
      if (ctx.payload?.message?.stream_name === "muted-channel") {
        ctx.dropped = true;
        ctx.dropReason = "Channel is muted";
        return;
      }
      await next();
    };

    pushPipeline.use(muteFilter);

    const muted = await pushPipeline.process(createEnvelope({ stream_name: "muted-channel" }));
    expect(muted).toBeNull();

    const normal = await pushPipeline.process(
      createEnvelope({ stream_name: "general", message_id: "200" }),
    );
    expect(normal).not.toBeNull();
  });
});
