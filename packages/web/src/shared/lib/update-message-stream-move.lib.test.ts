import { describe, expect, it } from "vitest";
import type { ZulipEvent } from "~/shared/api/zulip.types";
import { extractStreamMoveFromUpdateEvent } from "./update-message-stream-move.lib";

describe("update-message-stream-move.lib", () => {
  it("extracts cross-channel move payload when new_stream_id differs from stream_id", () => {
    const event: ZulipEvent = {
      id: 1,
      type: "update_message",
      stream_id: 10,
      new_stream_id: 20,
      orig_subject: " incident ",
      subject: " incident ",
      message_ids: [1, 2],
      message_id: 99,
    };

    expect(extractStreamMoveFromUpdateEvent(event)).toEqual({
      sourceStreamId: 10,
      targetStreamId: 20,
      oldTopic: "incident",
      newTopic: "incident",
      messageIds: [1, 2],
      anchorMessageId: 99,
    });
  });

  it("returns null when new_stream_id is missing or equals stream_id", () => {
    expect(
      extractStreamMoveFromUpdateEvent({
        id: 2,
        type: "update_message",
        stream_id: 10,
        orig_subject: "t",
        subject: "t",
        message_ids: [1],
        message_id: 1,
      }),
    ).toBeNull();

    expect(
      extractStreamMoveFromUpdateEvent({
        id: 3,
        type: "update_message",
        stream_id: 10,
        new_stream_id: 10,
        orig_subject: "t",
        subject: "t",
        message_ids: [1],
        message_id: 1,
      }),
    ).toBeNull();
  });

  it("returns null when required topic fields are missing", () => {
    expect(
      extractStreamMoveFromUpdateEvent({
        id: 4,
        type: "update_message",
        stream_id: 10,
        new_stream_id: 20,
        subject: "t",
        message_ids: [1],
        message_id: 1,
      }),
    ).toBeNull();
  });
});
