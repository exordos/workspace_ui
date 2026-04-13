import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { outgoingEchoContentMatches } from "./message-outgoing-echo.lib";

function msg(partial: Partial<MockMessage>): MockMessage {
  return {
    id: 1,
    sender_id: 10,
    sender_full_name: "A",
    stream_id: null,
    subject: "",
    content: "",
    timestamp: 0,
    ...partial,
  };
}

describe("outgoingEchoContentMatches", () => {
  it("matches plain text to equivalent HTML paragraph", () => {
    expect(
      outgoingEchoContentMatches(msg({ content: "hello" }), msg({ content: "<p>hello</p>" })),
    ).toBe(true);
  });

  it("normalizes whitespace", () => {
    expect(
      outgoingEchoContentMatches(msg({ content: "a  b" }), msg({ content: "<p>a\n\tb</p>" })),
    ).toBe(true);
  });

  it("returns false for different bodies", () => {
    expect(
      outgoingEchoContentMatches(msg({ content: "one" }), msg({ content: "<p>two</p>" })),
    ).toBe(false);
  });
});
