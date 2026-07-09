import { describe, expect, it, vi, beforeEach } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { executeChatPageSend, type ChatPageSendHandlerDeps } from "./chat-page-send-handler.lib";

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
  });

  it("adds a failed local message for legacy stream sends without HTTP", async () => {
    const deps = createDeps();

    await expect(executeChatPageSend(deps, "hello")).rejects.toThrow("message.sendFailed");

    expect(deps.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: -1, content: "hello", delivery_status: "failed" }),
    );
    expect(deps.commitOutgoingMessage).not.toHaveBeenCalled();
    expect(deps.clearReplyQuote).not.toHaveBeenCalled();
    expect(deps.stopTyping).not.toHaveBeenCalled();
    expect(deps.setSendError).toHaveBeenCalledWith("message.sendFailed");
    expect(deps.setUploadProgress).toHaveBeenLastCalledWith(null);
  });

  it("adds a failed local message for legacy DM sends without HTTP", async () => {
    const deps = createDeps({
      isDmView: true,
      activeDmUserIds: [42],
      activeStream: null,
      activeStreamCanonicalName: null,
      activeStreamId: null,
    });

    await expect(executeChatPageSend(deps, "hello")).rejects.toThrow("message.sendFailed");

    expect(deps.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: -1, content: "hello", delivery_status: "failed" }),
    );
    expect(deps.commitOutgoingMessage).not.toHaveBeenCalled();
  });

  it("rejects legacy file sends before message send starts", async () => {
    const deps = createDeps();
    const file = new File(["payload"], "report.txt", { type: "text/plain" });

    await expect(executeChatPageSend(deps, "hello", undefined, [file])).rejects.toThrow(
      "message.fileUploadUnsupported",
    );

    expect(deps.appendMessage).not.toHaveBeenCalled();
    expect(deps.setSendError).toHaveBeenCalledWith("message.fileUploadUnsupported");
    expect(deps.setUploadProgress).toHaveBeenLastCalledWith(null);
    expect(deps.setUploadAbortController).not.toHaveBeenCalled();
  });
});
