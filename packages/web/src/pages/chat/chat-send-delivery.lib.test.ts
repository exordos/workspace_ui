import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import {
  buildOptimisticOutgoingMessage,
  markOutgoingMessageFailed,
  markOutgoingMessageSent,
} from "./chat-send-delivery.lib";

describe("buildOptimisticOutgoingMessage", () => {
  it("builds optimistic DM message with sending state", () => {
    const id = testMessageId(900001);
    expect(
      buildOptimisticOutgoingMessage({
        id,
        senderId: 42,
        senderFullName: "You",
        content: "hello",
        target: { mode: "dm", recipientIds: [7, 10] },
        nowSec: 123,
      }),
    ).toEqual({
      id,
      sender_id: 42,
      is_own: true,
      sender_full_name: "You",
      stream_uuid: null,
      display_recipient: [
        { id: 7, full_name: "" },
        { id: 10, full_name: "" },
      ],
      subject: "",
      content: "hello",
      markdown_source: "hello",
      timestamp: 123,
      delivery_status: "sending",
      local_echo_key: id,
    });
  });

  it("builds optimistic stream message with sending state", () => {
    const id = testMessageId(900002);
    expect(
      buildOptimisticOutgoingMessage({
        id,
        senderId: 42,
        senderFullName: "You",
        content: "hello stream",
        target: {
          mode: "stream",
          stream: "engineering",
          streamUuid: "22222222-2222-4222-8222-222222222222",
          subject: "general",
        },
        nowSec: 456,
      }),
    ).toEqual({
      id,
      sender_id: 42,
      is_own: true,
      sender_full_name: "You",
      stream_uuid: "22222222-2222-4222-8222-222222222222",
      display_recipient: "engineering",
      channel: "engineering",
      subject: "general",
      content: "hello stream",
      markdown_source: "hello stream",
      timestamp: 456,
      delivery_status: "sending",
      local_echo_key: id,
    });
  });

  it("builds optimistic message with UUID author identity", () => {
    const id = testMessageId(900006);
    const authorUuid = "00000000-0000-0000-0000-000000000000";

    expect(
      buildOptimisticOutgoingMessage({
        id,
        senderId: authorUuid,
        senderFullName: "You",
        content: "hello uuid",
        target: {
          mode: "stream",
          stream: "engineering",
          streamUuid: "22222222-2222-4222-8222-222222222222",
          subject: "general",
        },
        nowSec: 457,
      }),
    ).toEqual(
      expect.objectContaining({
        id,
        sender_id: 0,
        author_uuid: authorUuid,
        sender_uuid: authorUuid,
        is_own: true,
      }),
    );
  });

  it("stores composer text as markdown_source for optimistic HTML-like bodies", () => {
    expect(
      buildOptimisticOutgoingMessage({
        id: testMessageId(900005),
        senderId: 42,
        senderFullName: "You",
        content: '<img src="x" onerror="alert(1)">',
        target: { mode: "dm", recipientIds: [7] },
        nowSec: 111,
      }),
    ).toEqual(
      expect.objectContaining({
        content: '<img src="x" onerror="alert(1)">',
        markdown_source: '<img src="x" onerror="alert(1)">',
      }),
    );
  });
});

describe("delivery transitions", () => {
  it("marks optimistic message as failed", () => {
    const message = buildOptimisticOutgoingMessage({
      id: testMessageId(900003),
      senderId: 42,
      senderFullName: "You",
      content: "hello",
      target: {
        mode: "stream",
        stream: "engineering",
        streamUuid: "22222222-2222-4222-8222-222222222222",
        subject: "general",
      },
      nowSec: 789,
    });

    expect(markOutgoingMessageFailed(message).delivery_status).toBe("failed");
  });

  it("marks outgoing message as sent", () => {
    const message = buildOptimisticOutgoingMessage({
      id: testMessageId(900004),
      senderId: 42,
      senderFullName: "You",
      content: "hello",
      target: { mode: "dm", recipientIds: [7] },
      nowSec: 999,
    });

    expect(markOutgoingMessageSent(message).delivery_status).toBe("sent");
  });
});
