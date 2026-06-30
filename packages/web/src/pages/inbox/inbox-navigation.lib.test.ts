import { afterEach, describe, expect, it } from "vitest";
import type { InboxEntry } from "~/entities/inbox/inbox.types";
import { setCurrentOrgRouteIdResolver } from "~/shared/lib/org-route";
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
    messageIds: [10, 25],
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
      "/org/chat.example.com/inbox",
    );
  });

  it("returns inbox for stream entries without Workspace UUID route data", () => {
    expect(
      buildInboxEntryRoute(
        baseEntry({
          key: "stream:10:general",
          streamId: 10,
          streamName: "engineering",
          topic: "general",
          senderId: null,
          senderName: null,
          dmSlug: null,
          messageIds: [101, 90, 111],
        }),
      ),
    ).toBe("/inbox");
  });

  it("returns inbox for empty-topic stream entries without Workspace UUID route data", () => {
    expect(
      buildInboxEntryRoute(
        baseEntry({
          key: "stream:10:",
          streamId: 10,
          streamName: "engineering",
          topic: "",
          senderId: null,
          senderName: null,
          dmSlug: null,
          messageIds: [101, 90, 111],
        }),
      ),
    ).toBe("/inbox");
  });

  it("returns inbox for dm entries without Workspace UUID route data", () => {
    expect(buildInboxEntryRoute(baseEntry({ dmSlug: "42,99", senderId: null }))).toBe("/inbox");
  });

  it("returns inbox for sender-only entries without Workspace UUID route data", () => {
    expect(buildInboxEntryRoute(baseEntry({ dmSlug: null, senderId: 55 }))).toBe("/inbox");
  });

  it("returns null when entry has no routeable source", () => {
    expect(
      buildInboxEntryRoute(baseEntry({ streamId: null, dmSlug: null, senderId: null })),
    ).toBeNull();
  });
});
