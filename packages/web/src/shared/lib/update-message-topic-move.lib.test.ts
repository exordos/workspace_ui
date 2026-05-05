import { describe, expect, it } from "vitest";
import type { ZulipEvent } from "~/shared/api/zulip.types";
import {
  extractTopicMoveFromUpdateEvent,
  resolveTopicMoveTargetMessageIds,
} from "./update-message-topic-move.lib";

describe("update-message-topic-move.lib", () => {
  it("extracts normalized topic move payload for valid update_message", () => {
    const event: ZulipEvent = {
      id: 1,
      type: "update_message",
      stream_id: 42,
      orig_subject: " incident ",
      subject: "  resolved incident  ",
      message_ids: [1, 2, -3, 0, 2.5, "x", null],
      message_id: 99,
    };

    expect(extractTopicMoveFromUpdateEvent(event)).toEqual({
      streamId: 42,
      oldTopic: "incident",
      newTopic: "resolved incident",
      messageIds: [1, 2],
      anchorMessageId: 99,
    });
  });

  it("returns null when required rename payload fields are missing", () => {
    const missingStreamId: ZulipEvent = {
      id: 2,
      type: "update_message",
      orig_subject: "incident",
      subject: "resolved incident",
      message_id: 1,
    };
    const missingOrigSubject: ZulipEvent = {
      id: 3,
      type: "update_message",
      stream_id: 42,
      subject: "resolved incident",
      message_id: 1,
    };
    const missingSubject: ZulipEvent = {
      id: 4,
      type: "update_message",
      stream_id: 42,
      orig_subject: "incident",
      message_id: 1,
    };

    expect(extractTopicMoveFromUpdateEvent(missingStreamId)).toBeNull();
    expect(extractTopicMoveFromUpdateEvent(missingOrigSubject)).toBeNull();
    expect(extractTopicMoveFromUpdateEvent(missingSubject)).toBeNull();
  });

  it("returns null when topics are equal after normalization", () => {
    const event: ZulipEvent = {
      id: 5,
      type: "update_message",
      stream_id: 42,
      orig_subject: " incident ",
      subject: "incident",
      message_ids: [1],
      message_id: 1,
    };

    expect(extractTopicMoveFromUpdateEvent(event)).toBeNull();
  });

  it("filters invalid message_ids and omits empty list", () => {
    const event: ZulipEvent = {
      id: 6,
      type: "update_message",
      stream_id: 42,
      orig_subject: "incident",
      subject: "resolved incident",
      message_ids: [-1, 0, 2.5, "x", null],
      message_id: -7,
    };

    expect(extractTopicMoveFromUpdateEvent(event)).toBeNull();
  });

  it("deduplicates and merges message_ids with anchor", () => {
    expect(
      resolveTopicMoveTargetMessageIds({
        messageIds: [10, 11, 10, -1, 0],
        anchorMessageId: 11,
      }),
    ).toEqual([10, 11]);
  });
});
