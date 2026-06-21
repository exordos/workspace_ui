import { describe, expect, it, vi, beforeEach } from "vitest";
import { sendMessage } from "~/shared/api/messenger-messages";
import type { MockMessage } from "~/shared/api/messenger.types";
import { createMessage, testMessageId } from "~/test/factories";
import { executeChatPageSend, type ChatPageSendHandlerDeps } from "./chat-page-send-handler.lib";

vi.mock("~/shared/api/messenger-messages", () => ({
  sendMessage: vi.fn(),
}));

vi.mock("./chat-send-delivery.lib", () => ({
  buildOptimisticOutgoingMessage: vi.fn((options: { id: number; content: string }) => ({
    id: options.id,
    content: options.content,
    delivery_status: "pending",
  })),
  markOutgoingMessageFailed: vi.fn((message: MockMessage) => ({
    ...message,
    delivery_status: "failed",
  })),
}));

vi.mock("~/i18n/i18n", () => ({
  t: (key: string) => key,
}));

function createDeps(overrides: Partial<ChatPageSendHandlerDeps> = {}): ChatPageSendHandlerDeps & {
  appendMessage: ReturnType<typeof vi.fn>;
  commitOutgoingMessage: ReturnType<typeof vi.fn>;
} {
  const appendMessage = vi.fn();
  const commitOutgoingMessage = vi.fn();
  return {
    currentUserId: 7,
    isDmView: false,
    activeDmUserIds: null,
    activeStream: "Engineering",
    activeStreamCanonicalName: "engineering",
    activeStreamId: 10,
    activeTopic: "",
    allocateOptimisticMessageId: () => -1,
    appendMessage,
    commitOutgoingMessage,
    requestScrollToBottom: vi.fn(),
    clearReplyQuote: vi.fn(),
    stopTyping: vi.fn(),
    setSendError: vi.fn(),
    setUploadProgress: vi.fn(),
    setUploadAbortController: vi.fn(),
    releaseUploadAbortController: vi.fn(),
    ...overrides,
  } as ChatPageSendHandlerDeps & {
    appendMessage: ReturnType<typeof vi.fn>;
    commitOutgoingMessage: ReturnType<typeof vi.fn>;
  };
}

describe("executeChatPageSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendMessage).mockResolvedValue(createMessage({ id: 99 }));
  });

  it("sends the system general chat as an empty Workspace subject", async () => {
    const deps = createDeps();

    await executeChatPageSend(deps, "hello");

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: "engineering",
        streamId: 10,
        subject: "",
        content: "hello",
      }),
    );
    expect(deps.commitOutgoingMessage).toHaveBeenCalledWith(
      -1,
      expect.objectContaining({ id: testMessageId(99) }),
    );
  });
});
