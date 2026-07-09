import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useChatStreamRouteResolution } from "./chat-stream-route-resolution.hook";

describe("useChatStreamRouteResolution", () => {
  afterEach(() => {
    useChatListStore.getState().clear();
    vi.clearAllMocks();
  });

  it("replaces name-only route immediately when local stream metadata exists", async () => {
    const navigate = vi.fn();
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 10, name: "Engineering" }]);

    const { result } = renderHook(() =>
      useChatStreamRouteResolution({
        unresolvedStreamName: "Engineering",
        unresolvedLocalStreamMatch: { streamId: 10, streamName: "Engineering" },
        hasExplicitTopicRoute: true,
        activeTopic: "Bugs",
        locationSearch: "?msg=15&forward=7",
        navigate,
      }),
    );

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/stream/10-engineering/topic/Bugs?msg=15&forward=7", {
        replace: true,
      });
    });
    expect(result.current.routeResolveError).toBeNull();
  });

  it("keeps route and reports transient error when local stream metadata is missing", async () => {
    const navigate = vi.fn();

    const { result } = renderHook(() =>
      useChatStreamRouteResolution({
        unresolvedStreamName: "Missing",
        unresolvedLocalStreamMatch: null,
        hasExplicitTopicRoute: false,
        activeTopic: undefined,
        locationSearch: "",
        navigate,
      }),
    );

    await waitFor(() => {
      expect(result.current.routeResolveError).toBe("Could not open channel right now");
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("clears route resolve error via dismiss callback", async () => {
    const navigate = vi.fn();
    const { result } = renderHook(() =>
      useChatStreamRouteResolution({
        unresolvedStreamName: "Missing",
        unresolvedLocalStreamMatch: null,
        hasExplicitTopicRoute: false,
        activeTopic: undefined,
        locationSearch: "",
        navigate,
      }),
    );

    await waitFor(() => {
      expect(result.current.routeResolveError).toBe("Could not open channel right now");
    });

    act(() => {
      result.current.dismissRouteResolveError();
    });

    await waitFor(() => {
      expect(result.current.routeResolveError).toBeNull();
    });
  });
});
