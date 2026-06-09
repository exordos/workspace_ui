import { describe, expect, it } from "vitest";
import { resolveQuotePermalinkNavigation } from "./chat-message-permalink-navigation.lib";

const baseParams = {
  realmBaseUrl: "https://zulip.example.com",
  locationPathname: "/dm/23",
  locationSearch: "",
  isDmView: true,
  currentUserId: 7,
  dmRecipientIds: [23],
  resolvedStreamId: null,
  topicName: undefined,
  streamRouteTopic: "",
  resolveStreamName: () => undefined,
};

describe("resolveQuotePermalinkNavigation", () => {
  it("uses in-place search update for same-chat DM permalink", () => {
    expect(
      resolveQuotePermalinkNavigation({
        ...baseParams,
        href: "https://zulip.example.com/#narrow/dm/23-dm/near/3373",
      }),
    ).toEqual({
      kind: "inPlace",
      pathname: "/dm/23",
      search: "?msg=3373",
    });
  });

  it("preserves other query params when updating msg in same chat", () => {
    expect(
      resolveQuotePermalinkNavigation({
        ...baseParams,
        locationSearch: "?forward=44",
        href: "#narrow/dm/23-dm/near/3373",
      }),
    ).toEqual({
      kind: "inPlace",
      pathname: "/dm/23",
      search: "?forward=44&msg=3373",
    });
  });

  it("navigates directly to another DM without message redirect hop", () => {
    expect(
      resolveQuotePermalinkNavigation({
        ...baseParams,
        href: "#narrow/dm/42-dm/near/99",
      }),
    ).toEqual({
      kind: "path",
      path: "/dm/42?msg=99",
    });
  });

  it("navigates directly to stream topic from permalink", () => {
    expect(
      resolveQuotePermalinkNavigation({
        ...baseParams,
        locationPathname: "/dm/23",
        isDmView: true,
        href: "https://zulip.example.com/#narrow/channel/10-Engineering/topic/Bugs/near/15",
        resolveStreamName: (streamId) => (streamId === 10 ? "Engineering" : undefined),
      }),
    ).toEqual({
      kind: "path",
      path: "/stream/10-engineering/topic/Bugs?msg=15",
    });
  });

  it("falls back to message redirect for foreign realm permalinks", () => {
    expect(
      resolveQuotePermalinkNavigation({
        ...baseParams,
        realmBaseUrl: "https://chat.example.com",
        href: "https://zulip.example.com/#narrow/dm/23-dm/near/3373",
      }),
    ).toEqual({
      kind: "path",
      path: "/message/3373?realm=https%3A%2F%2Fzulip.example.com",
    });
  });

  it("falls back to message redirect for malformed narrow permalinks", () => {
    expect(
      resolveQuotePermalinkNavigation({
        ...baseParams,
        href: "#narrow/dm/near/1",
      }),
    ).toEqual({
      kind: "path",
      path: "/message/1",
    });
  });

  it("returns null for non-message permalinks", () => {
    expect(
      resolveQuotePermalinkNavigation({
        ...baseParams,
        href: "https://zulip.example.com/#narrow/channel/1-a",
      }),
    ).toBeNull();
  });
});
