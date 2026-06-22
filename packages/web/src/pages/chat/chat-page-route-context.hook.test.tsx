import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import { useChatRouteContext } from "./chat-page-route-context.hook";

describe("useChatRouteContext", () => {
  it("resolves stream topic route context", () => {
    const streamUuid = "550e8400-e29b-41d4-a716-446655440000";
    const streamsMap = new Map<string, { name: string }>([[streamUuid, { name: "general" }]]);
    const { result } = renderHook(() =>
      useChatRouteContext({
        streamSlug: streamUuid,
        topicName: encodeURIComponent("bugs"),
        dmIdParam: undefined,
        location: {
          pathname: `/org/example.com/stream/${streamUuid}/topic/bugs`,
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

    expect(result.current.resolvedStreamId).toBe(streamUuid);
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
});
