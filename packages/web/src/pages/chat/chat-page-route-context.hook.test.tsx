import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    const { result } = renderHook(() =>
      useChatRouteContext({
        streamSlug: undefined,
        topicName: undefined,
        dmIdParam: "20-bob",
        location: {
          pathname: "/org/example.com/dm/20-bob",
          search: "?msg=999&forward=888",
          hash: "",
          state: null,
          key: "test",
        },
        streamsMap: new Map(),
        dmsFromStore: [],
        currentUserId: 10,
      }),
    );

    expect(result.current.focusedMessageId).toBe(999);
    expect(result.current.forwardMessageId).toBe(888);
    expect(result.current.isDmView).toBe(true);
  });

  it("preserves unresolved stream name for name-only routes", () => {
    const { result } = renderHook(() =>
      useChatRouteContext({
        streamSlug: "Engineering",
        topicName: encodeURIComponent("bugs"),
        dmIdParam: undefined,
        location: {
          pathname: "/org/example.com/stream/Engineering/topic/bugs",
          search: "",
          hash: "",
          state: null,
          key: "test",
        },
        streamsMap: new Map(),
        dmsFromStore: [],
        currentUserId: 42,
      }),
    );

    expect(result.current.resolvedStreamId).toBeNull();
    expect(result.current.isUnresolvedStreamRoute).toBe(true);
    expect(result.current.unresolvedStreamName).toBe("Engineering");
    expect(result.current.unresolvedLocalStreamMatch).toBeNull();
    expect(result.current.activeStream).toBe("Engineering");
    expect(result.current.activeTopic).toBe("bugs");
  });

  it("reuses one local unresolved stream match for header and resolution", () => {
    const { result } = renderHook(() =>
      useChatRouteContext({
        streamSlug: "Engineering",
        topicName: undefined,
        dmIdParam: undefined,
        location: {
          pathname: "/org/example.com/stream/Engineering",
          search: "",
          hash: "",
          state: null,
          key: "test",
        },
        streamsMap: new Map([[10, { name: "Engineering" }]]),
        dmsFromStore: [],
        currentUserId: 42,
      }),
    );

    expect(result.current.resolvedStreamId).toBeNull();
    expect(result.current.unresolvedLocalStreamMatch).toEqual({
      streamId: 10,
      streamName: "Engineering",
    });
    expect(result.current.activeStream).toBe("Engineering");
  });
});
