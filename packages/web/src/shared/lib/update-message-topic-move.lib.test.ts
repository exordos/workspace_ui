import { describe, expect, it } from "vitest";
import type { MessengerEvent } from "~/shared/api/messenger.types";
import {
  extractTopicMoveFromUpdateEvent,
  resolveTopicMoveTargetMessageIds,
} from "./update-message-topic-move.lib";

describe("update-message-topic-move.lib", () => {
  it("extracts normalized topic move payload for valid update_message", () => {
    const event: MessengerEvent = {
      id: 1,
      type: "update_message",
      stream_uuid: "00000000-0000-4000-8000-000000000042",
      orig_subject: " incident ",
      subject: "  resolved incident  ",
      message_ids: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-0000000000n3",
        "x",
        null,
      ],
      message_id: "00000000-0000-4000-8000-000000000099",
    };

    expect(extractTopicMoveFromUpdateEvent(event)).toEqual({
      streamId: "00000000-0000-4000-8000-000000000042",
      oldTopic: "incident",
      newTopic: "resolved incident",
      messageIds: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"],
      anchorMessageId: "00000000-0000-4000-8000-000000000099",
    });
  });

  it("returns null when required rename payload fields are missing", () => {
    const missingStreamId: MessengerEvent = {
      id: 2,
      type: "update_message",
      orig_subject: "incident",
      subject: "resolved incident",
      message_id: "00000000-0000-4000-8000-000000000001",
    };
    const missingOrigSubject: MessengerEvent = {
      id: 3,
      type: "update_message",
      stream_uuid: "00000000-0000-4000-8000-000000000042",
      subject: "resolved incident",
      message_id: "00000000-0000-4000-8000-000000000001",
    };
    const missingSubject: MessengerEvent = {
      id: 4,
      type: "update_message",
      stream_uuid: "00000000-0000-4000-8000-000000000042",
      orig_subject: "incident",
      message_id: "00000000-0000-4000-8000-000000000001",
    };

    expect(extractTopicMoveFromUpdateEvent(missingStreamId)).toBeNull();
    expect(extractTopicMoveFromUpdateEvent(missingOrigSubject)).toBeNull();
    expect(extractTopicMoveFromUpdateEvent(missingSubject)).toBeNull();
  });

  it("returns null when topics are equal after normalization", () => {
    const event: MessengerEvent = {
      id: 5,
      type: "update_message",
      stream_uuid: "00000000-0000-4000-8000-000000000042",
      orig_subject: " incident ",
      subject: "incident",
      message_ids: ["00000000-0000-4000-8000-000000000001"],
      message_id: "00000000-0000-4000-8000-000000000001",
    };

    expect(extractTopicMoveFromUpdateEvent(event)).toBeNull();
  });

  it("filters invalid message_ids and omits empty list", () => {
    const event: MessengerEvent = {
      id: 6,
      type: "update_message",
      stream_uuid: "00000000-0000-4000-8000-000000000042",
      orig_subject: "incident",
      subject: "resolved incident",
      message_ids: ["00000000-0000-4000-8000-0000000000n1", "x", null],
      message_id: "00000000-0000-4000-8000-0000000000n7",
    };

    expect(extractTopicMoveFromUpdateEvent(event)).toBeNull();
  });

  it("deduplicates and merges message_ids with anchor", () => {
    expect(
      resolveTopicMoveTargetMessageIds({
        messageIds: [
          "00000000-0000-4000-8000-000000000010",
          "00000000-0000-4000-8000-000000000011",
          "00000000-0000-4000-8000-000000000010",
          "00000000-0000-4000-8000-0000000000n1",
        ],
        anchorMessageId: "00000000-0000-4000-8000-000000000011",
      }),
    ).toEqual(["00000000-0000-4000-8000-000000000010", "00000000-0000-4000-8000-000000000011"]);
  });
});
