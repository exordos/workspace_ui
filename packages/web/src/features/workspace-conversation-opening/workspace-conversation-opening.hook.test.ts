import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LoadMessengerConversationMessagesOptions,
  MessengerConversationMessagesResult,
} from "~/entities/messenger/messenger-messages-loader.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { useWorkspaceConversationOpening } from "./workspace-conversation-opening.hook";

const mocks = vi.hoisted(() => ({ load: vi.fn(), saved: vi.fn(() => null) }));
vi.mock("~/entities/messenger/messenger-messages-loader.lib", () => ({
  loadMessengerConversationMessages: mocks.load,
}));
vi.mock("~/entities/messenger/messenger-conversation-position.lib", () => ({
  readMessengerConversationPosition: mocks.saved,
}));
vi.mock("~/entities/workspace-auth/workspace-auth.model", () => ({
  useWorkspaceAuthStore: { getState: () => ({ getCurrentRuntimeContext: () => null }) },
}));

const runtime: WorkspaceRuntimeContext = {
  accountId: "account",
  instanceId: "instance",
  organizationId: "org",
  projectId: "project",
  userUuid: "user",
  organizationOrigin: "https://example.test",
  accessToken: "test",
  runtimeGeneration: 1,
};
const conversationId = "topic:stream:topic";
const applied: MessengerConversationMessagesResult = {
  status: "applied",
  ownerKey: "owner",
  conversationId,
  nextPageMarker: null,
  hasMore: false,
  pageLimit: 50,
};
const requests: {
  options: LoadMessengerConversationMessagesOptions;
  finish: (result: MessengerConversationMessagesResult) => void;
}[] = [];

beforeEach(() => {
  requests.length = 0;
  mocks.saved.mockReset().mockReturnValue(null);
  mocks.load.mockReset().mockImplementation(
    (options: LoadMessengerConversationMessagesOptions) =>
      new Promise<MessengerConversationMessagesResult>((finish) => {
        requests.push({ options, finish });
      }),
  );
});

function props(runtimeContext = runtime, retryNonce = 0) {
  return { runtimeContext, conversationId, enabled: true, retryNonce };
}

describe("conversation opening lifetime", () => {
  it("makes applied history ready before reactions and keeps it ready if reactions fail", async () => {
    const { result } = renderHook(() => useWorkspaceConversationOpening(props()));
    expect(result.current).toMatchObject({ pending: true, ready: false });
    act(() => requests[0]?.options.onServerWindowApplied?.());
    expect(result.current).toMatchObject({ pending: false, ready: true });
    await act(() => {
      requests[0]?.finish({
        status: "failed",
        ownerKey: "owner",
        conversationId,
        error: "reactions",
      });
      return Promise.resolve();
    });
    expect(result.current).toMatchObject({ ready: true, pending: false });
  });

  it("retains user ownership when fresh history arrives", () => {
    const { result } = renderHook(() => useWorkspaceConversationOpening(props()));
    act(() => result.current.takeControl());
    expect(requests[0]?.options.retainCurrentWindow?.()).toBe(true);
    expect(result.current).toMatchObject({ cancelled: true, ready: false });
    act(() => requests[0]?.options.onServerWindowApplied?.());
    expect(result.current).toMatchObject({ cancelled: true, ready: true });
  });

  it("does not reclaim the viewport on retry after failure", async () => {
    const { result, rerender } = renderHook(useWorkspaceConversationOpening, {
      initialProps: props(),
    });
    await act(() => {
      requests[0]?.finish({
        status: "failed",
        ownerKey: "owner",
        conversationId,
        error: "offline",
      });
      return Promise.resolve();
    });
    expect(result.current).toMatchObject({ pending: false, cancelled: true, ready: false });
    rerender(props(runtime, 1));
    expect(requests[1]?.options.retainCurrentWindow?.()).toBe(true);
    expect(requests[1]?.options.resolveUnreadBoundary).toBe(true);
    act(() => requests[1]?.options.onServerWindowApplied?.());
    expect(result.current).toMatchObject({ cancelled: true, ready: true });
  });

  it("rejects the first A request after A to B to A within the same runtime", async () => {
    const { result, rerender, unmount } = renderHook(useWorkspaceConversationOpening, {
      initialProps: props(),
    });
    act(() => result.current.takeControl());
    rerender({ ...props(), conversationId: "topic:stream:other" });
    expect(requests[0]?.options.signal?.aborted).toBe(true);
    rerender(props(runtime));
    expect(requests[1]?.options.signal?.aborted).toBe(true);
    await act(() => {
      requests[0]?.options.onServerWindowApplied?.();
      requests[0]?.finish(applied);
      return Promise.resolve();
    });
    expect(result.current).toMatchObject({ pending: true, cancelled: false, ready: false });
    unmount();
    expect(requests[2]?.options.signal?.aborted).toBe(true);
  });
  it("rejects old opening completion when the runtime generation changes", async () => {
    const { result, rerender, unmount } = renderHook(useWorkspaceConversationOpening, {
      initialProps: props(),
    });
    act(() => result.current.takeControl());
    rerender(props({ ...runtime, runtimeGeneration: 2 }));
    expect(requests[0]?.options.signal?.aborted).toBe(true);
    await act(() => {
      requests[0]?.options.onServerWindowApplied?.();
      requests[0]?.finish(applied);
      return Promise.resolve();
    });
    expect(result.current).toMatchObject({ pending: true, cancelled: false, ready: false });
    act(() => requests[1]?.options.onServerWindowApplied?.());
    expect(result.current).toMatchObject({ pending: false, cancelled: false, ready: true });
    unmount();
    expect(requests[1]?.options.signal?.aborted).toBe(true);
  });
});
