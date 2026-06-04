import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import {
  isFocusedMessageLoadedInRoute,
  shouldSkipFocusedAnchorInitialLoad,
} from "./chat-anchor-load.lib";

function message(overrides: Partial<MockMessage>): MockMessage {
  return {
    id: 1,
    sender_id: 7,
    sender_full_name: "Alice",
    stream_id: 10,
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
        focusedMessageId: 55,
        messages: [message({ id: 55, stream_id: 10, subject: "bugs" })],
        isDmView: false,
        currentUserId: 7,
        dmRecipientIds: [],
        resolvedStreamId: 10,
        topicName: "bugs",
        streamRouteTopic: "bugs",
      }),
    ).toBe(true);
  });

  it("returns false when focused stream message belongs to another topic route", () => {
    expect(
      isFocusedMessageLoadedInRoute({
        focusedMessageId: 55,
        messages: [message({ id: 55, stream_id: 10, subject: "bugs" })],
        isDmView: false,
        currentUserId: 7,
        dmRecipientIds: [],
        resolvedStreamId: 10,
        topicName: "general",
        streamRouteTopic: "general",
      }),
    ).toBe(false);
  });

  it("returns true when focused dm message is already in loaded dm conversation", () => {
    expect(
      isFocusedMessageLoadedInRoute({
        focusedMessageId: 99,
        messages: [
          message({
            id: 99,
            stream_id: null,
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
        focusedMessageId: 55,
        isFocusedMessageLoadedInCurrentRoute: false,
        hasOlderMessages: true,
        hasNewerMessages: true,
      }),
    ).toBe(false);
  });

  it("returns false when focused message is in route but store only has tail window", () => {
    expect(
      shouldSkipFocusedAnchorInitialLoad({
        focusedMessageId: 55,
        isFocusedMessageLoadedInCurrentRoute: true,
        hasOlderMessages: false,
        hasNewerMessages: false,
      }),
    ).toBe(false);
  });

  it("returns true when focused message is in route with anchor pagination flags", () => {
    expect(
      shouldSkipFocusedAnchorInitialLoad({
        focusedMessageId: 55,
        isFocusedMessageLoadedInCurrentRoute: true,
        hasOlderMessages: true,
        hasNewerMessages: false,
      }),
    ).toBe(true);
    expect(
      shouldSkipFocusedAnchorInitialLoad({
        focusedMessageId: 55,
        isFocusedMessageLoadedInCurrentRoute: true,
        hasOlderMessages: false,
        hasNewerMessages: true,
      }),
    ).toBe(true);
  });
});
