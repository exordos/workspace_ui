import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/messenger.types";
import {
  isFocusedMessageLoadedInRoute,
  shouldSkipFocusedAnchorInitialLoad,
} from "./chat-anchor-load.lib";

const STREAM_UUID = "00000000-0000-4000-8000-000000000010";

function message(overrides: Partial<MockMessage>): MockMessage {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    sender_id: 7,
    sender_full_name: "Alice",
    stream_uuid: STREAM_UUID,
    subject: "general",
    content: "hello",
    timestamp: 1700000000,
    ...overrides,
  };
}

describe("isFocusedMessageLoadedInRoute", () => {
  it("returns true when focused stream message is already in loaded topic", () => {
    expect(
      isFocusedMessageLoadedInRoute({
        focusedMessageId: "00000000-0000-4000-8000-000000000055",
        messages: [
          message({
            id: "00000000-0000-4000-8000-000000000055",
            stream_uuid: STREAM_UUID,
            subject: "bugs",
          }),
        ],
        isDmView: false,
        currentUserId: 7,
        dmRecipientIds: [],
        resolvedStreamId: STREAM_UUID,
        topicName: "bugs",
        streamRouteTopic: "bugs",
      }),
    ).toBe(true);
  });

  it("matches focused stream message by topic UUID after the topic display name changes", () => {
    const topicUuid = "00000000-0000-4000-8000-0000000000d0";
    expect(
      isFocusedMessageLoadedInRoute({
        focusedMessageId: "00000000-0000-4000-8000-000000000055",
        messages: [
          message({
            id: "00000000-0000-4000-8000-000000000055",
            stream_uuid: STREAM_UUID,
            subject: "old incident",
            topic_uuid: topicUuid,
          }),
        ],
        isDmView: false,
        currentUserId: 7,
        dmRecipientIds: [],
        resolvedStreamId: STREAM_UUID,
        topicName: topicUuid,
        streamRouteTopic: "new incident",
        activeTopicUuid: topicUuid,
      }),
    ).toBe(true);
  });

  it("returns false when focused stream message belongs to another topic route", () => {
    expect(
      isFocusedMessageLoadedInRoute({
        focusedMessageId: "00000000-0000-4000-8000-000000000055",
        messages: [
          message({
            id: "00000000-0000-4000-8000-000000000055",
            stream_uuid: STREAM_UUID,
            subject: "bugs",
          }),
        ],
        isDmView: false,
        currentUserId: 7,
        dmRecipientIds: [],
        resolvedStreamId: STREAM_UUID,
        topicName: "general",
        streamRouteTopic: "general",
      }),
    ).toBe(false);
  });

  it("returns true when focused dm message is already in loaded dm conversation", () => {
    expect(
      isFocusedMessageLoadedInRoute({
        focusedMessageId: "00000000-0000-4000-8000-000000000099",
        messages: [
          message({
            id: "00000000-0000-4000-8000-000000000099",
            stream_uuid: null,
            display_recipient: [
              { id: 7, full_name: "You" },
              { id: 42, full_name: "Bob" },
            ],
          }),
        ],
        isDmView: true,
        currentUserId: 7,
        dmRecipientIds: [42],
        resolvedStreamId: null,
        topicName: undefined,
        streamRouteTopic: "general",
      }),
    ).toBe(true);
  });
});

describe("shouldSkipFocusedAnchorInitialLoad", () => {
  it("returns false when there is no focused message", () => {
    expect(
      shouldSkipFocusedAnchorInitialLoad({
        focusedMessageId: null,
        isFocusedMessageLoadedInCurrentRoute: true,
        hasOlderMessages: true,
        hasNewerMessages: true,
      }),
    ).toBe(false);
  });

  it("returns false when focused message is not in the loaded route window", () => {
    expect(
      shouldSkipFocusedAnchorInitialLoad({
        focusedMessageId: "00000000-0000-4000-8000-000000000055",
        isFocusedMessageLoadedInCurrentRoute: false,
        hasOlderMessages: true,
        hasNewerMessages: true,
      }),
    ).toBe(false);
  });

  it("returns true when focused message is already loaded in the current route", () => {
    expect(
      shouldSkipFocusedAnchorInitialLoad({
        focusedMessageId: "00000000-0000-4000-8000-000000000055",
        isFocusedMessageLoadedInCurrentRoute: true,
        hasOlderMessages: false,
        hasNewerMessages: false,
      }),
    ).toBe(true);
  });

  it("returns true when focused message is in route with anchor pagination flags", () => {
    expect(
      shouldSkipFocusedAnchorInitialLoad({
        focusedMessageId: "00000000-0000-4000-8000-000000000055",
        isFocusedMessageLoadedInCurrentRoute: true,
        hasOlderMessages: true,
        hasNewerMessages: false,
      }),
    ).toBe(true);
    expect(
      shouldSkipFocusedAnchorInitialLoad({
        focusedMessageId: "00000000-0000-4000-8000-000000000055",
        isFocusedMessageLoadedInCurrentRoute: true,
        hasOlderMessages: false,
        hasNewerMessages: true,
      }),
    ).toBe(true);
  });
});
