import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { initVisibilityTracking } from "~/shared/lib/visibility";
import { useSidebarProjectionSnapshot } from "./sidebar-projection.hook";

const RUNTIME: WorkspaceRuntimeContext = {
  accountId: "a",
  instanceId: "instance",
  organizationId: "org",
  projectId: "project",
  userUuid: "user",
  organizationOrigin: "https://workspace.invalid",
  accessToken: "test",
  runtimeGeneration: 1,
};
const OWNER = workspaceRuntimeOwnerKey(RUNTIME);
const ids = new Map<string, string>();
function id(name: string): string {
  const existing = ids.get(name);
  if (existing != null) return existing;
  const uuid = `00000000-0000-4000-8000-${(ids.size + 1).toString(16).padStart(12, "0")}`;
  ids.set(name, uuid);
  return uuid;
}
function stream(uuid: string): MessengerStream {
  return {
    uuid,
    projectId: "project",
    ownerUuid: "user",
    userUuid: "user",
    role: "owner",
    notificationMode: "all_messages",
    name: uuid,
    description: "",
    unreadCount: 0,
    sourceName: "native",
    audience: "channel",
    isPrivate: false,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: null,
    lastMessageUuid: null,
    createdAt: "2026-10-20T00:00:00Z",
    updatedAt: "2026-10-20T00:00:00Z",
  };
}
function add(name: string, owner = OWNER) {
  useMessengerStore.getState().upsertStream(owner, stream(id(name)));
}

let stopVisibilityTracking: () => void;
beforeEach(() => {
  stopVisibilityTracking = initVisibilityTracking();
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  useWorkspaceAuthStore.getState().clear();
  vi.spyOn(useWorkspaceAuthStore.getState(), "getCurrentRuntimeContext").mockReturnValue(RUNTIME);
  useMessengerStore.getState().startBootstrap(OWNER);
  useWorkspaceMessageStore.getState().setOwner(OWNER, false);
});
afterEach(() => {
  cleanup();
  stopVisibilityTracking();
  vi.restoreAllMocks();
  useMessengerStore.getState().clear();
  useWorkspaceMessageStore.getState().setOwner(null, false);
  useUsersStore.getState().clear();
  vi.useRealTimers();
});

