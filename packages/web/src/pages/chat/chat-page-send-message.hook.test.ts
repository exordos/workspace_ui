import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendMessage } from "~/shared/api/messenger-messages";
import type { MockMessage } from "~/shared/api/messenger.types";
import { createMessage, testMessageId } from "~/test/factories";
import { executeChatPageSend } from "./chat-page-send-handler.lib";
import { useChatPageSendMessage } from "./chat-page-send-message.hook";

vi.mock("./chat-page-send-handler.lib", () => ({
  executeChatPageSend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/shared/api/messenger-messages", () => ({
  sendMessage: vi.fn(),
}));

vi.mock("./chat-send-delivery.lib", () => ({
  buildOptimisticOutgoingMessage: vi.fn(
    (opts: {
      id: number;
      content: string;
      composerAttempt?: MockMessage["local_composer_attempt"];
    }) => ({
      id: opts.id,
      content: opts.content,
      ...(opts.composerAttempt != null ? { local_composer_attempt: opts.composerAttempt } : {}),
      delivery_status: "pending",
    }),
  ),
  markOutgoingMessageFailed: vi.fn((msg: MockMessage) => ({
    ...msg,
    delivery_status: "failed",
  })),
}));

vi.mock("~/i18n/i18n", () => ({
  t: (key: string) => key,
}));

function failedOutgoing(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    ...(createMessage({ id: -3, content: "retry me" }) as MockMessage),
    delivery_status: "failed",
    ...overrides,
  };
}

function defaultParams(overrides: Partial<Parameters<typeof useChatPageSendMessage>[0]> = {}) {
  const appendMessage = vi.fn();
  const commitOutgoingMessage = vi.fn();
  const removeMessage = vi.fn();
  return {
    currentUserId: 7,
    isDmView: true,
    activeDmUserIds: [42],
    activeStream: null,
    activeStreamCanonicalName: null,
    activeStreamId: undefined,
    activeStreamUuid: "22222222-2222-4222-8222-222222222222",
    activeTopic: null,
    activeTopicUuid: null,
    appendMessage,
    commitOutgoingMessage,
    removeMessage,
    clearReplyQuote: vi.fn(),
    stopTyping: vi.fn(),
    setSendError: vi.fn(),
    setUploadProgress: vi.fn(),
    onRetrySucceeded: vi.fn(),
    ...overrides,
  };
}

describe("useChatPageSendMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(executeChatPageSend).mockResolvedValue(undefined);
    vi.mocked(sendMessage).mockResolvedValue(createMessage({ id: 99 }));
  });

  it("delegates handleSend to executeChatPageSend", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useChatPageSendMessage(params));

    await act(async () => {
      await result.current.handleSend("hello", undefined, undefined);
    });

    expect(executeChatPageSend).toHaveBeenCalledTimes(1);
    expect(executeChatPageSend).toHaveBeenCalledWith(
      expect.objectContaining({
        currentUserId: 7,
        isDmView: true,
        activeDmUserIds: [42],
      }),
      "hello",
      undefined,
      undefined,
      undefined,
    );
  });

  it("removes failed optimistic messages and clears send error", () => {
    const params = defaultParams();
    const { result } = renderHook(() => useChatPageSendMessage(params));
    const msg = failedOutgoing();

    act(() => {
      result.current.handleRemoveFailedOutgoing(msg);
    });

    expect(params.removeMessage).toHaveBeenCalledWith(testMessageId(-3));
    expect(params.setSendError).toHaveBeenCalledWith(null);
  });

  it("ignores handleRemoveFailedOutgoing for non-failed messages", () => {
    const params = defaultParams();
    const { result } = renderHook(() => useChatPageSendMessage(params));

    act(() => {
      result.current.handleRemoveFailedOutgoing(createMessage({ id: 5 }));
    });

    expect(params.removeMessage).not.toHaveBeenCalled();
  });

  it("retries failed DM outgoing via sendMessage", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useChatPageSendMessage(params));

    await act(async () => {
      await result.current.handleRetryFailedOutgoing(failedOutgoing());
    });

    expect(params.removeMessage).toHaveBeenCalledWith(testMessageId(-3));
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageUuid: testMessageId(-3),
        streamUuid: "22222222-2222-4222-8222-222222222222",
        content: "retry me",
      }),
    );
    await waitFor(() => {
      expect(params.commitOutgoingMessage).toHaveBeenCalledWith(
        testMessageId(-3),
        expect.objectContaining({ id: testMessageId(99) }),
      );
      expect(params.onRetrySucceeded).toHaveBeenCalledWith(
        expect.objectContaining({ id: testMessageId(-3), content: "retry me" }),
      );
    });
  });

  it("keeps a delivered retry committed when post-send draft finalization fails", async () => {
    const params = defaultParams({
      onRetrySucceeded: vi.fn().mockRejectedValue(new Error("draft cleanup failed")),
    });
    const { result } = renderHook(() => useChatPageSendMessage(params));

    await act(async () => {
      await result.current.handleRetryFailedOutgoing(failedOutgoing());
    });

    expect(params.commitOutgoingMessage).toHaveBeenCalledWith(
      testMessageId(-3),
      expect.objectContaining({ id: testMessageId(99) }),
    );
    expect(params.appendMessage).toHaveBeenCalledTimes(1);
    expect(params.appendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ delivery_status: "failed" }),
    );
  });

  it("marks retried stream message failed and removes optimistic row on send error", async () => {
    vi.mocked(sendMessage).mockRejectedValueOnce(new Error("network"));
    const params = defaultParams({
      isDmView: false,
      activeDmUserIds: null,
      activeStream: "Engineering",
      activeStreamCanonicalName: "engineering",
      activeStreamId: "33333333-3333-4333-8333-333333333333",
      activeStreamUuid: "33333333-3333-4333-8333-333333333333",
      activeTopic: "general",
    });
    const { result } = renderHook(() => useChatPageSendMessage(params));

    await act(async () => {
      await result.current.handleRetryFailedOutgoing(
        failedOutgoing({
          stream_uuid: "33333333-3333-4333-8333-333333333333",
          subject: "general",
          display_recipient: "engineering",
        }),
      );
    });

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: "engineering",
          streamUuid: "33333333-3333-4333-8333-333333333333",
          messageUuid: testMessageId(-3),
          subject: "general",
        }),
      );
      expect(params.removeMessage).toHaveBeenCalledWith(testMessageId(-3));
      expect(params.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: testMessageId(-3), delivery_status: "failed" }),
      );
    });
  });

  it("marks retried message failed when sendMessage rejects", async () => {
    vi.mocked(sendMessage).mockRejectedValueOnce(new Error("network"));
    const params = defaultParams();
    const { result } = renderHook(() => useChatPageSendMessage(params));

    await act(async () => {
      await result.current.handleRetryFailedOutgoing(
        failedOutgoing({
          local_composer_attempt: {
            composerIdentity: "chat-draft-write",
            draftUuid: "00000000-0000-4000-8000-000000000007",
            streamUuid: "22222222-2222-4222-8222-222222222222",
            topicUuid: "00000000-0000-4000-8000-000000000020",
            content: "restored draft",
            files: [],
          },
        }),
      );
    });

    await waitFor(() => {
      expect(params.removeMessage).toHaveBeenCalledWith(testMessageId(-3));
      expect(params.setSendError).toHaveBeenCalledWith("network");
      expect(params.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: testMessageId(-3),
          delivery_status: "failed",
          local_composer_attempt: expect.objectContaining({ content: "restored draft" }),
        }),
      );
      expect(params.onRetrySucceeded).not.toHaveBeenCalled();
    });
  });
});
