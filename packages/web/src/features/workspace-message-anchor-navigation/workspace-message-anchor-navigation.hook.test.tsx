import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { adaptMessengerMessage } from "~/entities/messenger/messenger-adapters.lib";
import type {
  MessengerMessageAnchorResolveResult,
  MessengerMessageWindowFetchResult,
} from "~/entities/messenger/messenger-messages-loader.lib";
import type { MessengerConversationId } from "~/entities/messenger/messenger.types";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { useWorkspaceMessageAnchorNavigation } from "./workspace-message-anchor-navigation.hook";
import type { WorkspaceMessageAnchorNavigationOptions } from "./workspace-message-anchor-navigation.types";

const MESSAGE_A = "11111111-1111-4111-8111-111111111111";
const MESSAGE_B = "22222222-2222-4222-8222-222222222222";
const CONVERSATION_A =
  "topic:33333333-3333-4333-8333-333333333333:44444444-4444-4444-8444-444444444444";

function seedWorkspaceMessageBody(message: ReturnType<typeof adaptMessengerMessage>): void {
  const state = useWorkspaceMessageStore.getState();
  state.upsertMessageBodyFromSnapshot(message, state.messageMutationRevision);
}

const runtimeContext: WorkspaceRuntimeContext = {
  accountId: "account-a",
  instanceId: "instance-a",
  organizationId: "organization-a",
  projectId: "project-a",
  userUuid: "55555555-5555-4555-8555-555555555555",
  organizationOrigin: "https://workspace.example.com",
  accessToken: "token",
  runtimeGeneration: 1,
};

const routeScope = {
  organizationId: runtimeContext.organizationId,
  projectId: runtimeContext.projectId,
};

