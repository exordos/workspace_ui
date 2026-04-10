import { describe, expect, it } from "vitest";
import {
  buildOptimisticOutgoingMessage,
  markOutgoingMessageFailed,
  markOutgoingMessageSent,
} from "./chat-send-delivery.lib";

describe("buildOptimisticOutgoingMessage", () => {
  it("builds optimistic DM message with sending state", () => {
    expect(
      buildOptimisticOutgoingMessage({
        id: -1,
        senderId: 42,
        senderFullName: "You",
        content: "hello",
        target: { mode: "dm", recipientIds: [7, 10] },
        nowSec: 123,
      }),
    ).toEqual({
      id: -1,
      sender_id: 42,
      sender_full_name: "You",
      stream_id: null,
      display_recipient: [
        { id: 7, full_name: "" },
        { id: 10, full_name: "" },
      ],
      subject: "",
      content: "hello",
      timestamp: 123,
      delivery_status: "sending",
      local_echo_key: -1,
    });
  });

  it("builds optimistic stream message with sending state", () => {
    expect(
      buildOptimisticOutgoingMessage({
        id: -2,
        senderId: 42,
        senderFullName: "You",
        content: "hello stream",
        target: { mode: "stream", stream: "engineering", streamId: 5, subject: "general" },
        nowSec: 456,
      }),
    ).toEqual({
      id: -2,
      sender_id: 42,
      sender_full_name: "You",
      stream_id: 5,
      display_recipient: "engineering",
      channel: "engineering",
      subject: "general",
      content: "hello stream",
      timestamp: 456,
      delivery_status: "sending",
      local_echo_key: -2,
    });
  });
});

describe("delivery transitions", () => {
  it("marks optimistic message as failed", () => {
    const message = buildOptimisticOutgoingMessage({
      id: -3,
      senderId: 42,
      senderFullName: "You",
      content: "hello",
      target: { mode: "stream", stream: "engineering", subject: "general" },
      nowSec: 789,
    });

    expect(markOutgoingMessageFailed(message).delivery_status).toBe("failed");
  });

  it("marks outgoing message as sent", () => {
    const message = buildOptimisticOutgoingMessage({
      id: -4,
      senderId: 42,
      senderFullName: "You",
      content: "hello",
      target: { mode: "dm", recipientIds: [7] },
      nowSec: 999,
    });

    expect(markOutgoingMessageSent(message).delivery_status).toBe("sent");
  });
});
