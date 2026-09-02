import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import type {
  MessengerConversationId,
  MessengerMessage,
} from "~/entities/messenger/messenger.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { useWorkspaceVisibleMessageRead } from "./workspace-visible-message-read.hook";

const captured = vi.hoisted(() => ({
  markReadUpTo: vi.fn(),
}));

vi.mock("~/entities/messenger/messenger-message-actions.lib", () => ({
  markMessengerMessagesReadUpTo: captured.markReadUpTo,
}));

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_A_UUID = "22222222-2222-4222-8222-222222222222";
const TOPIC_B_UUID = "33333333-3333-4333-8333-333333333333";
const MESSAGE_A_UUID = "44444444-4444-4444-8444-444444444444";
const MESSAGE_B_UUID = "55555555-5555-4555-8555-555555555555";
const MESSAGE_C_UUID = "66666666-6666-4666-8666-666666666666";
const conversationId: MessengerConversationId = `stream:${STREAM_UUID}`;
const otherConversationId: MessengerConversationId = `topic:${STREAM_UUID}:${TOPIC_A_UUID}`;

function seedWorkspaceMessageBody(item: MessengerMessage): void {
  const state = useWorkspaceMessageStore.getState();
  state.upsertMessageBodyFromSnapshot(item, state.messageMutationRevision);
}

const runtimeContext: WorkspaceRuntimeContext = {
  accountId: "account-1",
  instanceId: "instance-1",
  organizationId: "organization-1",
  organizationOrigin: "https://workspace.example.com",
  projectId: "77777777-7777-4777-8777-777777777777",
  userUuid: "88888888-8888-4888-8888-888888888888",
  accessToken: "token",
  refreshToken: "refresh",
  runtimeGeneration: 1,
};

function message(uuid: string, topicUuid: string, createdAt: string): MessengerMessage {
  return {
    uuid,
    conversationId: `topic:${STREAM_UUID}:${topicUuid}`,
    projectId: runtimeContext.projectId,
    streamUuid: STREAM_UUID,
    topicUuid,
    authorUuid: "99999999-9999-4999-8999-999999999999",
    userUuid: runtimeContext.userUuid,
    payload: { kind: "markdown", content: "message" },
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt,
    updatedAt: createdAt,
  };
}

async function settlePromiseCallbacks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  useWorkspaceMessageStore.getState().clear();
  captured.markReadUpTo.mockReset();
  captured.markReadUpTo.mockResolvedValue({
    status: "applied",
    ownerKey: "owner-1",
    message: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  useWorkspaceMessageStore.getState().clear();
});