function createDeferred<T>() {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

type TestWindowResult =
  | { status: "applied"; conversationId: typeof CONVERSATION_A; anchorUuid: string }
  | { status: "failed"; error: string }
  | { status: "skipped"; reason: string };

type TestLoadWindow = (input: {
  messageUuid: string;
  signal: AbortSignal;
}) => Promise<TestWindowResult>;

type TestOptions = Partial<WorkspaceMessageAnchorNavigationOptions> & {
  loadWindow?: TestLoadWindow;
};

function applied(messageUuid: string = MESSAGE_A): TestWindowResult {
  return { status: "applied", conversationId: CONVERSATION_A, anchorUuid: messageUuid };
}

function resolved(
  messageUuid: string,
): Extract<MessengerMessageAnchorResolveResult, { status: "resolved" }> {
  const message = adaptMessengerMessage({
    uuid: messageUuid,
    project_id: runtimeContext.projectId,
    stream_uuid: "33333333-3333-4333-8333-333333333333",
    topic_uuid: "44444444-4444-4444-8444-444444444444",
    author_uuid: runtimeContext.userUuid,
    payload: { kind: "markdown", content: "anchor" },
    user_uuid: runtimeContext.userUuid,
    read: true,
    pinned: false,
    starred: false,
    is_own: true,
    reactions: {},
    reaction_users: {},
    created_at: "2026-08-10T10:00:00Z",
    updated_at: "2026-08-10T10:00:00Z",
  } satisfies WorkspaceMessengerMessageDto);
  return {
    status: "resolved",
    ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
    conversationId: CONVERSATION_A,
    message,
  };
}

function createFetchedWindowForAnchor(
  anchor: Extract<MessengerMessageAnchorResolveResult, { status: "resolved" }>,
  conversationId: MessengerConversationId = CONVERSATION_A,
) {
  const state = useWorkspaceMessageStore.getState();
  return {
    ownerKey: anchor.ownerKey,
    conversationId,
    anchorUuid: anchor.message.uuid,
    messages: [anchor.message],
    beforePageMarker: null,
    afterPageMarker: null,
    expectedWindowRevision: state.conversationWindowsById[conversationId]?.revision ?? null,
    capturedMutationRevision: state.messageMutationRevision,
  };
}

function createOptions(overrides: TestOptions = {}): WorkspaceMessageAnchorNavigationOptions {
  const { loadWindow, ...options } = overrides;
  return {
    runtimeContext,
    routeRequest: null,
    routePath: "/org/organization-a/project/project-a/messenger",
    windowBusy: false,
    getRuntimeContext: () => runtimeContext,
    resolveKnownConversationId: () => null,
    isMessageInWindow: () => false,
    isMessageWindowReady: () => false,
    loader: {
      resolveAnchor: async ({ messageUuid, signal }) => {
        const result = await (
          loadWindow ?? ((input) => Promise.resolve(applied(input.messageUuid)))
        )({
          messageUuid,
          signal: signal ?? new AbortController().signal,
        });
        if (result.status === "failed") {
          return {
            status: "failed",
            ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
            conversationId: null,
            error: result.error,
          };
        }
        if (result.status === "skipped") {
          return {
            status: "skipped",
            ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
            reason: "stale-owner",
          };
        }
        return resolved(result.anchorUuid);
      },
      fetchWindow: ({ anchor, targetConversationId }) =>
        Promise.resolve({
          status: "fetched",
          window: createFetchedWindowForAnchor(anchor, targetConversationId),
        }),
      applyWindow: ({ window }) =>
        Promise.resolve({
          status: "applied",
          ownerKey: window.ownerKey,
          conversationId: window.conversationId,
          anchorUuid: window.anchorUuid,
        }),
    },
    navigate: vi.fn(),
    buildDirectRoute: (messageUuid) => `/message/${messageUuid}`,
    buildConversationRoute: (_conversationId, messageUuid) => `/chat#message-${messageUuid}`,
    cancelTail: vi.fn(),
    unavailableError: "Message navigation unavailable",
    domMissingError: "Message anchor missing",
    ...options,
  };
}

describe("useWorkspaceMessageAnchorNavigation", () => {
  beforeEach(() => {
    useWorkspaceMessageStore.getState().setOwner(null, false);
  });

  it("presents a known owner-scoped body immediately without changing window membership", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const message = resolved(MESSAGE_A).message;
    useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
    const messageState = useWorkspaceMessageStore.getState();
    messageState.upsertMessageBodyFromSnapshot(message, messageState.messageMutationRevision);
    const pending = createDeferred<TestWindowResult>();
    const options = createOptions({ loadWindow: () => pending.promise });
    const { result } = renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });

    await waitFor(() =>
      expect(result.current.previewPresentation).toMatchObject({
        messageUuid: MESSAGE_A,
        phase: "staged",
        previewMessage: message,
      }),
    );
    expect(useWorkspaceMessageStore.getState().conversationWindowsById).toEqual({});
  });

  it("keeps a resolved preview through awaiting-dom and hides it after exact focus", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
    const anchor = resolved(MESSAGE_A);
    const resolvedAnchor = createDeferred<MessengerMessageAnchorResolveResult>();
    const fetchedWindow = createDeferred<MessengerMessageWindowFetchResult>();
    const base = createOptions();
    const options: WorkspaceMessageAnchorNavigationOptions = {
      ...base,
      loader: {
        ...base.loader,
        resolveAnchor: async () => {
          const value = await resolvedAnchor.promise;
          if (value.status === "resolved") {
            const messageState = useWorkspaceMessageStore.getState();
            messageState.upsertMessageBodyFromSnapshot(
              value.message,
              messageState.messageMutationRevision,
            );
          }
          return value;
        },
        fetchWindow: () => fetchedWindow.promise,
      },
    };
    const { result } = renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });
    await waitFor(() => expect(result.current.previewPresentation?.previewMessage).toBeNull());

    await act(async () => {
      resolvedAnchor.resolve(anchor);
      await resolvedAnchor.promise;
    });
    expect(result.current.previewPresentation).toMatchObject({
      phase: "loading-window",
      previewMessage: anchor.message,
    });

    await act(async () => {
      fetchedWindow.resolve({
        status: "fetched",
        window: createFetchedWindowForAnchor(anchor),
      });
      await fetchedWindow.promise;
    });
    await waitFor(() => expect(result.current.intent?.phase).toBe("awaiting-dom"));
    expect(result.current.previewPresentation).toMatchObject({
      phase: "awaiting-dom",
      previewMessage: anchor.message,
    });
    const exactTarget = result.current.focusTarget!;
    act(() => {
      result.current.onDomFocusApplied({ ...exactTarget, intentId: exactTarget.intentId - 1 });
      result.current.onDomFocusApplied({ ...exactTarget, messageUuid: MESSAGE_B });
      result.current.onDomFocusApplied({
        ...exactTarget,
        focusAttempt: exactTarget.focusAttempt + 1,
      });
    });
    expect(result.current.intent?.phase).toBe("awaiting-dom");
    expect(result.current.previewPresentation?.phase).toBe("awaiting-dom");

    act(() => {
      result.current.onDomFocusApplied(exactTarget);
    });
    expect(result.current.intent?.phase).toBe("focused");
    expect(result.current.previewPresentation).toBeNull();
  });

  it.each([
    {
      name: "hash route",
      conversationId: "stream:33333333-3333-4333-8333-333333333333" as const,
      expected: "stream:33333333-3333-4333-8333-333333333333" as const,
    },
    { name: "direct route", conversationId: null, expected: CONVERSATION_A },
  ])("passes the $name conversation scope into fetch", async ({ conversationId, expected }) => {
    const base = createOptions();
    const fetchWindow = vi.fn(({ anchor, targetConversationId }) =>
      Promise.resolve({
        status: "fetched" as const,
        window: createFetchedWindowForAnchor(anchor, targetConversationId),
      }),
    );
    const options: WorkspaceMessageAnchorNavigationOptions = {
      ...base,
      routeRequest: {
        messageUuid: MESSAGE_A,
        conversationId,
        routeKey: `scope-${conversationId ?? "direct"}`,
        source: "direct-route",
        scope: routeScope,
      },
      loader: { ...base.loader, fetchWindow },
    };

    renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    await waitFor(() => expect(fetchWindow).toHaveBeenCalledTimes(1));
    expect(fetchWindow).toHaveBeenCalledWith(
      expect.objectContaining({ targetConversationId: expected }),
    );
  });

  it("keeps M2 when M1 resolves last and aborts the old request", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
    seedWorkspaceMessageBody(resolved(MESSAGE_A).message);
    const first = createDeferred<TestWindowResult>();
    const second = createDeferred<TestWindowResult>();
    const signals: AbortSignal[] = [];
    const loadWindow = vi
      .fn<TestLoadWindow>()
      .mockImplementationOnce(({ signal }) => {
        signals.push(signal);
        return first.promise;
      })
      .mockImplementationOnce(({ signal }) => {
        signals.push(signal);
        return second.promise;
      });
    const navigate = vi.fn();
    const cancelTail = vi.fn();
    const options = createOptions({ loadWindow, navigate, cancelTail });
    const { result } = renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
      result.current.startMessageNavigation(MESSAGE_B);
    });

    expect(signals[0]?.aborted).toBe(true);
    expect(navigate).toHaveBeenNthCalledWith(1, `/message/${MESSAGE_A}`, { replace: false });
    expect(navigate).toHaveBeenNthCalledWith(2, `/message/${MESSAGE_B}`, { replace: false });
    expect(cancelTail).toHaveBeenCalledTimes(2);
    expect(result.current.previewPresentation?.messageUuid).toBe(MESSAGE_B);
    expect(result.current.previewPresentation?.previewMessage).toBeNull();
    await act(async () => {
      second.resolve(applied(MESSAGE_B));
      await second.promise;
    });
    await act(async () => {
      first.resolve(applied(MESSAGE_A));
      await first.promise;
    });

    expect(result.current.intent).toMatchObject({ messageUuid: MESSAGE_B, phase: "awaiting-dom" });
    expect(result.current.navigationError).toBeNull();
    expect(result.current.previewPresentation).toMatchObject({
      messageUuid: MESSAGE_B,
      phase: "awaiting-dom",
    });
  });

  it("supersedes an active anchor for an explicit tail request", async () => {
    const pending = createDeferred<TestWindowResult>();
    const requestSignals: AbortSignal[] = [];
    const options = createOptions({
      loadWindow: ({ signal }) => {
        requestSignals.push(signal);
        return pending.promise;
      },
    });
    const { result } = renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });
    expect(result.current.intent?.phase).toBe("resolving");

    act(() => {
      result.current.cancelForTail();
    });
    expect(requestSignals[0]?.aborted).toBe(true);
    expect(result.current.intent?.phase).toBe("superseded");
    expect(result.current.focusTarget).toBeNull();
    expect(result.current.previewPresentation).toBeNull();
    expect(result.current.navigationError).toBeNull();

    await act(async () => {
      pending.resolve(applied());
      await pending.promise;
    });
    expect(result.current.intent?.phase).toBe("superseded");
  });

  it("turns a current skipped result into an explicit retryable failure", async () => {
    const options = createOptions({
      loadWindow: () => Promise.resolve({ status: "skipped", reason: "stale-owner" }),
    });
    const { result } = renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });

    await waitFor(() => expect(result.current.intent?.phase).toBe("failed"));
    expect(result.current.navigationError).toMatchObject({
      messageUuid: MESSAGE_A,
      kind: "invalid-context",
      retryable: true,
    });
  });

  it("creates a new id on retry and on a repeated navigation to the same UUID", async () => {
    const loadWindow = vi
      .fn<TestLoadWindow>()
      .mockResolvedValueOnce({ status: "failed", error: "offline" })
      .mockResolvedValue(applied());
    const options = createOptions({ loadWindow });
    const { result } = renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });
    await waitFor(() => expect(result.current.intent?.phase).toBe("failed"));
    const failedId = result.current.intent!.id;

    act(() => {
      result.current.retryMessageNavigation();
    });
    await waitFor(() => expect(result.current.intent?.phase).toBe("awaiting-dom"));
    const retryId = result.current.intent!.id;
    expect(retryId).toBeGreaterThan(failedId);

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });
    await waitFor(() => expect(result.current.intent?.phase).toBe("awaiting-dom"));
    expect(result.current.intent!.id).toBeGreaterThan(retryId);
  });

  it("creates a new id when browser history reopens the same anchor", async () => {
    const base = createOptions({
      resolveKnownConversationId: () => CONVERSATION_A,
      isMessageInWindow: () => true,
      isMessageWindowReady: () => true,
    });
    const firstRouteRequest = {
      messageUuid: MESSAGE_A,
      conversationId: CONVERSATION_A,
      routeKey: "history-a",
      source: "browser-history" as const,
      scope: routeScope,
    };
    const { result, rerender } = renderHook(
      ({ routeRequest }) => useWorkspaceMessageAnchorNavigation({ ...base, routeRequest }),
      { initialProps: { routeRequest: firstRouteRequest } },
    );

    await waitFor(() => expect(result.current.intent?.routeKey).toBe("history-a"));
    const firstId = result.current.intent!.id;
    rerender({
      routeRequest: {
        ...firstRouteRequest,
        routeKey: "history-b",
      },
    });
    await waitFor(() => expect(result.current.intent?.routeKey).toBe("history-b"));
    expect(result.current.intent!.id).toBeGreaterThan(firstId);
  });

  it("ignores stale DOM callbacks and focuses only the current intent", async () => {
    const options = createOptions();
    const { result } = renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });
    await waitFor(() => expect(result.current.focusTarget).not.toBeNull());
    const firstTarget = result.current.focusTarget!;
    act(() => {
      result.current.startMessageNavigation(MESSAGE_B);
    });
    await waitFor(() =>
      expect(result.current.intent).toMatchObject({
        messageUuid: MESSAGE_B,
        phase: "awaiting-dom",
      }),
    );

    act(() => {
      result.current.onDomFocusApplied(firstTarget);
      result.current.onDomFocusMissing(firstTarget);
    });
    expect(result.current.intent).toMatchObject({ messageUuid: MESSAGE_B, phase: "awaiting-dom" });
    expect(result.current.previewPresentation).toMatchObject({
      messageUuid: MESSAGE_B,
      phase: "awaiting-dom",
    });

    act(() => {
      result.current.onDomFocusApplied(result.current.focusTarget!);
    });
    expect(result.current.intent?.phase).toBe("focused");
  });

  it("aborts and clears an active intent after the runtime owner changes", async () => {
    const deferred = createDeferred<TestWindowResult>();
    let currentRuntime: WorkspaceRuntimeContext | null = runtimeContext;
    let requestSignal: AbortSignal | null = null;
    const loadWindow = vi.fn<TestLoadWindow>(({ signal }) => {
      requestSignal = signal;
      return deferred.promise;
    });
    const base = createOptions({ loadWindow, getRuntimeContext: () => currentRuntime });
    const initialProps: { context: WorkspaceRuntimeContext | null } = { context: runtimeContext };
    const { result, rerender } = renderHook(
      ({ context }) => useWorkspaceMessageAnchorNavigation({ ...base, runtimeContext: context }),
      { initialProps },
    );

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });
    expect(result.current.intent?.phase).toBe("resolving");
    expect(result.current.focusTarget).toBeNull();
    currentRuntime = { ...runtimeContext, projectId: "project-b", runtimeGeneration: 2 };
    rerender({ context: currentRuntime });

    await waitFor(() => expect(requestSignal?.aborted).toBe(true));
    expect(result.current.intent).toBeNull();
    expect(result.current.focusTarget).toBeNull();
    expect(result.current.navigationError).toBeNull();
    expect(result.current.previewPresentation).toBeNull();

    await act(async () => {
      deferred.resolve(applied());
      await deferred.promise;
    });
    expect(result.current.intent).toBeNull();
    expect(result.current.focusTarget).toBeNull();
    expect(result.current.navigationError).toBeNull();
  });

  it("aborts and clears an active intent when the runtime becomes null", async () => {
    const deferred = createDeferred<TestWindowResult>();
    let currentRuntime: WorkspaceRuntimeContext | null = runtimeContext;
    let requestSignal: AbortSignal | null = null;
    const loadWindow = vi.fn<TestLoadWindow>(({ signal }) => {
      requestSignal = signal;
      return deferred.promise;
    });
    const base = createOptions({ loadWindow, getRuntimeContext: () => currentRuntime });
    const nullRuntimeInitialProps: { context: WorkspaceRuntimeContext | null } = {
      context: runtimeContext,
    };
    const { result, rerender } = renderHook(
      ({ context }: { context: WorkspaceRuntimeContext | null }) =>
        useWorkspaceMessageAnchorNavigation({ ...base, runtimeContext: context }),
      { initialProps: nullRuntimeInitialProps },
    );

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });
    const staleTarget = {
      intentId: result.current.intent!.id,
      messageUuid: MESSAGE_A,
      focusAttempt: 0,
    };
    currentRuntime = null;
    rerender({ context: null });

    await waitFor(() => expect(requestSignal?.aborted).toBe(true));
    expect(result.current.intent).toBeNull();
    expect(result.current.focusTarget).toBeNull();
    expect(result.current.navigationError).toBeNull();

    act(() => {
      result.current.onDomFocusApplied(staleTarget);
      result.current.onDomFocusMissing(staleTarget);
    });
    await act(async () => {
      deferred.resolve(applied());
      await deferred.promise;
    });
    expect(result.current.intent).toBeNull();
    expect(result.current.focusTarget).toBeNull();
    expect(result.current.navigationError).toBeNull();
  });

  it("ignores DOM callbacks until the current window reaches awaiting-dom", async () => {
    const deferred = createDeferred<TestWindowResult>();
    const options = createOptions({ loadWindow: () => deferred.promise });
    const { result } = renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });
    const intentId = result.current.intent!.id;
    const prematureTarget = { intentId, messageUuid: MESSAGE_A, focusAttempt: 0 };
    expect(result.current.intent?.phase).toBe("resolving");
    expect(result.current.focusTarget).toBeNull();

    act(() => {
      result.current.onDomFocusApplied(prematureTarget);
      result.current.onDomFocusMissing(prematureTarget);
    });
    expect(result.current.intent?.phase).toBe("resolving");
    expect(result.current.focusTarget).toBeNull();

    await act(async () => {
      deferred.resolve(applied());
      await deferred.promise;
    });
    expect(result.current.intent).toMatchObject({ id: intentId, phase: "awaiting-dom" });
    expect(result.current.focusTarget).toEqual(prematureTarget);
  });

  it("loads a window when membership exists without a complete window state", async () => {
    const loadWindow = vi.fn(() => Promise.resolve(applied()));
    const options = createOptions({
      resolveKnownConversationId: () => CONVERSATION_A,
      isMessageInWindow: () => true,
      isMessageWindowReady: () => false,
      loadWindow,
    });
    const { result } = renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });

    await waitFor(() => expect(loadWindow).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.intent?.phase).toBe("awaiting-dom"));
  });

  it("uses the mounted current window directly without staging or requesting a window", () => {
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const message = resolved(MESSAGE_A).message;
    const loadWindow = vi.fn(() => Promise.resolve(applied()));
    const base = createOptions({
      resolveKnownConversationId: () => CONVERSATION_A,
      isMessageInWindow: () => true,
      isMessageWindowReady: () => true,
      loadWindow,
    });
    const loader = base.loader;
    if (loader?.resolveAnchor == null || loader.fetchWindow == null || loader.applyWindow == null) {
      throw new Error("Expected complete navigation loader");
    }
    const resolveAnchor = vi.fn(loader.resolveAnchor);
    const fetchWindow = vi.fn(loader.fetchWindow);
    const applyWindow = vi.fn(loader.applyWindow);
    const options: WorkspaceMessageAnchorNavigationOptions = {
      ...base,
      loader: { resolveAnchor, fetchWindow, applyWindow },
    };
    useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
    seedWorkspaceMessageBody(message);
    const { result } = renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });

    expect(result.current.intent).toMatchObject({
      messageUuid: MESSAGE_A,
      phase: "awaiting-dom",
    });
    expect(result.current.previewPresentation).toBeNull();
    expect(loadWindow).not.toHaveBeenCalled();
    expect(resolveAnchor).not.toHaveBeenCalled();
    expect(fetchWindow).not.toHaveBeenCalled();
    expect(applyWindow).not.toHaveBeenCalled();
    expect(options.navigate).toHaveBeenCalledWith(`/chat#message-${MESSAGE_A}`, { replace: false });

    const target = result.current.focusTarget;
    if (target == null) throw new Error("Expected direct DOM focus target");
    act(() => {
      result.current.onDomFocusApplied(target);
    });
    expect(result.current.intent?.phase).toBe("focused");
  });

  it("shows the transition immediately after a busy fast-path DOM miss", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const message = resolved(MESSAGE_A).message;
    const loadWindow = vi.fn(() => Promise.resolve(applied()));
    const base = createOptions({
      resolveKnownConversationId: () => CONVERSATION_A,
      isMessageInWindow: () => true,
      isMessageWindowReady: () => true,
      loadWindow,
    });
    useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
    seedWorkspaceMessageBody(message);
    const { result, rerender } = renderHook(
      ({ windowBusy }) => useWorkspaceMessageAnchorNavigation({ ...base, windowBusy }),
      { initialProps: { windowBusy: true } },
    );

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });
    expect(result.current.previewPresentation).toBeNull();

    const firstTarget = result.current.focusTarget;
    if (firstTarget == null) throw new Error("Expected fast-path focus target");
    act(() => {
      result.current.onDomFocusMissing(firstTarget);
    });

    expect(result.current.intent?.pendingDomRecovery).toBe(true);
    expect(result.current.previewPresentation).toMatchObject({
      messageUuid: MESSAGE_A,
      phase: "awaiting-dom",
      previewMessage: message,
    });
    expect(loadWindow).not.toHaveBeenCalled();

    rerender({ windowBusy: false });
    await waitFor(() => expect(loadWindow).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.focusTarget?.focusAttempt).toBe(1));
  });

  it("keeps a newer same-message fast-path intent when stale DOM callbacks arrive", () => {
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const message = resolved(MESSAGE_A).message;
    const loadWindow = vi.fn(() => Promise.resolve(applied()));
    const options = createOptions({
      resolveKnownConversationId: () => CONVERSATION_A,
      isMessageInWindow: () => true,
      isMessageWindowReady: () => true,
      loadWindow,
    });
    useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
    seedWorkspaceMessageBody(message);
    const { result } = renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });
    const firstTarget = result.current.focusTarget;
    if (firstTarget == null) throw new Error("Expected first fast-path focus target");

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });
    const currentTarget = result.current.focusTarget;
    if (currentTarget == null) throw new Error("Expected current fast-path focus target");
    expect(currentTarget.intentId).toBeGreaterThan(firstTarget.intentId);

    act(() => {
      result.current.onDomFocusApplied(firstTarget);
      result.current.onDomFocusMissing(firstTarget);
    });
    expect(result.current.focusTarget).toEqual(currentTarget);
    expect(result.current.intent).toMatchObject({
      phase: "awaiting-dom",
      transitionRequired: false,
    });
    expect(result.current.previewPresentation).toBeNull();
    expect(loadWindow).not.toHaveBeenCalled();

    act(() => {
      result.current.onDomFocusApplied(currentTarget);
    });
    expect(result.current.intent?.phase).toBe("focused");
  });

  it("recovers once when a ready window has no canonical DOM anchor", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const message = resolved(MESSAGE_A).message;
    const loadWindow = vi.fn(() => Promise.resolve(applied()));
    const options = createOptions({
      resolveKnownConversationId: () => CONVERSATION_A,
      isMessageInWindow: () => true,
      isMessageWindowReady: () => true,
      loadWindow,
    });
    useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
    seedWorkspaceMessageBody(message);
    const { result } = renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });
    expect(loadWindow).not.toHaveBeenCalled();

    const firstTarget = result.current.focusTarget;
    if (firstTarget == null) throw new Error("Expected first DOM focus target");
    act(() => {
      result.current.onDomFocusMissing(firstTarget);
    });

    await waitFor(() => expect(loadWindow).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.focusTarget?.focusAttempt).toBe(1));
    expect(result.current.previewPresentation).toMatchObject({
      messageUuid: MESSAGE_A,
      phase: "awaiting-dom",
      previewMessage: message,
    });

    const recoveredTarget = result.current.focusTarget;
    if (recoveredTarget == null) throw new Error("Expected recovered DOM focus target");
    act(() => {
      result.current.onDomFocusMissing(recoveredTarget);
    });
    expect(result.current.navigationError).toMatchObject({ kind: "dom-missing", retryable: true });
  });

  it("stages a body-only message while the surrounding window is loading", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const message = resolved(MESSAGE_A).message;
    const pending = createDeferred<TestWindowResult>();
    const loadWindow = vi.fn(() => pending.promise);
    const options = createOptions({
      resolveKnownConversationId: () => CONVERSATION_A,
      isMessageInWindow: () => false,
      isMessageWindowReady: () => false,
      loadWindow,
    });
    useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
    seedWorkspaceMessageBody(message);
    const { result } = renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });

    await waitFor(() => expect(loadWindow).toHaveBeenCalledTimes(1));
    expect(result.current.previewPresentation).toMatchObject({
      messageUuid: MESSAGE_A,
      phase: "staged",
      previewMessage: message,
    });
  });

  it("retries the current anchor window once after a stale-window result", async () => {
    const base = createOptions();
    const anchor = resolved(MESSAGE_A);
    const fetchWindow = vi.fn(() =>
      Promise.resolve({ status: "fetched" as const, window: createFetchedWindowForAnchor(anchor) }),
    );
    const applyWindow = vi
      .fn()
      .mockResolvedValueOnce({
        status: "skipped" as const,
        ownerKey: anchor.ownerKey,
        reason: "stale-window" as const,
      })
      .mockResolvedValueOnce({
        status: "applied" as const,
        ownerKey: anchor.ownerKey,
        conversationId: CONVERSATION_A,
        anchorUuid: MESSAGE_A,
      });
    const options: WorkspaceMessageAnchorNavigationOptions = {
      ...base,
      routeRequest: {
        messageUuid: MESSAGE_A,
        conversationId: null,
        routeKey: "stale-window-retry",
        source: "direct-route",
        scope: routeScope,
      },
      routePath: `/message/${MESSAGE_A}`,
      loader: {
        ...base.loader,
        resolveAnchor: () => Promise.resolve(anchor),
        fetchWindow,
        applyWindow,
      },
    };
    const { result } = renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    await waitFor(() => expect(result.current.intent?.phase).toBe("awaiting-dom"));
    expect(fetchWindow).toHaveBeenCalledTimes(2);
    expect(applyWindow).toHaveBeenCalledTimes(2);
    expect(result.current.navigationError).toBeNull();
  });

  it("consumes the matching self-route event", async () => {
    const request = createDeferred<TestWindowResult>();
    const loadWindow = vi.fn(() => request.promise);
    const navigate = vi.fn();
    const base = createOptions({ loadWindow, navigate });
    interface Props {
      routeRequest: WorkspaceMessageAnchorNavigationOptions["routeRequest"];
      routePath: string;
    }
    const initialProps: Props = { routeRequest: null, routePath: base.routePath };
    const { result, rerender } = renderHook(
      ({ routeRequest, routePath }: Props) =>
        useWorkspaceMessageAnchorNavigation({ ...base, routeRequest, routePath }),
      { initialProps },
    );

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });
    const actionIntentId = result.current.intent!.id;
    const expectedPath = `/message/${MESSAGE_A}`;
    rerender({
      routePath: expectedPath,
      routeRequest: {
        messageUuid: MESSAGE_A,
        conversationId: null,
        routeKey: "self-route",
        source: "direct-route",
        scope: routeScope,
      },
    });
    expect(result.current.intent?.id).toBe(actionIntentId);

    expect(loadWindow).toHaveBeenCalledTimes(1);
    await act(async () => {
      request.resolve(applied());
      await request.promise;
    });
    await waitFor(() => expect(result.current.intent?.phase).toBe("awaiting-dom"));
  });

  it("supersedes an unconfirmed self route when POP arrives first for the same UUID", async () => {
    const base = createOptions({ loadWindow: () => Promise.resolve(applied()) });
    interface Props {
      routeRequest: WorkspaceMessageAnchorNavigationOptions["routeRequest"];
      routePath: string;
    }
    const initialProps: Props = { routeRequest: null, routePath: base.routePath };
    const { result, rerender } = renderHook(
      ({ routeRequest, routePath }: Props) =>
        useWorkspaceMessageAnchorNavigation({ ...base, routeRequest, routePath }),
      { initialProps },
    );

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });
    const actionIntentId = result.current.intent!.id;
    rerender({
      routePath: `/message/${MESSAGE_A}`,
      routeRequest: {
        messageUuid: MESSAGE_A,
        conversationId: null,
        routeKey: "browser-pop-first",
        source: "browser-history",
        scope: routeScope,
      },
    });

    await waitFor(() => expect(result.current.intent?.routeKey).toBe("browser-pop-first"));
    expect(result.current.intent!.id).toBeGreaterThan(actionIntentId);
  });

  it("waits for route scope synchronization and then starts exactly one request", async () => {
    const nextRuntime = {
      ...runtimeContext,
      organizationId: "organization-b",
      projectId: "project-b",
      runtimeGeneration: 2,
    };
    const loadWindow = vi.fn(() => Promise.resolve(applied()));
    const base = createOptions({
      routeRequest: {
        messageUuid: MESSAGE_A,
        conversationId: null,
        routeKey: "wrong-scope",
        source: "direct-route",
        scope: { organizationId: "organization-b", projectId: "project-b" },
      },
      loadWindow,
      getRuntimeContext: () => nextRuntime,
    });
    const { result, rerender } = renderHook(
      ({ context }) => useWorkspaceMessageAnchorNavigation({ ...base, runtimeContext: context }),
      { initialProps: { context: runtimeContext } },
    );

    await waitFor(() => expect(result.current.intent?.phase).toBe("resolving"));
    expect(loadWindow).not.toHaveBeenCalled();
    expect(result.current.focusTarget).toBeNull();

    rerender({ context: nextRuntime });
    await waitFor(() => expect(loadWindow).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.intent?.phase).toBe("awaiting-dom"));
  });

  it("fails explicitly when both runtime snapshots reject the route scope", async () => {
    const loadWindow = vi.fn(() => Promise.resolve(applied()));
    const options = createOptions({
      routeRequest: {
        messageUuid: MESSAGE_A,
        conversationId: null,
        routeKey: "invalid-scope",
        source: "direct-route",
        scope: { organizationId: "organization-b", projectId: "project-b" },
      },
      loadWindow,
    });
    const { result } = renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    await waitFor(() => expect(result.current.intent?.phase).toBe("failed"));
    expect(result.current.navigationError).toMatchObject({
      kind: "invalid-context",
      retryable: true,
    });
    expect(loadWindow).not.toHaveBeenCalled();
  });

  it("does not expose the active owner's body to a route owned by another scope", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
    seedWorkspaceMessageBody(resolved(MESSAGE_A).message);
    const options = createOptions({
      routeRequest: {
        messageUuid: MESSAGE_A,
        conversationId: null,
        routeKey: "foreign-route",
        source: "direct-route",
        scope: { organizationId: "organization-b", projectId: "project-b" },
      },
    });
    const { result } = renderHook(() => useWorkspaceMessageAnchorNavigation(options));

    await waitFor(() => expect(result.current.intent?.phase).toBe("failed"));
    expect(result.current.previewPresentation).toMatchObject({
      messageUuid: MESSAGE_A,
      phase: "failed",
      previewMessage: null,
    });
    expect(result.current.navigationError).not.toBeNull();
  });

  it("queues one DOM recovery while the window is busy and then fails after a second miss", async () => {
    const loadWindow = vi.fn(() => Promise.resolve(applied()));
    const base = createOptions({ loadWindow });
    const { result, rerender } = renderHook(
      ({ windowBusy }) => useWorkspaceMessageAnchorNavigation({ ...base, windowBusy }),
      { initialProps: { windowBusy: true } },
    );

    act(() => {
      result.current.startMessageNavigation(MESSAGE_A);
    });
    await waitFor(() => expect(result.current.intent?.phase).toBe("awaiting-dom"));
    act(() => {
      result.current.onDomFocusMissing(result.current.focusTarget!);
    });
    expect(result.current.intent?.pendingDomRecovery).toBe(true);
    expect(result.current.previewPresentation?.phase).toBe("awaiting-dom");

    rerender({ windowBusy: false });
    await waitFor(() => expect(loadWindow).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.intent?.recoveryAttempt).toBe(1));
    expect(result.current.focusTarget?.focusAttempt).toBe(1);
    act(() => {
      result.current.onDomFocusMissing(result.current.focusTarget!);
    });
    expect(result.current.navigationError?.kind).toBe("dom-missing");
    expect(result.current.previewPresentation).toMatchObject({
      messageUuid: MESSAGE_A,
      phase: "failed",
    });
  });
});
