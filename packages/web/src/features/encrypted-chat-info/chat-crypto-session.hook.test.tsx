import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { acquireChatCryptoSession } from "~/entities/messenger/chat-crypto-session.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerMessage, MessengerStream } from "~/entities/messenger/messenger.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useChatCryptoSession } from "./chat-crypto-session.hook";

const open = vi.hoisted(() => vi.fn());
vi.mock("~/entities/messenger/chat-crypto-runtime.lib", () => ({ openRealChatSession: open }));
const streamUuid = "11111111-1111-4111-8111-111111111111";
function seed() {
  useWorkspaceAuthStore.getState().setSession({
    accountId: "account",
    instanceId: "instance",
    organizationId: "org",
    organizationOrigin: "http://127.0.0.1:9100",
    projectId: "project-a",
    userUuid: "author",
    accessToken: "token",
    refreshToken: "refresh",
    login: "test@example.com",
    profile: {
      uuid: "author",
      username: "author",
      firstName: "Test",
      lastName: "User",
      email: "test@example.com",
    },
  });
  const runtime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
  if (!runtime) throw new Error("Missing runtime");
  const owner = workspaceRuntimeOwnerKey(runtime);
  const stream: MessengerStream = {
    uuid: streamUuid,
    projectId: "project-a",
    ownerUuid: "author",
    userUuid: "author",
    role: "owner",
    notificationMode: "all_messages",
    name: "encrypted",
    description: "",
    unreadCount: 0,
    sourceName: "native",
    source: { kind: "native" },
    audience: "channel",
    isPrivate: true,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: null,
    lastMessageUuid: null,
    createdAt: "2026-10-02T00:00:00Z",
    updatedAt: "2026-10-02T00:00:00Z",
    encryption: true,
    currentEncryptionKey: { keyUuid: "key" },
  };
  useMessengerStore.getState().startBootstrap(owner);
  useMessengerStore.getState().upsertStream(owner, stream);
  useWorkspaceMessageStore.getState().setOwner(owner, false);
}
function session() {
  const listeners = new Set<() => void>();
  let pending = false;
  let sendKeyUuid = "key";
  return {
    emit: () => {
      for (const listener of listeners) listener();
    },
    setPending: (value: boolean) => {
      pending = value;
      for (const listener of listeners) listener();
    },
    setSendKeyUuid: (value: string) => {
      sendKeyUuid = value;
      for (const listener of listeners) listener();
    },
    listLocalKeys: vi.fn().mockResolvedValue([]),
    removeLocalKey: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(undefined),
    ingest: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
    dispose: vi.fn(),
    getState: () => ({ access: "ready", pending, requestStatus: "idle", error: null, sendKeyUuid }),
    requestKey: vi.fn().mockResolvedValue(undefined),
    reissueKey: vi.fn().mockResolvedValue(undefined),
    grantAllKeys: vi.fn().mockResolvedValue([]),
    grantKey: vi.fn().mockResolvedValue(undefined),
    rejectKey: vi.fn().mockResolvedValue(undefined),
  };
}
afterEach(() => {
  cleanup();
  useWorkspaceAuthStore.getState().clear();
  useMessengerStore.getState().clear();
  useWorkspaceMessageStore.getState().clear();
  open.mockReset();
});
describe("real chat session ownership", () => {
  it("reports local deletion success and a failed repeated request", async () => {
    seed();
    const active = session();
    open.mockResolvedValue(active);
    const view = renderHook(() => useChatCryptoSession(streamUuid));
    await waitFor(() => expect(view.result.current.session).toBe(active));
    await act(async () => {
      expect(await view.result.current.removeLocalKey("historical-key")).toBe(true);
    });
    expect(active.removeLocalKey).toHaveBeenCalledWith("historical-key");
    active.requestKey.mockRejectedValue(new Error("offline"));
    await act(async () => {
      expect(await view.result.current.requestKey("historical-key")).toBe(false);
    });
    expect(view.result.current.error).not.toBeNull();
    active.requestKey.mockResolvedValue(undefined);
    await act(async () => {
      expect(await view.result.current.requestKey("historical-key")).toBe(true);
    });
    expect(view.result.current.error).toBeNull();
  });

  it("forwards the requested historical generation and exposes a missing-metadata error", async () => {
    seed();
    const active = session();
    active.requestKey.mockRejectedValue(new Error("historical-key-unavailable"));
    open.mockResolvedValue(active);
    const view = renderHook(() => useChatCryptoSession(streamUuid));
    await waitFor(() => expect(view.result.current.session).toBe(active));
    await act(async () => {
      await view.result.current.requestKey("historical-key");
    });
    expect(active.requestKey).toHaveBeenCalledWith("historical-key");
    expect(view.result.current.error).toBe(
      "Key information for this message is unavailable. Load the chat history and try again.",
    );
  });
  it("shares one controller between page and panel until the final consumer leaves", async () => {
    seed();
    const active = session();
    open.mockResolvedValue(active);
    const page = renderHook(() => useChatCryptoSession(streamUuid));
    const panel = renderHook(() => useChatCryptoSession(streamUuid));
    await waitFor(() => expect(page.result.current.session).toBe(active));
    await waitFor(() => expect(panel.result.current.session).toBe(active));
    expect(open).toHaveBeenCalledOnce();
    expect(active.load).toHaveBeenCalledOnce();
    expect(active.ingest).toHaveBeenCalledOnce();
    page.unmount();
    expect(active.dispose).not.toHaveBeenCalled();
    panel.unmount();
    await waitFor(() => expect(active.dispose).toHaveBeenCalledOnce());
    expect(open.mock.calls[0]?.[0].signal.aborted).toBe(true);
  });
  it("disposes a late open after logout without publishing a session", async () => {
    seed();
    const active = session();
    let complete: ((value: ReturnType<typeof session>) => void) | undefined;
    open.mockReturnValue(
      new Promise<ReturnType<typeof session>>((resolve) => {
        complete = resolve;
      }),
    );
    const view = renderHook(() => useChatCryptoSession(streamUuid));
    act(() => useWorkspaceAuthStore.getState().clear());
    await act(async () => {
      complete?.(active);
      await Promise.resolve();
    });
    await waitFor(() => expect(active.dispose).toHaveBeenCalledOnce());
    expect(view.result.current.session).toBeNull();
    expect(view.result.current.loading).toBe(false);
  });
  it("ignores a failed operation from an old session after the same scope remounts", async () => {
    seed();
    const old = session();
    let reject: ((reason: Error) => void) | undefined;
    old.requestKey.mockReturnValue(
      new Promise((_, failure) => {
        reject = failure;
      }),
    );
    const next = session();
    open.mockResolvedValueOnce(old).mockResolvedValueOnce(next);
    const first = renderHook(() => useChatCryptoSession(streamUuid));
    await waitFor(() => expect(first.result.current.session).toBe(old));
    const request = first.result.current.requestKey();
    first.unmount();
    const second = renderHook(() => useChatCryptoSession(streamUuid));
    await waitFor(() => expect(second.result.current.session).toBe(next));
    await act(async () => {
      reject?.(new Error("late"));
      await request;
    });
    expect(second.result.current.error).toBeNull();
  });
  it("keeps the shared session and receives state without ingesting again on generation changes", async () => {
    seed();
    const active = session();
    let complete: (() => void) | undefined;
    active.reissueKey.mockImplementation(() => {
      active.setPending(true);
      return new Promise<void>((resolve) => {
        complete = () => {
          active.setPending(false);
          resolve();
        };
      });
    });
    const next = session();
    open.mockResolvedValueOnce(active).mockResolvedValueOnce(next);
    const view = renderHook(() => useChatCryptoSession(streamUuid));
    await waitFor(() => expect(view.result.current.session).toBe(active));
    let rotation: Promise<boolean> | undefined;
    act(() => {
      rotation = view.result.current.reissueKey();
    });
    expect(active.reissueKey).toHaveBeenCalledOnce();
    expect(view.result.current.state.pending).toBe(true);
    expect(view.result.current.session).toBe(active);
    await act(async () => {
      const catalog = useMessengerStore.getState();
      const existing = catalog.streamsById[streamUuid];
      if (!existing || !catalog.ownerKey) throw new Error("Missing stream");
      catalog.upsertStream(catalog.ownerKey, {
        ...existing,
        currentEncryptionKey: { keyUuid: "key-v2" },
      });
      active.setSendKeyUuid("key-v2");
      complete?.();
      expect(await rotation).toBe(true);
    });
    expect(active.ingest).toHaveBeenCalledOnce();
    expect(view.result.current.sendKeyUuid).toBe("key-v2");
    expect(view.result.current.session).toBe(active);
    expect(active.dispose).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledOnce();
    expect(view.result.current.error).toBeNull();
    const announcement: MessengerMessage = {
      uuid: "22222222-2222-4222-8222-222222222222",
      conversationId: `stream:${streamUuid}`,
      projectId: "project-a",
      streamUuid,
      topicUuid: "33333333-3333-4333-8333-333333333333",
      authorUuid: "author",
      userUuid: "author",
      payload: { kind: "key_announced", keyUuid: "key-v2" },
      read: false,
      pinned: false,
      starred: false,
      isOwn: true,
      reactions: {},
      reactionUserUuidsByEmojiName: {},
      ownReactionUuidsByEmojiName: {},
      createdAt: "2026-10-08T00:00:00Z",
      updatedAt: "2026-10-08T00:00:00Z",
    };
    act(() => useWorkspaceMessageStore.getState().applyLiveCreatedMessage(announcement));
    await waitFor(() => expect(active.ingest).toHaveBeenCalledTimes(2));
    expect(active.ingest).toHaveBeenLastCalledWith([announcement]);
  });
  it("keeps a failed rotation retryable", async () => {
    seed();
    const active = session();
    active.reissueKey.mockRejectedValueOnce(new Error("network"));
    open.mockResolvedValue(active);
    const view = renderHook(() => useChatCryptoSession(streamUuid));
    await waitFor(() => expect(view.result.current.session).toBe(active));
    await act(async () => {
      expect(await view.result.current.reissueKey()).toBe(false);
    });
    expect(view.result.current.error).not.toBeNull();
    await act(async () => {
      expect(await view.result.current.reissueKey()).toBe(true);
    });
    expect(view.result.current.error).toBeNull();
  });
  it("reports only failed batch requests and clears their error after a successful retry", async () => {
    seed();
    const active = session();
    active.grantAllKeys.mockResolvedValue([
      { requestMessageUuid: "granted", status: "granted" },
      { requestMessageUuid: "failed", status: "failed" },
    ]);
    open.mockResolvedValue(active);
    const view = renderHook(() => useChatCryptoSession(streamUuid));
    await waitFor(() => expect(view.result.current.session).toBe(active));
    await act(async () => {
      await view.result.current.grantAllKeys();
    });
    expect(Object.keys(view.result.current.requestErrors)).toEqual(["failed"]);
    expect(view.result.current.error).toContain("1 requests");
    await act(async () => {
      await view.result.current.grantKey("failed");
    });
    expect(view.result.current.requestErrors).toEqual({});
    expect(view.result.current.error).toBeNull();
  });
  it("discards a late batch failure after switching runtime owners", async () => {
    seed();
    const active = session();
    let complete: ((value: { requestMessageUuid: string; status: string }[]) => void) | undefined;
    active.grantAllKeys.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const next = session();
    open.mockResolvedValueOnce(active).mockResolvedValueOnce(next);
    const view = renderHook(() => useChatCryptoSession(streamUuid));
    await waitFor(() => expect(view.result.current.session).toBe(active));
    const batch = view.result.current.grantAllKeys();
    act(() => {
      useWorkspaceAuthStore.getState().clear();
      seed();
    });
    await waitFor(() => expect(view.result.current.session).toBe(next));
    await act(async () => {
      complete?.([{ requestMessageUuid: "old", status: "failed" }]);
      await batch;
    });
    expect(view.result.current.requestErrors).toEqual({});
    expect(view.result.current.error).toBeNull();
  });
  it("preserves failed rows across domain emissions, unrelated actions, and a later partial batch", async () => {
    seed();
    const active = session();
    active.grantAllKeys
      .mockResolvedValueOnce([
        { requestMessageUuid: "failed-a", status: "failed" },
        { requestMessageUuid: "failed-b", status: "failed" },
      ])
      .mockResolvedValueOnce([{ requestMessageUuid: "failed-a", status: "granted" }]);
    active.grantKey.mockImplementation(() => {
      active.setPending(true);
      active.setPending(false);
      return Promise.resolve();
    });
    open.mockResolvedValue(active);
    const view = renderHook(() => useChatCryptoSession(streamUuid));
    await waitFor(() => expect(view.result.current.session).toBe(active));
    await act(async () => {
      await view.result.current.grantAllKeys();
    });
    act(() => active.emit());
    expect(Object.keys(view.result.current.requestErrors)).toEqual(["failed-a", "failed-b"]);
    await act(async () => {
      await view.result.current.grantKey("unrelated");
    });
    expect(Object.keys(view.result.current.requestErrors)).toEqual(["failed-a", "failed-b"]);
    expect(view.result.current.error).toContain("2 requests");
    await act(async () => {
      await view.result.current.grantAllKeys();
    });
    expect(Object.keys(view.result.current.requestErrors)).toEqual(["failed-b"]);
    expect(view.result.current.error).toContain("1 requests");
  });
});