describe("useWorkspaceVisibleMessageRead", () => {
  it("sends a visible boundary for an unread message authored by the current user", () => {
    const ownUnread = {
      ...message(MESSAGE_A_UUID, TOPIC_A_UUID, "2026-08-07T10:00:00Z"),
      authorUuid: runtimeContext.userUuid,
      isOwn: true,
    };
    seedWorkspaceMessageBody(ownUnread);
    const { result } = renderHook(() =>
      useWorkspaceVisibleMessageRead({ runtimeContext, conversationId }),
    );

    act(() => {
      result.current.scheduleReadBatch([ownUnread.uuid]);
      vi.advanceTimersByTime(250);
    });

    expect(captured.markReadUpTo).toHaveBeenCalledOnce();
    expect(captured.markReadUpTo).toHaveBeenCalledWith(
      expect.objectContaining({ messageUuid: ownUnread.uuid }),
    );
  });

  it("sends an older own unread boundary after a later boundary was already applied", async () => {
    const ownUnread = {
      ...message(MESSAGE_A_UUID, TOPIC_A_UUID, "2026-08-07T10:00:00Z"),
      authorUuid: runtimeContext.userUuid,
      isOwn: true,
    };
    const later = message(MESSAGE_B_UUID, TOPIC_A_UUID, "2026-08-07T10:01:00Z");
    seedWorkspaceMessageBody(ownUnread);
    seedWorkspaceMessageBody(later);
    const { result } = renderHook(() =>
      useWorkspaceVisibleMessageRead({ runtimeContext, conversationId }),
    );

    act(() => {
      result.current.scheduleReadBatch([later.uuid]);
      vi.advanceTimersByTime(250);
    });
    await act(settlePromiseCallbacks);
    expect(captured.markReadUpTo).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.scheduleReadBatch([ownUnread.uuid]);
      vi.advanceTimersByTime(250);
    });

    expect(captured.markReadUpTo).toHaveBeenCalledTimes(2);
    expect(captured.markReadUpTo.mock.calls[1]?.[0].messageUuid).toBe(ownUnread.uuid);
  });

  it("sends the latest visible boundary separately for every topic", () => {
    const first = message(MESSAGE_A_UUID, TOPIC_A_UUID, "2026-08-07T10:00:00Z");
    const second = message(MESSAGE_B_UUID, TOPIC_A_UUID, "2026-08-07T10:01:00Z");
    const third = message(MESSAGE_C_UUID, TOPIC_B_UUID, "2026-08-07T10:02:00Z");
    for (const item of [first, second, third]) {
      seedWorkspaceMessageBody(item);
    }
    const { result } = renderHook(() =>
      useWorkspaceVisibleMessageRead({ runtimeContext, conversationId }),
    );

    act(() => {
      result.current.scheduleReadBatch([first.uuid, second.uuid, third.uuid]);
      vi.advanceTimersByTime(250);
    });

    expect(captured.markReadUpTo).toHaveBeenCalledTimes(2);
    expect(
      captured.markReadUpTo.mock.calls
        .map(([options]) => options.messageUuid)
        .sort((left, right) => left.localeCompare(right)),
    ).toEqual([second.uuid, third.uuid].sort((left, right) => left.localeCompare(right)));
  });

  it("keeps one request in flight per topic and sends a later pending boundary afterwards", async () => {
    const first = message(MESSAGE_A_UUID, TOPIC_A_UUID, "2026-08-07T10:00:00Z");
    const second = message(MESSAGE_B_UUID, TOPIC_A_UUID, "2026-08-07T10:01:00Z");
    seedWorkspaceMessageBody(first);
    seedWorkspaceMessageBody(second);
    let releaseFirst: (() => void) | undefined;
    captured.markReadUpTo.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirst = () => resolve({ status: "applied", ownerKey: "owner-1", message: null });
        }),
    );
    const { result } = renderHook(() =>
      useWorkspaceVisibleMessageRead({ runtimeContext, conversationId }),
    );

    act(() => {
      result.current.scheduleReadBatch([first.uuid]);
      vi.advanceTimersByTime(250);
    });
    expect(captured.markReadUpTo).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.scheduleReadBatch([second.uuid]);
      vi.advanceTimersByTime(250);
    });
    expect(captured.markReadUpTo).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseFirst?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(captured.markReadUpTo).toHaveBeenCalledTimes(2);
    expect(captured.markReadUpTo.mock.calls[1]?.[0].messageUuid).toBe(second.uuid);
  });

  it("retries a failed boundary with bounded exponential backoff", async () => {
    const first = message(MESSAGE_A_UUID, TOPIC_A_UUID, "2026-08-07T10:00:00Z");
    seedWorkspaceMessageBody(first);
    captured.markReadUpTo.mockRejectedValue(new Error("temporary failure"));
    const { result } = renderHook(() =>
      useWorkspaceVisibleMessageRead({ runtimeContext, conversationId }),
    );

    act(() => {
      result.current.scheduleReadBatch([first.uuid]);
      vi.advanceTimersByTime(250);
    });
    await act(settlePromiseCallbacks);
    expect(captured.markReadUpTo).toHaveBeenCalledTimes(1);
    expect(result.current.readRequestBoundaryMessageUuids.has(first.uuid)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(captured.markReadUpTo).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    await act(settlePromiseCallbacks);
    expect(captured.markReadUpTo).toHaveBeenCalledTimes(2);
    expect(result.current.readRequestBoundaryMessageUuids.has(first.uuid)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(captured.markReadUpTo).toHaveBeenCalledTimes(2);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    await act(settlePromiseCallbacks);
    expect(captured.markReadUpTo).toHaveBeenCalledTimes(3);
    expect(result.current.readRequestBoundaryMessageUuids.size).toBe(0);

    act(() => {
      vi.runOnlyPendingTimers();
    });
    await act(settlePromiseCallbacks);
    expect(captured.markReadUpTo).toHaveBeenCalledTimes(3);
  });

  it("retries the later pending boundary when an earlier request fails", async () => {
    const first = message(MESSAGE_A_UUID, TOPIC_A_UUID, "2026-08-07T10:00:00Z");
    const second = message(MESSAGE_B_UUID, TOPIC_A_UUID, "2026-08-07T10:01:00Z");
    seedWorkspaceMessageBody(first);
    seedWorkspaceMessageBody(second);
    let rejectFirst: (() => void) | undefined;
    captured.markReadUpTo.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirst = () => reject(new Error("temporary failure"));
        }),
    );
    const { result } = renderHook(() =>
      useWorkspaceVisibleMessageRead({ runtimeContext, conversationId }),
    );

    act(() => {
      result.current.scheduleReadBatch([first.uuid]);
      vi.advanceTimersByTime(250);
    });
    act(() => {
      result.current.scheduleReadBatch([second.uuid]);
      vi.advanceTimersByTime(250);
    });
    expect(captured.markReadUpTo).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectFirst?.();
      await settlePromiseCallbacks();
    });
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(captured.markReadUpTo).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(captured.markReadUpTo).toHaveBeenCalledTimes(2);
    expect(captured.markReadUpTo.mock.calls[1]?.[0].messageUuid).toBe(second.uuid);
  });

  it.each([
    {
      changedScopePart: "owner",
      nextContext: { ...runtimeContext, projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      nextConversationId: conversationId,
    },
    {
      changedScopePart: "runtime generation",
      nextContext: { ...runtimeContext, runtimeGeneration: 2 },
      nextConversationId: conversationId,
    },
    {
      changedScopePart: "conversation",
      nextContext: runtimeContext,
      nextConversationId: otherConversationId,
    },
  ])(
    "cancels in-flight work and scheduled retries when $changedScopePart changes",
    async ({ nextContext, nextConversationId }) => {
      const first = message(MESSAGE_A_UUID, TOPIC_A_UUID, "2026-08-07T10:00:00Z");
      const second = message(MESSAGE_C_UUID, TOPIC_B_UUID, "2026-08-07T10:01:00Z");
      seedWorkspaceMessageBody(first);
      seedWorkspaceMessageBody(second);
      let secondSignal: AbortSignal | undefined;
      captured.markReadUpTo.mockImplementation((options) => {
        if (options.messageUuid === first.uuid) {
          return Promise.reject(new Error("temporary failure"));
        }
        secondSignal = options.signal;
        return new Promise(() => {
          // The request stays active until the hook aborts its signal.
        });
      });
      const { result, rerender } = renderHook(
        ({ context, activeConversationId }) =>
          useWorkspaceVisibleMessageRead({
            runtimeContext: context,
            conversationId: activeConversationId,
          }),
        {
          initialProps: { context: runtimeContext, activeConversationId: conversationId },
        },
      );

      act(() => {
        result.current.scheduleReadBatch([first.uuid, second.uuid]);
        vi.advanceTimersByTime(250);
      });
      await act(settlePromiseCallbacks);
      expect(captured.markReadUpTo).toHaveBeenCalledTimes(2);
      expect(secondSignal?.aborted).toBe(false);
      expect(result.current.readRequestBoundaryMessageUuids.size).toBe(2);

      rerender({ context: nextContext, activeConversationId: nextConversationId });
      expect(secondSignal?.aborted).toBe(true);
      expect(result.current.readRequestBoundaryMessageUuids.size).toBe(0);
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      await act(settlePromiseCallbacks);

      expect(captured.markReadUpTo).toHaveBeenCalledTimes(2);
    },
  );

  it("publishes pending only after the request starts and clears it after success", async () => {
    const first = message(MESSAGE_A_UUID, TOPIC_A_UUID, "2026-08-07T10:00:00Z");
    seedWorkspaceMessageBody(first);
    const response = createDeferred<{
      status: "applied";
      ownerKey: string;
      message: null;
    }>();
    captured.markReadUpTo.mockReturnValue(response.promise);
    const { result } = renderHook(() =>
      useWorkspaceVisibleMessageRead({ runtimeContext, conversationId }),
    );

    act(() => {
      result.current.scheduleReadBatch([first.uuid]);
      vi.advanceTimersByTime(249);
    });
    expect(result.current.readRequestBoundaryMessageUuids.size).toBe(0);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.readRequestBoundaryMessageUuids.has(first.uuid)).toBe(true);

    await act(async () => {
      response.resolve({ status: "applied", ownerKey: "owner-1", message: null });
      await settlePromiseCallbacks();
    });
    expect(result.current.readRequestBoundaryMessageUuids.size).toBe(0);
  });

  it("moves the marker to a later boundary while retrying the topic", async () => {
    const first = message(MESSAGE_A_UUID, TOPIC_A_UUID, "2026-08-07T10:00:00Z");
    const second = message(MESSAGE_B_UUID, TOPIC_A_UUID, "2026-08-07T10:01:00Z");
    seedWorkspaceMessageBody(first);
    seedWorkspaceMessageBody(second);
    const firstResponse = createDeferred<never>();
    const secondResponse = createDeferred<{
      status: "applied";
      ownerKey: string;
      message: null;
    }>();
    captured.markReadUpTo
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);
    const { result } = renderHook(() =>
      useWorkspaceVisibleMessageRead({ runtimeContext, conversationId }),
    );

    act(() => {
      result.current.scheduleReadBatch([first.uuid]);
      vi.advanceTimersByTime(250);
    });
    expect(result.current.readRequestBoundaryMessageUuids.has(first.uuid)).toBe(true);

    act(() => {
      result.current.scheduleReadBatch([second.uuid]);
    });
    await act(async () => {
      firstResponse.reject(new Error("temporary failure"));
      await settlePromiseCallbacks();
    });
    expect(result.current.readRequestBoundaryMessageUuids.has(first.uuid)).toBe(false);
    expect(result.current.readRequestBoundaryMessageUuids.has(second.uuid)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(captured.markReadUpTo.mock.calls[1]?.[0].messageUuid).toBe(second.uuid);
    expect(result.current.readRequestBoundaryMessageUuids.has(second.uuid)).toBe(true);

    await act(async () => {
      secondResponse.resolve({ status: "applied", ownerKey: "owner-1", message: null });
      await settlePromiseCallbacks();
    });
    expect(result.current.readRequestBoundaryMessageUuids.size).toBe(0);
  });
});
