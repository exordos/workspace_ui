import { describe, expect, it } from "vitest";
import {
  buildMessageFocusSearch,
  buildRouteFromZulipNarrowPermalink,
  decodeZulipHashComponent,
  isSameChatAsNarrowPermalink,
  isSameRealmAsPermalink,
  parseZulipNarrowPermalink,
} from "./zulip-narrow-permalink.lib";

describe("decodeZulipHashComponent", () => {
  it("decodes Zulip hash tokens and percent-encoded spaces", () => {
    expect(decodeZulipHashComponent("general.20chat")).toBe("general chat");
  });
});

describe("parseZulipNarrowPermalink", () => {
  it("parses DM permalink with participant slug", () => {
    expect(parseZulipNarrowPermalink("#narrow/dm/23-dm/near/3373")).toEqual({
      messageId: 3373,
      kind: "dm",
      dmParticipantIds: [23],
    });
  });

  it("parses multi-user DM permalink", () => {
    expect(parseZulipNarrowPermalink("#narrow/dm/7,42-dm/near/123")).toEqual({
      messageId: 123,
      kind: "dm",
      dmParticipantIds: [7, 42],
    });
  });

  it("parses group DM permalink", () => {
    expect(parseZulipNarrowPermalink("#narrow/dm/1,2,3-group/near/10")).toEqual({
      messageId: 10,
      kind: "dm",
      dmParticipantIds: [1, 2, 3],
    });
  });

  it("parses stream permalink with topic and near id", () => {
    expect(
      parseZulipNarrowPermalink(
        "https://zulip.example.com/#narrow/channel/33-InternalServicesDev/topic/Workspace/near/5743236",
      ),
    ).toEqual({
      messageId: 5743236,
      kind: "stream",
      streamId: 33,
      topic: "Workspace",
      realmOrigin: "https://zulip.example.com",
    });
  });

  it("returns null for permalink without participant slug", () => {
    expect(parseZulipNarrowPermalink("#narrow/dm/near/1")).toBeNull();
  });

  it("returns null for non-message narrow links", () => {
    expect(parseZulipNarrowPermalink("https://zulip.example.com/#narrow/channel/1-a")).toBeNull();
  });
});

describe("buildRouteFromZulipNarrowPermalink", () => {
  it("builds DM route with focused message query", () => {
    const parsed = parseZulipNarrowPermalink("#narrow/dm/23-dm/near/3373");
    expect(parsed).not.toBeNull();
    expect(
      buildRouteFromZulipNarrowPermalink({
        parsed: parsed!,
        currentUserId: 7,
        resolveStreamName: () => undefined,
      }),
    ).toBe("/dm/23?msg=3373");
  });

  it("builds stream route with focused message query", () => {
    const parsed = parseZulipNarrowPermalink(
      "https://zulip.example.com/#narrow/channel/10-Engineering/topic/Bugs/near/15",
    );
    expect(parsed).not.toBeNull();
    expect(
      buildRouteFromZulipNarrowPermalink({
        parsed: parsed!,
        currentUserId: 7,
        resolveStreamName: (streamId) => (streamId === 10 ? "Engineering" : undefined),
      }),
    ).toBe("/stream/10-engineering/topic/Bugs?msg=15");
  });
});

describe("isSameChatAsNarrowPermalink", () => {
  it("returns true for matching DM conversation", () => {
    const parsed = parseZulipNarrowPermalink("#narrow/dm/42-dm/near/99");
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
    const parsed = parseZulipNarrowPermalink("#narrow/channel/10-Engineering/topic/Bugs/near/15");
    expect(parsed).not.toBeNull();
    expect(
      isSameChatAsNarrowPermalink({
        parsed: parsed!,
        isDmView: false,
        currentUserId: 7,
        dmRecipientIds: [],
        resolvedStreamId: 10,
        topicName: "Bugs",
        streamRouteTopic: "Bugs",
      }),
    ).toBe(true);
  });

  it("returns false for different topic in same stream", () => {
    const parsed = parseZulipNarrowPermalink("#narrow/channel/10-Engineering/topic/Bugs/near/15");
    expect(parsed).not.toBeNull();
    expect(
      isSameChatAsNarrowPermalink({
        parsed: parsed!,
        isDmView: false,
        currentUserId: 7,
        dmRecipientIds: [],
        resolvedStreamId: 10,
        topicName: "general",
        streamRouteTopic: "general",
      }),
    ).toBe(false);
  });
});

describe("isSameRealmAsPermalink", () => {
  it("treats hash-only permalinks as current realm", () => {
    expect(isSameRealmAsPermalink(undefined, "https://zulip.example.com")).toBe(true);
  });

  it("matches absolute permalink origin to current realm", () => {
    expect(isSameRealmAsPermalink("https://zulip.example.com", "https://zulip.example.com/")).toBe(
      true,
    );
  });

  it("rejects mismatched realm origins", () => {
    expect(isSameRealmAsPermalink("https://other.example.com", "https://zulip.example.com")).toBe(
      false,
    );
  });
});

describe("buildMessageFocusSearch", () => {
  it("sets msg while preserving other query params", () => {
    expect(buildMessageFocusSearch("?forward=44&msg=10", 3373)).toBe("?forward=44&msg=3373");
  });

  it("adds msg to empty search", () => {
    expect(buildMessageFocusSearch("", 3373)).toBe("?msg=3373");
  });
});
