import { describe, expect, it } from "vitest";
import { isOneToOneDirectMessage } from "./message-bubble-emoji.lib";

describe("isOneToOneDirectMessage", () => {
  it("returns false for stream messages", () => {
    expect(
      isOneToOneDirectMessage({
        id: 1,
        sender_id: 1,
        sender_full_name: "A",
        stream_id: 5,
        subject: "topic",
        content: "",
        timestamp: 0,
        display_recipient: "stream",
      }),
    ).toBe(false);
  });

  it("returns true when private and exactly two recipients", () => {
    expect(
      isOneToOneDirectMessage({
        id: 1,
        sender_id: 1,
        sender_full_name: "A",
        stream_id: null,
        subject: "",
        content: "",
        timestamp: 0,
        display_recipient: [
          { id: 1, full_name: "A" },
          { id: 2, full_name: "B" },
        ],
      }),
    ).toBe(true);
  });

  it("returns false for group DM (three or more recipients)", () => {
    expect(
      isOneToOneDirectMessage({
        id: 1,
        sender_id: 1,
        sender_full_name: "A",
        stream_id: null,
        subject: "",
        content: "",
        timestamp: 0,
        display_recipient: [
          { id: 1, full_name: "A" },
          { id: 2, full_name: "B" },
          { id: 3, full_name: "C" },
        ],
      }),
    ).toBe(false);
  });

  it("returns false when display_recipient is missing or not an array", () => {
    expect(
      isOneToOneDirectMessage({
        id: 1,
        sender_id: 1,
        sender_full_name: "A",
        stream_id: null,
        subject: "",
        content: "",
        timestamp: 0,
      }),
    ).toBe(false);
  });
});
