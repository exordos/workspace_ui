import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream } from "~/entities/messenger/messenger.types";
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
    currentEncryptionKey: { keyUuid: "key", keyFingerprint: "fingerprint" },
  };
  useMessengerStore.getState().startBootstrap(owner);
  useMessengerStore.getState().upsertStream(owner, stream);
  useWorkspaceMessageStore.getState().setOwner(owner, false);
}
function session() {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    ingest: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(() => () => undefined),
    dispose: vi.fn(),
    getState: () => ({ access: "ready", pending: false, requestStatus: "idle", error: null }),
    requestKey: vi.fn().mockResolvedValue(undefined),
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
});