describe("shared domain session leases", () => {
  function acquire() {
    const runtime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
    if (!runtime) throw new Error("Missing runtime");
    return acquireChatCryptoSession(runtime, streamUuid);
  }

  it("keeps accepted ingestion when its caller leaves but another consumer remains", async () => {
    seed();
    const active = session();
    let complete: (() => void) | undefined;
    active.load.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    open.mockResolvedValue(active);
    const first = acquire();
    const second = acquire();
    const ingestion = first.ingest([]);
    await second.ingest([]);
    first.release();
    first.release();
    await waitFor(() => expect(complete).toBeDefined());
    complete?.();
    await ingestion;
    expect(active.ingest).toHaveBeenCalledOnce();
    expect(active.dispose).not.toHaveBeenCalled();
    second.release();
    await waitFor(() => expect(active.dispose).toHaveBeenCalledOnce());
  });

  it("skips pending ingestion after the final consumer leaves", async () => {
    seed();
    const active = session();
    open.mockResolvedValue(active);
    const lease = acquire();
    const ingestion = lease.ingest([]);
    lease.release();
    await ingestion;
    expect(active.ingest).not.toHaveBeenCalled();
    await waitFor(() => expect(active.dispose).toHaveBeenCalledOnce());
  });

  it("allows another consumer to retry a failed ingestion", async () => {
    seed();
    const active = session();
    active.ingest.mockRejectedValueOnce(new Error("offline"));
    open.mockResolvedValue(active);
    const first = acquire();
    const second = acquire();
    await expect(first.ingest([])).rejects.toThrow("offline");
    await second.ingest([]);
    expect(active.ingest).toHaveBeenCalledTimes(2);
    first.release();
    second.release();
  });

  it("disposes a failed load once and opens a fresh session after release", async () => {
    seed();
    const active = session();
    active.load.mockRejectedValue(new Error("offline"));
    const next = session();
    open.mockResolvedValueOnce(active).mockResolvedValueOnce(next);
    const failed = acquire();
    await expect(failed.promise).rejects.toThrow("offline");
    failed.release();
    const fresh = acquire();
    await expect(fresh.promise).resolves.toBe(next);
    expect(active.dispose).toHaveBeenCalledOnce();
    fresh.release();
  });

  it("does not render an inactive hook when the message store changes", () => {
    seed();
    const render = vi.fn();
    renderHook(() => {
      render();
      return useChatCryptoSession(null);
    });
    const count = render.mock.calls.length;
    act(() => useWorkspaceMessageStore.setState({ messagesById: {} }));
    expect(render).toHaveBeenCalledTimes(count);
    expect(open).not.toHaveBeenCalled();
  });
});
