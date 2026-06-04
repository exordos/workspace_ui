import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendMessage } from "~/shared/api/zulip-messages";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createMessage } from "~/test/factories";
import { executeChatPageSend } from "./chat-page-send-handler.lib";
import { useChatPageSendMessage } from "./chat-page-send-message.hook";

vi.mock("./chat-page-send-handler.lib", () => ({
  executeChatPageSend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/shared/api/zulip-messages", () => ({
  sendMessage: vi.fn(),
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
    vi.mocked(sendMessage).mockResolvedValue(createMessage({ id: 99 }) as MockMessage);
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
      result.current.handleRemoveFailedOutgoing(createMessage({ id: 5 }) as MockMessage);
    });

    expect(params.removeMessage).not.toHaveBeenCalled();
  });

  it("retries failed DM outgoing via sendMessage", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useChatPageSendMessage(params));

    await act(async () => {
      await result.current.handleRetryFailedOutgoing(failedOutgoing());
    });

    expect(params.removeMessage).toHaveBeenCalledWith(-3);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [42],
        content: "retry me",
        local_id: "-1",
      }),
    );
    await waitFor(() => {
      expect(params.commitOutgoingMessage).toHaveBeenCalledWith(
        -1,
        expect.objectContaining({ id: 99 }),
      );
    });
  });

  it("marks retried stream message failed and removes optimistic row on send error", async () => {
    vi.mocked(sendMessage).mockRejectedValueOnce(new Error("network"));
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

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: "engineering",
          streamId: 5,
          subject: "general",
          local_id: "-1",
        }),
      );
      expect(params.removeMessage).toHaveBeenCalledWith(-3);
      expect(params.removeMessage).toHaveBeenCalledWith(-1);
      expect(params.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: -1, delivery_status: "failed" }),
      );
    });
  });

  it("marks retried message failed when sendMessage rejects", async () => {
    vi.mocked(sendMessage).mockRejectedValueOnce(new Error("network"));
    const params = defaultParams();
    const { result } = renderHook(() => useChatPageSendMessage(params));

    await act(async () => {
      await result.current.handleRetryFailedOutgoing(failedOutgoing());
    });

    await waitFor(() => {
      expect(params.removeMessage).toHaveBeenCalledWith(-3);
      expect(params.removeMessage).toHaveBeenCalledWith(-1);
      expect(params.setSendError).toHaveBeenCalledWith("network");
      expect(params.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: -1, delivery_status: "failed" }),
      );
    });
  });
});
