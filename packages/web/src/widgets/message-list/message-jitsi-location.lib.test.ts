import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { formatJitsiRoomDisplayName, resolveJitsiLocationName } from "./message-jitsi-location.lib";

function createMessage(overrides: Partial<MockMessage>): MockMessage {
  return {
    id: 1,
    sender_id: 10,
    sender_full_name: "Alice",
    stream_id: null,
    subject: "",
    content: "",
    timestamp: 1,
    ...overrides,
  };
}

describe("message-jitsi-location", () => {
  it("formats Jitsi room display name from URL", () => {
    expect(formatJitsiRoomDisplayName("https://meet.jit.si/hello_world")).toBe("hello world");
  });

  it("returns empty string when room cannot be parsed", () => {
    expect(formatJitsiRoomDisplayName("not-a-url")).toBe("");
  });

  it("uses stream name for stream messages", () => {
    const message = createMessage({
      stream_id: 7,
      display_recipient: "engineering",
      subject: "general",
    });
    expect(resolveJitsiLocationName(message)).toBe("engineering");
  });

  it("joins recipient names for DM messages", () => {
    const message = createMessage({
      stream_id: null,
      display_recipient: [
        { id: 11, full_name: "Alice" },
        { id: 12, full_name: "Bob" },
      ],
    });
    expect(resolveJitsiLocationName(message)).toBe("Alice, Bob");
  });

  it("returns empty string for unknown recipient shape", () => {
    const message = createMessage({
      stream_id: null,
      display_recipient: undefined,
    });
    expect(resolveJitsiLocationName(message)).toBe("");
  });
});
