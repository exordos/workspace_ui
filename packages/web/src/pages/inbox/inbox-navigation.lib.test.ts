import { afterEach, describe, expect, it } from "vitest";
import type { InboxEntry } from "~/entities/inbox/inbox.types";
import { setCurrentOrgRouteIdResolver } from "~/shared/lib/org-route";
import { testMessageId } from "~/test/factories";
import { buildInboxEntryRoute } from "./inbox-navigation.lib";

function baseEntry(overrides: Partial<InboxEntry>): InboxEntry {
  return {
    key: "dm:42",
    streamId: null,
    streamName: null,
    topic: null,
    senderId: 42,
    senderName: "Alice",
    dmSlug: "42",
    unreadCount: 2,
    lastMessageTimestamp: 100,
    messageIds: [testMessageId(10), testMessageId(25)],
    ...overrides,
  };
}

describe("buildInboxEntryRoute", () => {
  afterEach(() => {
    setCurrentOrgRouteIdResolver(null);
  });

  it("prefixes generated route with current org scope", () => {
    setCurrentOrgRouteIdResolver(() => "chat.example.com");

    expect(buildInboxEntryRoute(baseEntry({ dmSlug: "42,99", senderId: null }))).toBe(
      `/org/chat.example.com/dm/42,99?msg=${testMessageId(25)}`,
    );
  });

  it("builds stream route with message focus", () => {
    expect(
      buildInboxEntryRoute(
        baseEntry({
          key: "stream:10:general",
          streamId: "10",
          streamName: "engineering",
          topic: "general",
          senderId: null,
          senderName: null,
          dmSlug: null,
          messageIds: [testMessageId(101), testMessageId(90), testMessageId(111)],
        }),
      ),
    ).toBe(`/stream/10/topic/general?msg=${testMessageId(111)}`);
  });

  it("builds explicit empty-topic route for empty topic", () => {
    expect(
      buildInboxEntryRoute(
        baseEntry({
          key: "stream:10:",
          streamId: "10",
          streamName: "engineering",
          topic: "",
          senderId: null,
          senderName: null,
          dmSlug: null,
          messageIds: [testMessageId(101), testMessageId(90), testMessageId(111)],
        }),
      ),
    ).toBe(`/stream/10/topic/__empty__?msg=${testMessageId(111)}`);
  });

  it("builds dm route with message focus", () => {
    expect(buildInboxEntryRoute(baseEntry({ dmSlug: "42,99", senderId: null }))).toBe(
      `/dm/42,99?msg=${testMessageId(25)}`,
    );
  });

  it("falls back to senderId route when dmSlug is missing", () => {
    expect(buildInboxEntryRoute(baseEntry({ dmSlug: null, senderId: 55 }))).toBe(
      `/dm/55?msg=${testMessageId(25)}`,
    );
  });

  it("omits msg query when there is no valid message id", () => {
    expect(
      buildInboxEntryRoute(baseEntry({ messageIds: ["not-a-message-id"], dmSlug: "42,99" })),
    ).toBe("/dm/42,99");
  });
});
