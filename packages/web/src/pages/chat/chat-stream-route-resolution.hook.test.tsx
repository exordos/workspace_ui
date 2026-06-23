import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { resolveStreamIdByName } from "~/shared/api/zulip-streams";
import {
  useChatStreamRouteResolution,
  type UseChatStreamRouteResolutionResult,
} from "./chat-stream-route-resolution.hook";

vi.mock("~/shared/api/zulip-streams", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/zulip-streams")>();
  return {
    ...actual,
    resolveStreamIdByName: vi.fn(),
  };
});

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
    expect(resolveStreamIdByName).not.toHaveBeenCalled();
    expect(result.current.routeResolveError).toBeNull();
  });

  it("resolves unknown stream via API and canonizes route", async () => {
    const navigate = vi.fn();
    vi.mocked(resolveStreamIdByName).mockResolvedValue({ ok: true, streamId: 77 });

    const { result } = renderHook(() =>
      useChatStreamRouteResolution({
        unresolvedStreamName: "Unknown",
        unresolvedLocalStreamMatch: null,
        hasExplicitTopicRoute: true,
        activeTopic: "Bugs",
        locationSearch: "?msg=15",
        navigate,
      }),
    );

    await waitFor(() => {
      expect(resolveStreamIdByName).toHaveBeenCalledWith("Unknown");
      expect(navigate).toHaveBeenCalledWith("/stream/77-unknown/topic/Bugs?msg=15", {
        replace: true,
      });
    });
    expect(useChatListStore.getState().streamsMap.get(77)?.name).toBe("Unknown");
    expect(result.current.routeResolveError).toBeNull();
  });

  it("keeps route and reports error when stream cannot be resolved", async () => {
    const navigate = vi.fn();
    vi.mocked(resolveStreamIdByName).mockResolvedValue({ ok: false, kind: "not_found" });

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
      expect(result.current.routeResolveError).toBe("Channel not found or unavailable");
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("clears route resolve error via dismiss callback", async () => {
    vi.mocked(resolveStreamIdByName).mockResolvedValue({ ok: false, kind: "not_found" });

    const { result } = renderHook(() =>
      useChatStreamRouteResolution({
        unresolvedStreamName: "Missing",
        unresolvedLocalStreamMatch: null,
        hasExplicitTopicRoute: false,
        activeTopic: undefined,
        locationSearch: "",
        navigate: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(result.current.routeResolveError).toBe("Channel not found or unavailable");
    });

    act(() => {
      result.current.dismissRouteResolveError();
    });

    await waitFor(() => {
      expect(result.current.routeResolveError).toBeNull();
    });
  });

  it("ignores stale response after route changes", async () => {
    const navigate = vi.fn();
    let resolveFirst: ((value: { ok: true; streamId: number }) => void) | null = null;
    vi.mocked(resolveStreamIdByName).mockImplementation(
      () =>
        new Promise<{ ok: true; streamId: number }>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const { result, rerender } = renderHook<
      UseChatStreamRouteResolutionResult,
      { unresolvedStreamName: string | null; locationSearch: string }
    >(
      ({ unresolvedStreamName, locationSearch }) =>
        useChatStreamRouteResolution({
          unresolvedStreamName,
          unresolvedLocalStreamMatch: null,
          hasExplicitTopicRoute: false,
          activeTopic: undefined,
          locationSearch,
          navigate,
        }),
      {
        initialProps: { unresolvedStreamName: "Unknown", locationSearch: "" },
      },
    );

    rerender({ unresolvedStreamName: null, locationSearch: "" });
    const finishResolve = resolveFirst as ((value: { ok: true; streamId: number }) => void) | null;
    expect(finishResolve).not.toBeNull();
    if (finishResolve != null) {
      finishResolve({ ok: true, streamId: 77 });
    }

    await waitFor(() => {
      expect(result.current.routeResolveError).toBeNull();
    });
    expect(navigate).not.toHaveBeenCalled();
  });
});
