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

const optimisticMessageUuid = "11111111-1111-4111-8111-111111111111";

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
    activeStreamUuid: "22222222-2222-4222-8222-222222222222",
    activeTopic: "",
    activeTopicUuid: null,
    allocateOptimisticMessageId: () => optimisticMessageUuid,
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
        streamUuid: "22222222-2222-4222-8222-222222222222",
        messageUuid: optimisticMessageUuid,
        subject: "",
        content: "hello",
      }),
    );
    expect(deps.commitOutgoingMessage).toHaveBeenCalledWith(
      optimisticMessageUuid,
      expect.objectContaining({ id: testMessageId(99) }),
    );
  });

  it("sends DM when stream uuid is resolved even without numeric peer ids", async () => {
    const streamUuid = "5d4ad324-de78-49ac-9759-ed3d0758fa16";
    const deps = createDeps({
      isDmView: true,
      activeDmUserIds: [],
      activeStream: null,
      activeStreamCanonicalName: null,
      activeStreamId: null,
      activeStreamUuid: streamUuid,
    });

    await executeChatPageSend(deps, "hello dm");

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        streamUuid,
        content: "hello dm",
      }),
    );
  });

  it("fails loudly instead of silently skipping DM send without stream uuid", async () => {
    const deps = createDeps({
      isDmView: true,
      activeDmUserIds: [],
      activeStream: null,
      activeStreamCanonicalName: null,
      activeStreamId: null,
      activeStreamUuid: null,
    });

    await expect(executeChatPageSend(deps, "hello dm")).rejects.toThrow("message.sendFailed");

    expect(sendMessage).not.toHaveBeenCalled();
    expect(deps.setSendError).toHaveBeenCalledWith("message.sendFailed");
  });
});
