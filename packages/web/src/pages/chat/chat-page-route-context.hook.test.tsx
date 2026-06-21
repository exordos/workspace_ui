import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import { useChatRouteContext } from "./chat-page-route-context.hook";

describe("useChatRouteContext", () => {
  it("resolves stream topic route context", () => {
    const streamsMap = new Map<number, { name: string }>([[10, { name: "general" }]]);
    const { result } = renderHook(() =>
      useChatRouteContext({
        streamSlug: "10-general",
        topicName: encodeURIComponent("bugs"),
        dmIdParam: undefined,
        location: {
          pathname: "/org/example.com/stream/10-general/topic/bugs",
          search: "",
          hash: "",
          state: null,
          key: "test",
        },
        streamsMap,
        dmsFromStore: [],
        currentUserId: 42,
      }),
    );

    expect(result.current.resolvedStreamId).toBe(10);
    expect(result.current.activeTopic).toBe("bugs");
    expect(result.current.isDmView).toBe(false);
  });

  it("parses focused and forward message ids from query", () => {
    const focusedId = testMessageId(999);
    const forwardId = testMessageId(888);
    const { result } = renderHook(() =>
      useChatRouteContext({
        streamSlug: undefined,
        topicName: undefined,
        dmIdParam: "20-bob",
        location: {
          pathname: "/org/example.com/dm/20-bob",
          search: `?msg=${focusedId}&forward=${forwardId}`,
          hash: "",
          state: null,
          key: "test",
        },
        streamsMap: new Map(),
        dmsFromStore: [],
        currentUserId: 10,
      }),
    );

    expect(result.current.focusedMessageId).toBe(focusedId);
    expect(result.current.forwardMessageId).toBe(forwardId);
    expect(result.current.isDmView).toBe(true);
  });

  it("treats stream-backed DM route as DM view without peer ids", () => {
    const streamUuid = "1a4e14ff-436e-4552-8a81-ed838425e1fc";
    const { result } = renderHook(() =>
      useChatRouteContext({
        streamSlug: undefined,
        topicName: undefined,
        dmIdParam: streamUuid,
        location: {
          pathname: "/org/example.com/dm/" + streamUuid,
          search: "",
          hash: "",
          state: null,
          key: "test",
        },
        streamsMap: new Map(),
        dmsFromStore: [
          {
            type: "dm",
            id: 1,
            name: "Alice",
            slug: streamUuid,
            streamUuid,
            lastMessage: "",
            time: "",
            unreadCount: 0,
          },
        ],
        currentUserId: "00000000-0000-4000-8000-000000000001",
      }),
    );

    expect(result.current.isDmView).toBe(true);
    expect(result.current.dmRecipientIds).toEqual([]);
    expect(result.current.dmKey).toBe(streamUuid);
    expect(result.current.dmChat?.streamUuid).toBe(streamUuid);
  });
});
