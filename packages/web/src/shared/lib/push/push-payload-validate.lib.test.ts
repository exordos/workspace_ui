import { describe, expect, it } from "vitest";
import {
  isValidPushEnvelopeData,
  isValidPushMessagePayload,
  resolvePushEventType,
} from "./push-payload-validate.lib";
import type { PushMessagePayload } from "./types";

describe("push-payload-validate", () => {
  it("resolvePushEventType defaults to message", () => {
    expect(resolvePushEventType({})).toBe("message");
    expect(resolvePushEventType({ event: "remove" })).toBe("remove");
  });

  it("isValidPushEnvelopeData rejects message without ids", () => {
    expect(isValidPushEnvelopeData({ message_id: "0", sender_id: "1" })).toBe(false);
    expect(isValidPushEnvelopeData({ message_id: "10", sender_id: "2" })).toBe(true);
  });

  it("isValidPushEnvelopeData rejects undecryptable encrypted payload", () => {
    expect(isValidPushEnvelopeData({ encrypted_payload: "x" })).toBe(false);
  });

  it("isValidPushMessagePayload validates parsed payload", () => {
    const payload: PushMessagePayload = {
      event: "message",
      message: {
        id: 1,
        sender_id: 2,
        sender_full_name: "Alice",
        type: "stream",
        content: "hi",
        timestamp: 1,
      },
    };
    expect(isValidPushMessagePayload(payload)).toBe(true);
  });
});
