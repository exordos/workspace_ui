import { describe, expect, it } from "vitest";
import type { MessengerEvent } from "~/shared/api/messenger.types";
import { testMessageId } from "~/test/factories";
import { extractStreamMoveFromUpdateEvent } from "./update-message-stream-move.lib";

describe("update-message-stream-move.lib", () => {
  it("extracts cross-channel move payload when new_stream_uuid differs from stream_uuid", () => {
    const event: MessengerEvent = {
      id: 1,
      type: "update_message",
      stream_uuid: "00000000-0000-4000-8000-000000000010",
      new_stream_uuid: "00000000-0000-4000-8000-000000000020",
      orig_subject: " incident ",
      subject: " incident ",
      message_ids: [testMessageId(1), testMessageId(2)],
      message_id: testMessageId(99),
    };

    expect(extractStreamMoveFromUpdateEvent(event)).toEqual({
      sourceStreamId: "00000000-0000-4000-8000-000000000010",
      targetStreamId: "00000000-0000-4000-8000-000000000020",
      oldTopic: "incident",
      newTopic: "incident",
      messageIds: [testMessageId(1), testMessageId(2)],
      anchorMessageId: testMessageId(99),
    });
  });

  it("returns null when new_stream_uuid is missing or equals stream_uuid", () => {
    expect(
      extractStreamMoveFromUpdateEvent({
        id: 2,
        type: "update_message",
        stream_uuid: "00000000-0000-4000-8000-000000000010",
        orig_subject: "t",
        subject: "t",
        message_ids: [testMessageId(1)],
        message_id: testMessageId(1),
      }),
    ).toBeNull();

    expect(
      extractStreamMoveFromUpdateEvent({
        id: 3,
        type: "update_message",
        stream_uuid: "00000000-0000-4000-8000-000000000010",
        new_stream_uuid: "00000000-0000-4000-8000-000000000010",
        orig_subject: "t",
        subject: "t",
        message_ids: [testMessageId(1)],
        message_id: testMessageId(1),
      }),
    ).toBeNull();
  });

  it("returns null when required topic fields are missing", () => {
    expect(
      extractStreamMoveFromUpdateEvent({
        id: 4,
        type: "update_message",
        stream_uuid: "00000000-0000-4000-8000-000000000010",
        new_stream_uuid: "00000000-0000-4000-8000-000000000020",
        subject: "t",
        message_ids: [testMessageId(1)],
        message_id: testMessageId(1),
      }),
    ).toBeNull();
  });
});
