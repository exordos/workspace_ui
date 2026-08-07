import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityStore, type ActivityUnreadMention } from "~/entities/activity/activity.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useLayoutUnreadMentionsBootstrap } from "./layout-unread-mentions-bootstrap.hook";

const fetchUnreadMentionsMock = vi.hoisted(() => vi.fn());

vi.mock("~/entities/activity/activity-mentions.api", () => ({
  fetchUnreadMentions: fetchUnreadMentionsMock,
}));

function createSession(overrides: Partial<WorkspaceAuthSession> = {}): WorkspaceAuthSession {
  return {
    accountId: "account-1",
    instanceId: "instance-1",
    organizationId: "organization-1",
    organizationOrigin: "https://workspace.example.com",
    projectId: "project-1",
    userUuid: "user-1",
    login: "user@example.com",
    accessToken: "token",
    refreshToken: "refresh",
    runtimeGeneration: 7,
    profile: {
      uuid: "user-1",
      username: "user",
      firstName: "User",
      lastName: null,
      email: "user@example.com",
    },
    ...overrides,
  };
}

function setSession(session: WorkspaceAuthSession): void {
  useWorkspaceAuthStore.setState({
    sessions: [session],
    currentAccountId: session.accountId,
    runtimeGeneration: session.runtimeGeneration,
  });
}

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  fetchUnreadMentionsMock.mockReset();
  useActivityStore.getState().clear();
  useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  useActivityStore.getState().clear();
  useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
});

describe("useLayoutUnreadMentionsBootstrap", () => {
  it("merges events received during the single owner bootstrap request", async () => {
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    setSession(session);
    let resolveSnapshot: ((mentions: ActivityUnreadMention[]) => void) | undefined;
    fetchUnreadMentionsMock.mockReturnValue(
      new Promise<ActivityUnreadMention[]>((resolve) => {
        resolveSnapshot = resolve;
      }),
    );

    renderHook(() => useLayoutUnreadMentionsBootstrap(session));
    await waitFor(() => expect(fetchUnreadMentionsMock).toHaveBeenCalledTimes(1));
    expect(useActivityStore.getState()).toMatchObject({
      unreadMentionsOwnerKey: ownerKey,
      unreadMentionsStatus: "loading",
      unreadMentionsCount: null,
    });

    act(() => {
      useActivityStore.getState().applyUnreadMentionMutation(ownerKey, session.runtimeGeneration, {
        kind: "upsert",
        epochVersion: 10,
        mention: {
          uuid: "message-live",
          streamUuid: "stream-1",
          topicUuid: "topic-1",
          createdAt: "2026-08-07T10:01:00Z",
        },
      });
      resolveSnapshot?.([
        {
          uuid: "message-snapshot",
          streamUuid: "stream-1",
          topicUuid: "topic-1",
          createdAt: "2026-08-07T10:00:00Z",
        },
      ]);
    });

    await waitFor(() => expect(useActivityStore.getState().unreadMentionsStatus).toBe("ready"));
    expect(useActivityStore.getState()).toMatchObject({
      unreadMentionsCount: 2,
      unreadMentionsByUuid: {
        "message-live": expect.any(Object),
        "message-snapshot": expect.any(Object),
      },
    });
  });

  it("retries a failed bootstrap and merges buffered events into the successful snapshot", async () => {
    vi.useFakeTimers();
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    setSession(session);
    fetchUnreadMentionsMock.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce([
      {
        uuid: "message-snapshot",
        streamUuid: "stream-1",
        topicUuid: "topic-1",
        createdAt: "2026-08-07T10:00:00Z",
      },
    ]);

    renderHook(() => useLayoutUnreadMentionsBootstrap(session));
    await flushPromises();

    expect(fetchUnreadMentionsMock).toHaveBeenCalledTimes(1);
    expect(useActivityStore.getState()).toMatchObject({
      unreadMentionsStatus: "loading",
      unreadMentionsCount: null,
    });

    act(() => {
      useActivityStore.getState().applyUnreadMentionMutation(ownerKey, session.runtimeGeneration, {
        kind: "upsert",
        epochVersion: 10,
        mention: {
          uuid: "message-live",
          streamUuid: "stream-1",
          topicUuid: "topic-1",
          createdAt: "2026-08-07T10:01:00Z",
        },
      });
      vi.advanceTimersByTime(1_000);
    });
    await flushPromises();

    expect(fetchUnreadMentionsMock).toHaveBeenCalledTimes(2);
    expect(useActivityStore.getState()).toMatchObject({
      unreadMentionsStatus: "ready",
      unreadMentionsCount: 2,
      unreadMentionsByUuid: {
        "message-live": expect.any(Object),
        "message-snapshot": expect.any(Object),
      },
    });
    vi.useRealTimers();
  });

  it("stays unknown until all retry attempts fail", async () => {
    vi.useFakeTimers();
    const session = createSession();
    setSession(session);
    fetchUnreadMentionsMock.mockRejectedValue(new Error("network"));

    renderHook(() => useLayoutUnreadMentionsBootstrap(session));
    await flushPromises();

    expect(useActivityStore.getState()).toMatchObject({
      unreadMentionsStatus: "loading",
      unreadMentionsCount: null,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });

    expect(fetchUnreadMentionsMock).toHaveBeenCalledTimes(3);
    expect(useActivityStore.getState().unreadMentionsStatus).toBe("error");
    expect(useActivityStore.getState().unreadMentionsCount).toBeNull();
    vi.useRealTimers();
  });

  it("cancels an old owner retry when the runtime scope changes", async () => {
    vi.useFakeTimers();
    const firstSession = createSession();
    const secondSession = createSession({ projectId: "project-2", runtimeGeneration: 8 });
    setSession(firstSession);
    fetchUnreadMentionsMock.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce([]);

    const { rerender } = renderHook(
      ({ session }: { session: WorkspaceAuthSession }) => useLayoutUnreadMentionsBootstrap(session),
      { initialProps: { session: firstSession } },
    );
    await flushPromises();
    expect(fetchUnreadMentionsMock).toHaveBeenCalledTimes(1);

    setSession(secondSession);
    rerender({ session: secondSession });
    await flushPromises();
    expect(fetchUnreadMentionsMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(fetchUnreadMentionsMock).toHaveBeenCalledTimes(2);
    expect(useActivityStore.getState()).toMatchObject({
      unreadMentionsOwnerKey: workspaceRuntimeOwnerKey(secondSession),
      unreadMentionsStatus: "ready",
      unreadMentionsCount: 0,
    });
    vi.useRealTimers();
  });

  it("cancels the request and pending retry on unmount", async () => {
    vi.useFakeTimers();
    const session = createSession();
    setSession(session);
    fetchUnreadMentionsMock.mockRejectedValueOnce(new Error("network"));

    const { unmount } = renderHook(() => useLayoutUnreadMentionsBootstrap(session));
    await flushPromises();
    expect(fetchUnreadMentionsMock).toHaveBeenCalledTimes(1);
    const firstSignal = fetchUnreadMentionsMock.mock.calls[0]?.[0]?.signal as
      | AbortSignal
      | undefined;

    unmount();
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(fetchUnreadMentionsMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
