import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as MessengerCreateChatActionsModule from "~/entities/messenger/messenger-create-chat-actions.lib";
import type { MessengerCreateStreamResult } from "~/entities/messenger/messenger-create-chat-actions.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type {
  MessengerBootstrapPayload,
  MessengerStream,
  MessengerTopic,
} from "~/entities/messenger/messenger.types";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { useWorkspaceSelfChat } from "./workspace-self-chat.hook";

const createWorkspaceDirectStream = vi.hoisted(() => vi.fn());

vi.mock("~/entities/messenger/messenger-create-chat-actions.lib", async (importOriginal) => {
  const actual = await importOriginal<typeof MessengerCreateChatActionsModule>();
  return { ...actual, createWorkspaceDirectStream };
});

const USER_UUID = "11111111-1111-4111-8111-111111111111";
const STREAM_UUID = "22222222-2222-4222-8222-222222222222";
const TOPIC_UUID = "33333333-3333-4333-8333-333333333333";
const ROUTE_SCOPE = { organizationId: "org-a", projectId: "project-a" } as const;

function session(overrides: Partial<WorkspaceAuthSession> = {}): WorkspaceAuthSession {
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "org-a",
    organizationOrigin: "https://org-a.example.com",
    projectId: "project-a",
    userUuid: USER_UUID,
    login: "user@example.com",
    accessToken: "access-token",
    runtimeGeneration: 1,
    profile: {
      uuid: USER_UUID,
      username: "user",
      firstName: "Test",
      lastName: "User",
      email: "user@example.com",
    },
    ...overrides,
  };
}

