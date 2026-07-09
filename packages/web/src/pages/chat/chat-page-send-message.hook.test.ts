import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createMessage } from "~/test/factories";
import { executeChatPageSend } from "./chat-page-send-handler.lib";
import { useChatPageSendMessage } from "./chat-page-send-message.hook";

vi.mock("./chat-page-send-handler.lib", () => ({
  executeChatPageSend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./chat-send-delivery.lib", () => ({
  buildOptimisticOutgoingMessage: vi.fn((opts: { id: number; content: string }) => ({
    id: opts.id,
    content: opts.content,
    delivery_status: "pending",
  })),
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
    activeTopic: null,
    appendMessage,
    commitOutgoingMessage,
    removeMessage,
    requestScrollToBottom: vi.fn(),
    clearReplyQuote: vi.fn(),
    stopTyping: vi.fn(),
    setSendError: vi.fn(),
    setUploadProgress: vi.fn(),
    ...overrides,
  };
}

describe("useChatPageSendMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(executeChatPageSend).mockResolvedValue(undefined);
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
    );
  });

  it("removes failed optimistic messages and clears send error", () => {
    const params = defaultParams();
    const { result } = renderHook(() => useChatPageSendMessage(params));
    const msg = failedOutgoing();

    act(() => {
      result.current.handleRemoveFailedOutgoing(msg);
    });

    expect(params.removeMessage).toHaveBeenCalledWith(-3);
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

  it("keeps failed DM outgoing local and reports controlled retry failure", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useChatPageSendMessage(params));

    await act(async () => {
      await result.current.handleRetryFailedOutgoing(failedOutgoing());
    });

    expect(params.removeMessage).not.toHaveBeenCalled();
    expect(params.appendMessage).not.toHaveBeenCalled();
    expect(params.commitOutgoingMessage).not.toHaveBeenCalled();
    expect(params.setSendError).toHaveBeenCalledWith(null);
    expect(params.setSendError).toHaveBeenCalledWith("message.sendFailed");
    expect(params.setUploadProgress).toHaveBeenCalledWith(null);
  });

  it("keeps failed stream outgoing local and reports controlled retry failure", async () => {
    const params = defaultParams({
      isDmView: false,
      activeDmUserIds: null,
      activeStream: "Engineering",
      activeStreamCanonicalName: "engineering",
      activeStreamId: 5,
      activeTopic: "general",
    });
    const { result } = renderHook(() => useChatPageSendMessage(params));

    await act(async () => {
      await result.current.handleRetryFailedOutgoing(
        failedOutgoing({
          stream_id: 5,
          subject: "general",
          display_recipient: "engineering",
        }),
      );
    });

    expect(params.removeMessage).not.toHaveBeenCalled();
    expect(params.appendMessage).not.toHaveBeenCalled();
    expect(params.commitOutgoingMessage).not.toHaveBeenCalled();
    expect(params.setSendError).toHaveBeenCalledWith("message.sendFailed");
  });

  it("ignores retry for non-local failed messages", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useChatPageSendMessage(params));

    await act(async () => {
      await result.current.handleRetryFailedOutgoing(failedOutgoing({ id: 5 }));
    });

    expect(params.removeMessage).not.toHaveBeenCalled();
    expect(params.appendMessage).not.toHaveBeenCalled();
    expect(params.setSendError).not.toHaveBeenCalled();
  });
});