describe("sidebar projection publication", () => {
  it("coalesces presentation while applying every canonical event immediately", () => {
    let renders = 0;
    const view = renderHook(() => {
      renders++;
      return useSidebarProjectionSnapshot(RUNTIME);
    });
    const before = renders;
    act(() => {
      for (let i = 0; i < 50; i++) add(`stream-${i}`);
    });
    expect(useMessengerStore.getState().streamIds).toHaveLength(50);
    expect(view.result.current.messenger.streamIds).toHaveLength(0);
    expect(renders).toBe(before);
    act(() => {
      vi.advanceTimersByTime(99);
    });
    expect(renders).toBe(before);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(view.result.current.messenger.streamIds).toHaveLength(50);
    expect(renders).toBe(before + 1);
    act(() => useMessengerStore.getState().setRealtimeCursor(OWNER, 500));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(renders).toBe(before + 1);
  });

  it("defers hidden presentation work and publishes the latest snapshot on visibility return", () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    let renders = 0;
    const view = renderHook(() => {
      renders++;
      return useSidebarProjectionSnapshot(RUNTIME);
    });
    const before = renders;
    act(() => {
      for (let i = 0; i < 100; i++) add(`hidden-${i}`);
    });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(renders).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => {
      fireEvent(document, new Event("visibilitychange"));
    });
    expect(view.result.current.messenger.streamIds).toHaveLength(100);
    expect(renders).toBe(before + 1);
  });

  it("flushes synchronous user writes without waiting for the publication timer", async () => {
    const view = renderHook(() => useSidebarProjectionSnapshot(RUNTIME));
    act(() => add("user-action"));
    expect(view.result.current.messenger.streamIds).toHaveLength(0);
    await act(async () => {
      fireEvent.click(document);
      await Promise.resolve();
    });
    expect(view.result.current.messenger.streamIds).toEqual([id("user-action")]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refreshes immediately for navigation, search and sort selection", () => {
    const view = renderHook(({ selection }) => useSidebarProjectionSnapshot(RUNTIME, selection), {
      initialProps: { selection: "folder-a" },
    });
    act(() => add("latest"));
    view.rerender({ selection: "folder-b" });
    expect(view.result.current.messenger.streamIds).toEqual([id("latest")]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels pending work on unmount and when the document becomes hidden", () => {
    const view = renderHook(() => useSidebarProjectionSnapshot(RUNTIME));
    act(() => add("pending"));
    expect(vi.getTimerCount()).toBe(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      fireEvent(document, new Event("visibilitychange"));
    });
    expect(vi.getTimerCount()).toBe(0);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => {
      fireEvent(document, new Event("visibilitychange"));
    });
    act(() => add("after-visibility"));
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("replaces owners immediately and never republishes a queued old catalog", () => {
    const next = { ...RUNTIME, accountId: "other", runtimeGeneration: 2 };
    const nextOwner = workspaceRuntimeOwnerKey(next);
    add("old");
    const view = renderHook(({ runtime }) => useSidebarProjectionSnapshot(runtime), {
      initialProps: { runtime: RUNTIME },
    });
    act(() => add("queued-old"));
    vi.mocked(useWorkspaceAuthStore.getState().getCurrentRuntimeContext).mockReturnValue(next);
    act(() => {
      useMessengerStore.getState().startBootstrap(nextOwner);
    });
    view.rerender({ runtime: next });
    expect(view.result.current.messenger.ownerKey).toBe(nextOwner);
    expect(view.result.current.messenger.streamIds).toEqual([]);
    act(() => add("new", nextOwner));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(view.result.current.messenger.streamIds).toEqual([id("new")]);
  });

  it("hides the previous catalog on logout even before the stores are cleared", () => {
    add("old");
    const view = renderHook<
      ReturnType<typeof useSidebarProjectionSnapshot>,
      { runtime: WorkspaceRuntimeContext | null }
    >(({ runtime }) => useSidebarProjectionSnapshot(runtime), {
      initialProps: { runtime: RUNTIME },
    });
    act(() => add("queued-old"));
    vi.mocked(useWorkspaceAuthStore.getState().getCurrentRuntimeContext).mockReturnValue(null);
    view.rerender({ runtime: null });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(useMessengerStore.getState().streamIds).toHaveLength(2);
    expect(view.result.current.messenger.streamIds).toEqual([]);
    expect(view.result.current.messenger.ownerKey).toBeNull();
  });

  it("fences A to B to A transitions and generation changes before delayed publication", () => {
    const a: WorkspaceRuntimeContext = {
      accountId: "a",
      instanceId: "instance",
      organizationId: "org",
      projectId: "project",
      userUuid: "user",
      organizationOrigin: "https://workspace.invalid",
      accessToken: "test",
      runtimeGeneration: 1,
    };
    const b = { ...a, accountId: "b", runtimeGeneration: 2 };
    let current: WorkspaceRuntimeContext | null = a;
    vi.spyOn(useWorkspaceAuthStore.getState(), "getCurrentRuntimeContext").mockImplementation(
      () => current,
    );
    const ownerA = workspaceRuntimeOwnerKey(a),
      ownerB = workspaceRuntimeOwnerKey(b);
    useMessengerStore.getState().startBootstrap(ownerA);
    add("old-a", ownerA);
    const view = renderHook(({ runtime }) => useSidebarProjectionSnapshot(runtime), {
      initialProps: { runtime: a },
    });
    act(() => add("queued-a", ownerA));
    current = b;
    view.rerender({ runtime: b });
    expect(view.result.current.messenger.streamIds).toEqual([]);
    act(() => {
      useMessengerStore.getState().startBootstrap(ownerB);
      add("b", ownerB);
    });
    current = { ...a, runtimeGeneration: 3 };
    view.rerender({ runtime: current });
    expect(view.result.current.messenger.streamIds).toEqual([]);
    act(() => {
      useMessengerStore.getState().startBootstrap(ownerA);
      add("new-a", ownerA);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(view.result.current.messenger.streamIds).toEqual([id("new-a")]);
    current = null;
    act(() => {
      vi.advanceTimersByTime(100);
    });
    view.rerender({ runtime: { ...a, runtimeGeneration: 4 } });
    expect(view.result.current.messenger.streamIds).toEqual([]);
  });
});
