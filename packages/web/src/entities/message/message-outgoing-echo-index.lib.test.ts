import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createMessage } from "~/test/factories";
import { buildSendingEchoKeyIndex } from "./message-outgoing-echo-index.lib";

describe("message-outgoing-echo-index", () => {
  it("maps echo key to message array index for sending rows", () => {
    const messages = [
      { ...createMessage({ id: -1 }), local_echo_key: -1, delivery_status: "sending" },
      { ...createMessage({ id: 5 }), delivery_status: "sent" },
      { ...createMessage({ id: -2 }), local_echo_key: -2, delivery_status: "sending" },
    ] as MockMessage[];
    const index = buildSendingEchoKeyIndex(messages);
    expect(index.get(-1)).toBe(0);
    expect(index.get(-2)).toBe(2);
    expect(index.has(5)).toBe(false);
  });
});
