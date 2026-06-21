import { describe, expect, it } from "vitest";
import { buildMessengerMessageSendBody } from "./messenger-message-send.internal";

describe("buildMessengerMessageSendBody", () => {
  it("builds the gateway native message body", () => {
    expect(
      buildMessengerMessageSendBody({
        streamUuid: "22222222-2222-4222-8222-222222222222",
        content: "hello",
      }),
    ).toEqual({
      stream_uuid: "22222222-2222-4222-8222-222222222222",
      payload: {
        kind: "markdown",
        content: "hello",
      },
    });
  });
});