function selfStream(): MessengerStream {
  return {
    uuid: STREAM_UUID,
    projectId: "project-a",
    ownerUuid: USER_UUID,
    userUuid: USER_UUID,
    role: "owner",
    notificationMode: "all_messages",
    name: "Personal notes",
    description: "",
    unreadCount: 0,
    sourceName: "native",
    source: { kind: "native" },
    audience: "private",
    isPrivate: true,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: USER_UUID,
    lastMessageUuid: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function defaultTopic(): MessengerTopic {
  return {
    uuid: TOPIC_UUID,
    projectId: "project-a",
    streamUuid: STREAM_UUID,
    userUuid: USER_UUID,
    name: "General Topic",
    unreadCount: 0,
    isDefault: true,
    isDone: false,
    notificationMode: "default",
    lastMessageUuid: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function payload(input: { includeSelfChat: boolean }): MessengerBootstrapPayload {
  const stream = selfStream();
  const topic = defaultTopic();
  return {
    streams: input.includeSelfChat ? [stream] : [],
    streamBindings: [],
    topics: input.includeSelfChat ? [topic] : [],
    conversations: [],
    folders: [],
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useWorkspaceSelfChat", () => {
  beforeEach(() => {
    const currentSession = session();
    useWorkspaceAuthStore.setState({
      sessions: [currentSession],
      currentAccountId: currentSession.accountId,
      runtimeGeneration: currentSession.runtimeGeneration,
    });
    createWorkspaceDirectStream.mockReset();
    createWorkspaceDirectStream.mockImplementation(
      ({ runtimeContext }: { runtimeContext: WorkspaceRuntimeContext }) => {
        const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
        const stream = selfStream();
        const topic = defaultTopic();
        useMessengerStore.getState().upsertStream(ownerKey, stream);
        useMessengerStore.getState().upsertTopic(ownerKey, topic);
        return Promise.resolve({
          status: "applied",
          ownerKey,
          stream,
          defaultTopic: topic,
          streamBindings: [],
        });
      },
    );
  });

  afterEach(() => {
    useMessengerStore.getState().clear();
    useWorkspaceAuthStore.setState({
      sessions: [],
      currentAccountId: null,
      runtimeGeneration: 0,
    });
  });

  it("uses a cached self chat without creating it again", () => {
    const currentSession = session();
    useMessengerStore.getState().startBootstrap(workspaceRuntimeOwnerKey(currentSession));
    useMessengerStore
      .getState()
      .replaceBootstrapState(
        workspaceRuntimeOwnerKey(currentSession),
        payload({ includeSelfChat: true }),
      );

    const { result } = renderHook(() => useWorkspaceSelfChat(ROUTE_SCOPE));

    expect(result.current).toMatchObject({
      status: "ready",
      route: {
        kind: "topic",
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
      },
    });
    expect(createWorkspaceDirectStream).not.toHaveBeenCalled();
  });

  it("waits for catalog hydration and then creates the self chat once", async () => {
    const currentSession = session();
    const ownerKey = workspaceRuntimeOwnerKey(currentSession);
    useMessengerStore.getState().startBootstrap(ownerKey);

    const { result } = renderHook(() => useWorkspaceSelfChat(ROUTE_SCOPE));
    expect(result.current.status).toBe("loading");
    expect(createWorkspaceDirectStream).not.toHaveBeenCalled();

    act(() => {
      useMessengerStore
        .getState()
        .replaceBootstrapState(ownerKey, payload({ includeSelfChat: false }));
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(createWorkspaceDirectStream).toHaveBeenCalledTimes(1);
    expect(createWorkspaceDirectStream).toHaveBeenCalledWith(
      expect.objectContaining({
        directUserUuid: USER_UUID,
        name: "Personal notes",
        description: "",
      }),
    );
  });

  it("waits until the active runtime matches the Favorites route", async () => {
    const currentSession = session();
    const ownerKey = workspaceRuntimeOwnerKey(currentSession);
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore
      .getState()
      .replaceBootstrapState(ownerKey, payload({ includeSelfChat: false }));

    const projectBSession = session({
      accountId: "account-b",
      instanceId: "instance-b",
      organizationId: "org-b",
      projectId: "project-b",
      runtimeGeneration: 2,
    });
    const { result } = renderHook(() =>
      useWorkspaceSelfChat({ organizationId: "org-b", projectId: "project-b" }),
    );

    expect(result.current.status).toBe("loading");
    expect(createWorkspaceDirectStream).not.toHaveBeenCalled();

    act(() => {
      useWorkspaceAuthStore.setState({
        sessions: [projectBSession],
        currentAccountId: projectBSession.accountId,
        runtimeGeneration: projectBSession.runtimeGeneration,
      });
      const projectBOwnerKey = workspaceRuntimeOwnerKey(projectBSession);
      useMessengerStore.getState().startBootstrap(projectBOwnerKey);
      useMessengerStore
        .getState()
        .replaceBootstrapState(projectBOwnerKey, payload({ includeSelfChat: false }));
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(createWorkspaceDirectStream).toHaveBeenCalledTimes(1);
    expect(createWorkspaceDirectStream).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext: expect.objectContaining({
          organizationId: "org-b",
          projectId: "project-b",
          runtimeGeneration: 2,
        }),
      }),
    );
    expect(result.current.route).toMatchObject({ orgId: "org-b", projectId: "project-b" });
  });

  it("does not reuse an old pending request after A to B to A", async () => {
    const pendingRequests = [
      createDeferred<MessengerCreateStreamResult>(),
      createDeferred<MessengerCreateStreamResult>(),
      createDeferred<MessengerCreateStreamResult>(),
    ] as const;
    createWorkspaceDirectStream.mockReset();
    createWorkspaceDirectStream
      .mockReturnValueOnce(pendingRequests[0].promise)
      .mockReturnValueOnce(pendingRequests[1].promise)
      .mockReturnValueOnce(pendingRequests[2].promise);

    const sessionA1 = session({ runtimeGeneration: 1 });
    const sessionB = session({
      accountId: "account-b",
      instanceId: "instance-b",
      organizationId: "org-b",
      projectId: "project-b",
      runtimeGeneration: 2,
    });
    const sessionA2 = session({ runtimeGeneration: 3 });
    const scopeA = { organizationId: "org-a", projectId: "project-a" };
    const scopeB = { organizationId: "org-b", projectId: "project-b" };
    const ownerA = workspaceRuntimeOwnerKey(sessionA1);
    useMessengerStore.getState().startBootstrap(ownerA);
    useMessengerStore.getState().replaceBootstrapState(ownerA, payload({ includeSelfChat: false }));

    const { result, rerender } = renderHook(({ scope }) => useWorkspaceSelfChat(scope), {
      initialProps: { scope: scopeA },
    });
    await waitFor(() => expect(createWorkspaceDirectStream).toHaveBeenCalledTimes(1));

    act(() => {
      useWorkspaceAuthStore.setState({
        sessions: [sessionB],
        currentAccountId: sessionB.accountId,
        runtimeGeneration: sessionB.runtimeGeneration,
      });
      const ownerB = workspaceRuntimeOwnerKey(sessionB);
      useMessengerStore.getState().startBootstrap(ownerB);
      useMessengerStore
        .getState()
        .replaceBootstrapState(ownerB, payload({ includeSelfChat: false }));
      rerender({ scope: scopeB });
    });
    await waitFor(() => expect(createWorkspaceDirectStream).toHaveBeenCalledTimes(2));

    act(() => {
      useWorkspaceAuthStore.setState({
        sessions: [sessionA2],
        currentAccountId: sessionA2.accountId,
        runtimeGeneration: sessionA2.runtimeGeneration,
      });
      useMessengerStore.getState().startBootstrap(ownerA);
      useMessengerStore
        .getState()
        .replaceBootstrapState(ownerA, payload({ includeSelfChat: false }));
      rerender({ scope: scopeA });
    });
    await waitFor(() => expect(createWorkspaceDirectStream).toHaveBeenCalledTimes(3));
    expect(
      createWorkspaceDirectStream.mock.calls.map(
        ([options]) =>
          (options as { runtimeContext: WorkspaceRuntimeContext }).runtimeContext.runtimeGeneration,
      ),
    ).toEqual([1, 2, 3]);

    const stream = selfStream();
    const topic = defaultTopic();
    act(() => {
      useMessengerStore.getState().upsertStream(ownerA, stream);
      useMessengerStore.getState().upsertTopic(ownerA, topic);
      pendingRequests[2].resolve({
        status: "applied",
        ownerKey: ownerA,
        stream,
        defaultTopic: topic,
        streamBindings: [],
      });
      pendingRequests[0].resolve({ status: "skipped", ownerKey: ownerA, reason: "stale-owner" });
      pendingRequests[1].resolve({
        status: "skipped",
        ownerKey: workspaceRuntimeOwnerKey(sessionB),
        reason: "stale-owner",
      });
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("shows a stale request error and retries with a new request", async () => {
    const currentSession = session();
    const ownerKey = workspaceRuntimeOwnerKey(currentSession);
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore
      .getState()
      .replaceBootstrapState(ownerKey, payload({ includeSelfChat: false }));
    createWorkspaceDirectStream.mockResolvedValueOnce({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });

    const { result } = renderHook(() => useWorkspaceSelfChat(ROUTE_SCOPE));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("stale-owner");

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(createWorkspaceDirectStream).toHaveBeenCalledTimes(2);
  });

  it("retries after the self chat request rejects", async () => {
    const currentSession = session();
    const ownerKey = workspaceRuntimeOwnerKey(currentSession);
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore
      .getState()
      .replaceBootstrapState(ownerKey, payload({ includeSelfChat: false }));
    createWorkspaceDirectStream.mockRejectedValueOnce(new Error("request failed"));

    const { result } = renderHook(() => useWorkspaceSelfChat(ROUTE_SCOPE));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("request failed");

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(createWorkspaceDirectStream).toHaveBeenCalledTimes(2);
  });

  it("deduplicates the ensure request across StrictMode effects", async () => {
    const currentSession = session();
    const ownerKey = workspaceRuntimeOwnerKey(currentSession);
    const request = createDeferred<MessengerCreateStreamResult>();
    createWorkspaceDirectStream.mockReset();
    createWorkspaceDirectStream.mockReturnValue(request.promise);
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore
      .getState()
      .replaceBootstrapState(ownerKey, payload({ includeSelfChat: false }));

    const { result } = renderHook(() => useWorkspaceSelfChat(ROUTE_SCOPE), {
      wrapper: StrictMode,
    });
    await waitFor(() => expect(createWorkspaceDirectStream).toHaveBeenCalledTimes(1));

    const stream = selfStream();
    const topic = defaultTopic();
    act(() => {
      useMessengerStore.getState().upsertStream(ownerKey, stream);
      useMessengerStore.getState().upsertTopic(ownerKey, topic);
      request.resolve({
        status: "applied",
        ownerKey,
        stream,
        defaultTopic: topic,
        streamBindings: [],
      });
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(createWorkspaceDirectStream).toHaveBeenCalledTimes(1);
  });
});
