import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { acquireChatCryptoSession } from "~/entities/messenger/chat-crypto-session.lib";
import type { ChatE2eeControllerState } from "~/entities/messenger/chat-e2ee-controller.types";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerMessage, MessengerStream } from "~/entities/messenger/messenger.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { writeText } from "~/shared/lib/clipboard";
import { toast } from "~/shared/lib/toast/toast";
import { useChatCryptoSession } from "./chat-crypto-session.hook";
import { useEncryptedChatInfo } from "./encrypted-chat-info.hook";

const open = vi.hoisted(() => vi.fn());
vi.mock("~/entities/messenger/chat-crypto-runtime.lib", () => ({ openRealChatSession: open }));
vi.mock("~/shared/lib/toast/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("~/shared/lib/clipboard", () => ({ writeText: vi.fn().mockResolvedValue(true) }));
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
    getState: (): ChatE2eeControllerState & { sendKeyUuid: string } => ({
      access: "ready",
      pending,
      requestStatus: "idle",
      error: null,
      sendKeyUuid,
    }),
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
  vi.mocked(toast.error).mockClear();
  vi.mocked(writeText).mockReset().mockResolvedValue(true);
});
describe("real chat session ownership", () => {
  it.each([
    ["requestKey", "Could not send the key request. Please try again."],
    ["grantKey", "Could not send the key to the participant. Please try again."],
    ["rejectKey", "Could not reject the key request. Please try again."],
  ] as const)(
    "toasts a specific failure only for the invoked %s action",
    async (action, message) => {
      seed();
      const active = session();
      active[action].mockRejectedValue(new Error("opaque server failure"));
      open.mockResolvedValue(active);
      const page = renderHook(() => useChatCryptoSession(streamUuid));
      const panel = renderHook(() => useChatCryptoSession(streamUuid));
      await waitFor(() => expect(page.result.current.session).toBe(active));
      await waitFor(() => expect(panel.result.current.session).toBe(active));
      await act(async () => {
        await page.result.current[action]("key-or-request");
      });
      expect(toast.error).toHaveBeenCalledExactlyOnceWith(message);
      act(() => active.emit());
      expect(toast.error).toHaveBeenCalledOnce();
    },
  );

  it.each(["reissueKey", "removeLocalKey"] as const)(
    "keeps a failed %s operation in its dialog without a toast",
    async (action) => {
      seed();
      const active = session();
      active[action].mockRejectedValue(new Error("operation failed"));
      open.mockResolvedValue(active);
      const view = renderHook(() => useChatCryptoSession(streamUuid));
      await waitFor(() => expect(view.result.current.session).toBe(active));
      await act(async () => {
        if (action === "removeLocalKey") await view.result.current.removeLocalKey("key");
        else await view.result.current.reissueKey();
      });
      expect(view.result.current.error).toBe(
        action === "removeLocalKey"
          ? "Could not delete the key from this device. Please try again."
          : "Could not reissue the encryption key. Please try again.",
      );
      expect(toast.error).not.toHaveBeenCalled();
    },
  );

  it("toasts a failed whole batch once and stays quiet after a successful retry", async () => {
    seed();
    const active = session();
    active.grantAllKeys
      .mockRejectedValueOnce(new Error("opaque failure"))
      .mockResolvedValueOnce([]);
    open.mockResolvedValue(active);
    const view = renderHook(() => useChatCryptoSession(streamUuid));
    await waitFor(() => expect(view.result.current.session).toBe(active));
    await act(async () => {
      expect(await view.result.current.grantAllKeys()).toBe(false);
    });
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "Could not send the key to participants. Please try again.",
    );
    await act(async () => {
      expect(await view.result.current.grantAllKeys()).toBe(true);
    });
    expect(toast.error).toHaveBeenCalledOnce();
  });

  it.each(["opening", "ingestion", "state"])(
    "does not turn a background %s error into a toast",
    async (source) => {
      seed();
      const active = session();
      if (source === "opening") open.mockRejectedValue(new Error("unavailable"));
      else open.mockResolvedValue(active);
      if (source === "ingestion")
        active.ingest.mockRejectedValueOnce(new Error("background error"));
      const view = renderHook(() => useChatCryptoSession(streamUuid));
      if (source === "state") {
        await waitFor(() => expect(view.result.current.session).toBe(active));
        vi.spyOn(active, "getState").mockReturnValue({
          ...active.getState(),
          error: "storage-failed",
        });
        act(() => active.emit());
      }
      await waitFor(() => expect(view.result.current.error).not.toBeNull());
      if (source === "ingestion") {
        act(() => active.emit());
        expect(view.result.current.error).not.toBeNull();
        await act(async () => {
          useWorkspaceMessageStore.setState({ messagesById: {} });
          await Promise.resolve();
        });
        expect(active.ingest).toHaveBeenCalledTimes(2);
        expect(view.result.current.error).toBeNull();
      }
      expect(toast.error).not.toHaveBeenCalled();
    },
  );
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
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
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
    expect(toast.error).not.toHaveBeenCalled();
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
    expect(view.result.current.error).toContain("Requests to retry: 1");
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "Could not send the key. Requests to retry: 1.",
    );
    await act(async () => {
      await view.result.current.grantKey("failed");
    });
    expect(view.result.current.requestErrors).toEqual({});
    expect(view.result.current.error).toBeNull();
    expect(toast.error).toHaveBeenCalledOnce();
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
    expect(toast.error).not.toHaveBeenCalled();
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
    expect(view.result.current.error).toContain("Requests to retry: 2");
    await act(async () => {
      await view.result.current.grantAllKeys();
    });
    expect(Object.keys(view.result.current.requestErrors)).toEqual(["failed-b"]);
    expect(view.result.current.error).toContain("Requests to retry: 1");
  });
});

describe("key ID clipboard feedback", () => {
  it.each([true, false])("toasts only a failed copy (success=%s)", async (copied) => {
    seed();
    vi.mocked(writeText).mockResolvedValue(copied);
    const view = renderHook(() => useEncryptedChatInfo(streamUuid));
    await act(async () => {
      view.result.current.onCopyKey();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith("key");
    if (copied) expect(toast.error).not.toHaveBeenCalled();
    else expect(toast.error).toHaveBeenCalledExactlyOnceWith("Could not copy the key ID.");
  });

  it("ignores a late clipboard failure after closing the panel", async () => {
    seed();
    let finish: ((copied: boolean) => void) | undefined;
    vi.mocked(writeText).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = renderHook(() => useEncryptedChatInfo(streamUuid));
    act(() => view.result.current.onCopyKey());
    view.unmount();
    await act(async () => {
      finish?.(false);
      await Promise.resolve();
    });
    expect(toast.error).not.toHaveBeenCalled();
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
    const ingestion = first.sync();
    expect(second.sync()).toBe(ingestion);
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
    const ingestion = lease.sync();
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
    await expect(first.sync()).rejects.toThrow("offline");
    await second.sync();
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
