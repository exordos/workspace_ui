import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import {
  buildMessageFocusSearch,
  buildRouteFromMessengerNarrowPermalink,
  decodeWorkspaceHashComponent,
  isSameChatAsNarrowPermalink,
  isSameRealmAsPermalink,
  parseMessengerNarrowPermalink,
} from "./messenger-narrow-permalink.lib";

const STREAM_UUID_33 = "00000000-0000-4000-8000-000000000033";

describe("decodeWorkspaceHashComponent", () => {
  it("decodes Workspace hash tokens and percent-encoded spaces", () => {
    expect(decodeWorkspaceHashComponent("general.20chat")).toBe("general chat");
  });
});

describe("parseMessengerNarrowPermalink", () => {
  it("parses DM permalink with participant slug", () => {
    const messageId = testMessageId(3373);
    expect(parseMessengerNarrowPermalink(`#narrow/dm/23-dm/near/${messageId}`)).toEqual({
      messageId,
      kind: "dm",
      dmParticipantIds: [23],
    });
  });

  it("parses multi-user DM permalink", () => {
    const messageId = testMessageId(123);
    expect(parseMessengerNarrowPermalink(`#narrow/dm/7,42-dm/near/${messageId}`)).toEqual({
      messageId,
      kind: "dm",
      dmParticipantIds: [7, 42],
    });
  });

  it("parses group DM permalink", () => {
    const messageId = testMessageId(10);
    expect(parseMessengerNarrowPermalink(`#narrow/dm/1,2,3-group/near/${messageId}`)).toEqual({
      messageId,
      kind: "dm",
      dmParticipantIds: [1, 2, 3],
    });
  });

  it("parses stream permalink with topic and near id", () => {
    const messageId = testMessageId(5743236);
    expect(
      parseMessengerNarrowPermalink(
        `https://chat.example.com/#narrow/channel/${STREAM_UUID_33}/topic/Workspace/near/${messageId}`,
      ),
    ).toEqual({
      messageId,
      kind: "stream",
      streamId: STREAM_UUID_33,
      topic: "Workspace",
      realmOrigin: "https://chat.example.com",
    });
  });

  it("returns null for permalink without participant slug", () => {
    expect(parseMessengerNarrowPermalink("#narrow/dm/near/1")).toBeNull();
  });

  it("returns null for non-message narrow links", () => {
    expect(
      parseMessengerNarrowPermalink("https://chat.example.com/#narrow/channel/1-a"),
    ).toBeNull();
  });
});

describe("buildRouteFromMessengerNarrowPermalink", () => {
  it("builds DM route with focused message query", () => {
    const messageId = testMessageId(3373);
    const parsed = parseMessengerNarrowPermalink(`#narrow/dm/23-dm/near/${messageId}`);
    expect(parsed).not.toBeNull();
    expect(
      buildRouteFromMessengerNarrowPermalink({
        parsed: parsed!,
        currentUserId: 7,
        resolveStreamName: () => undefined,
      }),
    ).toBe(`/dm/23?msg=${messageId}`);
  });

  it("builds stream route with focused message query", () => {
    const messageId = testMessageId(15);
    const parsed = parseMessengerNarrowPermalink(
      `https://chat.example.com/#narrow/channel/10-Engineering/topic/Bugs/near/${messageId}`,
    );
    expect(parsed).not.toBeNull();
    expect(
      buildRouteFromMessengerNarrowPermalink({
        parsed: parsed!,
        currentUserId: 7,
        resolveStreamName: (streamId) =>
          streamId === "10-engineering" ? "Engineering" : undefined,
      }),
    ).toBe(`/stream/10-engineering/topic/Bugs?msg=${messageId}`);
  });
});

describe("isSameChatAsNarrowPermalink", () => {
  it("returns true for matching DM conversation", () => {
    const parsed = parseMessengerNarrowPermalink(`#narrow/dm/42-dm/near/${testMessageId(99)}`);
    expect(parsed).not.toBeNull();
    expect(
      isSameChatAsNarrowPermalink({
        parsed: parsed!,
        isDmView: true,
        currentUserId: 7,
        dmRecipientIds: [42],
        resolvedStreamId: null,
        topicName: undefined,
        streamRouteTopic: "",
      }),
    ).toBe(true);
  });

  it("returns true for matching stream topic", () => {
    const parsed = parseMessengerNarrowPermalink(
      `#narrow/channel/10-Engineering/topic/Bugs/near/${testMessageId(15)}`,
    );
    expect(parsed).not.toBeNull();
    expect(
      isSameChatAsNarrowPermalink({
        parsed: parsed!,
        isDmView: false,
        currentUserId: 7,
        dmRecipientIds: [],
        resolvedStreamId: "10-engineering",
        topicName: "Bugs",
        streamRouteTopic: "Bugs",
      }),
    ).toBe(true);
  });

  it("returns false for different topic in same stream", () => {
    const parsed = parseMessengerNarrowPermalink(
      `#narrow/channel/10-Engineering/topic/Bugs/near/${testMessageId(15)}`,
    );
    expect(parsed).not.toBeNull();
    expect(
      isSameChatAsNarrowPermalink({
        parsed: parsed!,
        isDmView: false,
        currentUserId: 7,
        dmRecipientIds: [],
        resolvedStreamId: "10-engineering",
        topicName: "general",
        streamRouteTopic: "general",
      }),
    ).toBe(false);
  });
});

describe("isSameRealmAsPermalink", () => {
  it("treats hash-only permalinks as current realm", () => {
    expect(isSameRealmAsPermalink(undefined, "https://chat.example.com")).toBe(true);
  });

  it("matches absolute permalink origin to current realm", () => {
    expect(isSameRealmAsPermalink("https://chat.example.com", "https://chat.example.com/")).toBe(
      true,
    );
  });

  it("rejects mismatched realm origins", () => {
    expect(isSameRealmAsPermalink("https://other.example.com", "https://chat.example.com")).toBe(
      false,
    );
  });
});

describe("buildMessageFocusSearch", () => {
  it("sets msg while preserving other query params", () => {
    const messageId = testMessageId(3373);
    expect(buildMessageFocusSearch("?forward=44&msg=10", messageId)).toBe(
      `?forward=44&msg=${messageId}`,
    );
  });

  it("adds msg to empty search", () => {
    const messageId = testMessageId(3373);
    expect(buildMessageFocusSearch("", messageId)).toBe(`?msg=${messageId}`);
  });
});
