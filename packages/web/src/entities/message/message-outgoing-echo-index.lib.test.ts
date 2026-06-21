import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/messenger.types";
import { createMessage, testMessageId } from "~/test/factories";
import { buildSendingEchoKeyIndex } from "./message-outgoing-echo-index.lib";

describe("message-outgoing-echo-index", () => {
  it("maps echo key to message array index for sending rows", () => {
    const echoKey1 = testMessageId(900001);
    const echoKey2 = testMessageId(900002);
    const messages = [
      { ...createMessage({ id: echoKey1 }), local_echo_key: echoKey1, delivery_status: "sending" },
      { ...createMessage({ id: 5 }), delivery_status: "sent" },
      { ...createMessage({ id: echoKey2 }), local_echo_key: echoKey2, delivery_status: "sending" },
    ] as MockMessage[];
    const index = buildSendingEchoKeyIndex(messages);
    expect(index.get(echoKey1)).toBe(0);
    expect(index.get(echoKey2)).toBe(2);
    expect(index.has(testMessageId(5))).toBe(false);
  });
});
