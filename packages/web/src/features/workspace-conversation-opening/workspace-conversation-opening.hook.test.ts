import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { createMessages } from "~/entities/messenger/messages";
import type {
  LoadMessengerConversationMessagesOptions,
  MessengerConversationMessagesResult,
} from "~/entities/messenger/messenger-messages-loader.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerTopic } from "~/entities/messenger/messenger.types";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  useWorkspaceConversationOpening,
  useWorkspaceTopicResolution,
} from "./workspace-conversation-opening.hook";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  saved: vi.fn(() => null),
  resolve: vi.fn(),
}));
vi.mock("~/entities/messenger/messenger-conversation-metadata.lib", () => ({
  resolveMessengerTopic: mocks.resolve,
}));
vi.mock("~/entities/messenger/messenger-messages-loader.lib", () => ({
  loadMessengerConversationMessages: mocks.load,
  loadMessengerMessageWindowPage: vi.fn(),
}));
vi.mock("~/entities/messenger/messenger-conversation-position.lib", () => ({
  readMessengerConversationPosition: mocks.saved,
}));

const session = {
  accountId: "account",
  instanceId: "instance",
  organizationId: "org",
  projectId: "project",
  userUuid: "user",
  organizationOrigin: "https://example.test",
  accessToken: "test",
  runtimeGeneration: 1,
  login: "test@example.com",
  profile: {
    uuid: "user",
    username: "test-user",
    firstName: null,
    lastName: null,
    email: null,
  },
} satisfies WorkspaceAuthSession;
const runtime: WorkspaceRuntimeContext = session;
const ownerKey = workspaceRuntimeOwnerKey(runtime);
const getRuntimeContext = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
const streamUuid = "75309057-419c-4b12-a7c1-3932429ec4a6";
const conversationId = `topic:${streamUuid}:4ec0b996-b778-45f8-8ef4-ef863be0c047`;
const secondConversationId = `topic:${streamUuid}:ed25f944-8106-4386-b2f9-65e9db32d465`;
const messages = createMessages({ runtimeContext: runtime, getRuntimeContext });
const applied: MessengerConversationMessagesResult = {
  status: "applied",
  ownerKey,
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
  useWorkspaceAuthStore.setState({
    sessions: [session],
    currentAccountId: session.accountId,
    runtimeGeneration: session.runtimeGeneration,
  });
  const messageStore = useWorkspaceMessageStore.getState();
  messageStore.clear();
  messageStore.setOwner(ownerKey, false);
  useMessengerStore.getState().clear();
  useMessengerStore.getState().startBootstrap(ownerKey);
  mocks.resolve.mockReset();
  requests.length = 0;
  mocks.saved.mockReset().mockReturnValue(null);
  mocks.load.mockReset().mockImplementation(
    (options: LoadMessengerConversationMessagesOptions) =>
      new Promise<MessengerConversationMessagesResult>((finish) => {
        requests.push({ options, finish });
      }),
  );
});

afterEach(() => {
  useWorkspaceAuthStore.getState().clear();
});

describe("topic opening resolution", () => {
  const topic: MessengerTopic = {
    uuid: "new-topic",
    projectId: runtime.projectId,
    userUuid: runtime.userUuid,
    streamUuid: "new-stream",
    name: "Renamed",
    unreadCount: 0,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    lastMessageUuid: null,
    createdAt: "2026-07-07T10:00:00Z",
    updatedAt: "2026-07-07T10:00:00Z",
  };
  it("ignores an older lookup when another topic is clicked before navigation", async () => {
    let finishOld = (_topic: MessengerTopic) => {};
    mocks.resolve
      .mockReturnValueOnce(
        new Promise<MessengerTopic>((resolve) => {
          finishOld = resolve;
        }),
      )
      .mockResolvedValueOnce(topic);
    const onResolved = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceTopicResolution({
        runtimeContext: runtime,
        topicUuid: null,
        locationKey: "same-location",
        onResolved,
      }),
    );

    act(() => result.current("first-topic"));
    await act(async () => {
      result.current("second-topic");
      await Promise.resolve();
    });
    await act(async () => {
      finishOld({ ...topic, uuid: "obsolete-topic" });
      await Promise.resolve();
    });

    expect(onResolved).toHaveBeenCalledExactlyOnceWith(topic, false);
    expect(useMessengerStore.getState().topicsById[topic.uuid]).toEqual(topic);
    expect(useMessengerStore.getState().topicsById["obsolete-topic"]).toBeUndefined();
  });
});

function props(runtimeContext = runtime, retryNonce = 0) {
  return {
    messages:
      runtimeContext === runtime ? messages : createMessages({ runtimeContext, getRuntimeContext }),
    runtimeContext,
    conversationId,
    enabled: true,
    retryNonce,
  };
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
        ownerKey,
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
        ownerKey,
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
    rerender({ ...props(), conversationId: secondConversationId });
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
    const newRuntime = { ...runtime, runtimeGeneration: 2 };
    useWorkspaceAuthStore.setState({
      sessions: [{ ...session, runtimeGeneration: newRuntime.runtimeGeneration }],
      runtimeGeneration: newRuntime.runtimeGeneration,
    });
    rerender(props(newRuntime));
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
